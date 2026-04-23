export interface VoiceTranspositionAdmissibilityIndex {
    readonly targetChainLength: number;
    readonly voiceCount: number;
    readonly transpositionCount: number;
    readonly transitionCount: number;
    has(i: number, vPrev: number, vCurr: number, tPrevIdx: number, tCurrIdx: number): boolean;
    hasAnyTranspositionPair(i: number, vPrev: number, vCurr: number): boolean;
    hasAnyVoicePairAtPosition(i: number): boolean;
}

export interface BuildVoiceTranspositionAdmissibilityParams {
    targetChainLength: number;
    voiceCount: number;
    transpositionCount: number;
    rootVoiceIndex?: number;
    transpositionPairPredicate?: (tPrevIdx: number, tCurrIdx: number) => boolean;
}

interface FSMState {
    position: number;
    currentVoice: number;
    lastSeen: Int16Array;
    seenSinceLast: bigint[];
    terminalCoverageMask: bigint;
}

const popcountBigInt = (value: bigint): number => {
    let v = value;
    let count = 0;
    while (v !== 0n) {
        count++;
        v &= v - 1n;
    }
    return count;
};

const encodeStateKey = (
    position: number,
    currentVoice: number,
    lastSeen: Int16Array,
    seenSinceLast: readonly bigint[],
    terminalCoverageMask: bigint
): string => {
    const lastSeenPart = Array.from(lastSeen).join(',');
    const seenPart = seenSinceLast.map((mask) => mask.toString()).join(',');
    return `${position}|${currentVoice}|${terminalCoverageMask.toString()}|${lastSeenPart}|${seenPart}`;
};

class DenseVoiceTranspositionAdmissibilityIndex implements VoiceTranspositionAdmissibilityIndex {
    public readonly targetChainLength: number;
    public readonly voiceCount: number;
    public readonly transpositionCount: number;
    public readonly transitionCount: number;

    private readonly tupleCount: number;
    private readonly bitset: Uint32Array;
    private readonly anyTranspositionByEdge: Uint8Array;
    private readonly anyVoicePairByPosition: Uint8Array;

    public constructor(targetChainLength: number, voiceCount: number, transpositionCount: number) {
        this.targetChainLength = targetChainLength;
        this.voiceCount = voiceCount;
        this.transpositionCount = transpositionCount;
        this.tupleCount = (targetChainLength + 1) * voiceCount * voiceCount * transpositionCount * transpositionCount;
        this.bitset = new Uint32Array(Math.ceil(this.tupleCount / 32));
        this.anyTranspositionByEdge = new Uint8Array((targetChainLength + 1) * voiceCount * voiceCount);
        this.anyVoicePairByPosition = new Uint8Array(targetChainLength + 1);
        this.transitionCount = 0;
    }

    private edgeOffset(i: number, vPrev: number, vCurr: number): number {
        return ((i * this.voiceCount + vPrev) * this.voiceCount) + vCurr;
    }

    private tupleOffset(i: number, vPrev: number, vCurr: number, tPrevIdx: number, tCurrIdx: number): number {
        return (((((i * this.voiceCount) + vPrev) * this.voiceCount + vCurr) * this.transpositionCount + tPrevIdx) * this.transpositionCount) + tCurrIdx;
    }

    public setAllTranspositionPairs(i: number, vPrev: number, vCurr: number): void {
        const edge = this.edgeOffset(i, vPrev, vCurr);
        this.anyTranspositionByEdge[edge] = 1;
        this.anyVoicePairByPosition[i] = 1;
        for (let tPrevIdx = 0; tPrevIdx < this.transpositionCount; tPrevIdx++) {
            for (let tCurrIdx = 0; tCurrIdx < this.transpositionCount; tCurrIdx++) {
                const tuple = this.tupleOffset(i, vPrev, vCurr, tPrevIdx, tCurrIdx);
                this.bitset[tuple >>> 5] |= (1 << (tuple & 31));
            }
        }
    }

    public setTranspositionPairsByPredicate(
        i: number,
        vPrev: number,
        vCurr: number,
        predicate: (tPrevIdx: number, tCurrIdx: number) => boolean
    ): void {
        const edge = this.edgeOffset(i, vPrev, vCurr);
        let hasAny = false;
        for (let tPrevIdx = 0; tPrevIdx < this.transpositionCount; tPrevIdx++) {
            for (let tCurrIdx = 0; tCurrIdx < this.transpositionCount; tCurrIdx++) {
                if (!predicate(tPrevIdx, tCurrIdx)) continue;
                const tuple = this.tupleOffset(i, vPrev, vCurr, tPrevIdx, tCurrIdx);
                this.bitset[tuple >>> 5] |= (1 << (tuple & 31));
                hasAny = true;
            }
        }
        if (hasAny) {
            this.anyTranspositionByEdge[edge] = 1;
            this.anyVoicePairByPosition[i] = 1;
        }
    }

    public has(i: number, vPrev: number, vCurr: number, tPrevIdx: number, tCurrIdx: number): boolean {
        if (i < 0 || i > this.targetChainLength) return false;
        if (vPrev < 0 || vPrev >= this.voiceCount || vCurr < 0 || vCurr >= this.voiceCount) return false;
        if (tPrevIdx < 0 || tPrevIdx >= this.transpositionCount || tCurrIdx < 0 || tCurrIdx >= this.transpositionCount) return false;
        const tuple = this.tupleOffset(i, vPrev, vCurr, tPrevIdx, tCurrIdx);
        return (this.bitset[tuple >>> 5] & (1 << (tuple & 31))) !== 0;
    }

    public hasAnyTranspositionPair(i: number, vPrev: number, vCurr: number): boolean {
        if (i < 0 || i > this.targetChainLength) return false;
        if (vPrev < 0 || vPrev >= this.voiceCount || vCurr < 0 || vCurr >= this.voiceCount) return false;
        return this.anyTranspositionByEdge[this.edgeOffset(i, vPrev, vCurr)] === 1;
    }

    public hasAnyVoicePairAtPosition(i: number): boolean {
        if (i < 0 || i > this.targetChainLength) return false;
        return this.anyVoicePairByPosition[i] === 1;
    }
}

export function buildVoiceTranspositionAdmissibilityIndex(
    params: BuildVoiceTranspositionAdmissibilityParams
): VoiceTranspositionAdmissibilityIndex {
    const {
        targetChainLength,
        voiceCount,
        transpositionCount,
        rootVoiceIndex = 0,
        transpositionPairPredicate
    } = params;
    if (!Number.isInteger(targetChainLength) || targetChainLength < 1) {
        throw new Error(`targetChainLength must be an integer >= 1. Received ${targetChainLength}`);
    }
    if (!Number.isInteger(voiceCount) || voiceCount < 1) {
        throw new Error(`voiceCount must be an integer >= 1. Received ${voiceCount}`);
    }
    if (!Number.isInteger(transpositionCount) || transpositionCount < 1) {
        throw new Error(`transpositionCount must be an integer >= 1. Received ${transpositionCount}`);
    }
    if (!Number.isInteger(rootVoiceIndex) || rootVoiceIndex < 0 || rootVoiceIndex >= voiceCount) {
        throw new Error(`rootVoiceIndex must be in [0, ${voiceCount - 1}]. Received ${rootVoiceIndex}`);
    }

    const index = new DenseVoiceTranspositionAdmissibilityIndex(targetChainLength, voiceCount, transpositionCount);
    if (targetChainLength === 1) return index;

    const allVoicesMask = (1n << BigInt(voiceCount)) - 1n;
    const nonSelfMasks: bigint[] = Array.from({ length: voiceCount }, (_, voice) => allVoicesMask & ~(1n << BigInt(voice)));
    const terminalWindowStart = Math.max(0, targetChainLength - voiceCount);

    const initialLastSeen = new Int16Array(voiceCount).fill(-1);
    initialLastSeen[rootVoiceIndex] = 0;
    const initialSeenSinceLast = Array.from({ length: voiceCount }, () => 0n);
    const initialTerminalCoverage = terminalWindowStart === 0 ? (1n << BigInt(rootVoiceIndex)) : 0n;

    const stack: FSMState[] = [{
        position: 0,
        currentVoice: rootVoiceIndex,
        lastSeen: initialLastSeen,
        seenSinceLast: initialSeenSinceLast,
        terminalCoverageMask: initialTerminalCoverage
    }];
    const visited = new Set<string>();

    while (stack.length > 0) {
        const state = stack.pop()!;
        if (state.position >= targetChainLength - 1) continue;

        let obligationMask = 0n;
        for (let voice = 0; voice < voiceCount; voice++) {
            if (state.lastSeen[voice] < 0) continue;
            const fullMask = nonSelfMasks[voice];
            if ((state.seenSinceLast[voice] & fullMask) === fullMask) {
                obligationMask |= (1n << BigInt(voice));
            }
        }

        for (let nextVoice = 0; nextVoice < voiceCount; nextVoice++) {
            const nextBit = 1n << BigInt(nextVoice);
            const hasSeenBefore = state.lastSeen[nextVoice] >= 0;

            if (hasSeenBefore) {
                const distinctOthers = popcountBigInt(state.seenSinceLast[nextVoice] & nonSelfMasks[nextVoice]);
                if (distinctOthers < Math.max(0, voiceCount - 2)) continue;
                if (obligationMask !== 0n && (obligationMask & nextBit) === 0n) continue;
            }

            const nextPosition = state.position + 1;
            let nextCoverageMask = state.terminalCoverageMask;
            if (nextPosition >= terminalWindowStart) {
                nextCoverageMask |= nextBit;
            }
            const remainingSlots = (targetChainLength - 1) - nextPosition;
            const missingVoicesMask = allVoicesMask & ~nextCoverageMask;
            if (popcountBigInt(missingVoicesMask) > remainingSlots) continue;
            if (nextPosition === targetChainLength - 1 && nextCoverageMask !== allVoicesMask) continue;

            if (transpositionPairPredicate) {
                index.setTranspositionPairsByPredicate(
                    nextPosition,
                    state.currentVoice,
                    nextVoice,
                    transpositionPairPredicate
                );
            } else {
                index.setAllTranspositionPairs(nextPosition, state.currentVoice, nextVoice);
            }

            const nextLastSeen = Int16Array.from(state.lastSeen);
            const nextSeenSinceLast = state.seenSinceLast.slice();
            for (let voice = 0; voice < voiceCount; voice++) {
                if (nextLastSeen[voice] >= 0 && voice !== nextVoice) {
                    nextSeenSinceLast[voice] |= nextBit;
                }
            }
            nextLastSeen[nextVoice] = nextPosition;
            nextSeenSinceLast[nextVoice] = 0n;

            const visitKey = encodeStateKey(nextPosition, nextVoice, nextLastSeen, nextSeenSinceLast, nextCoverageMask);
            if (visited.has(visitKey)) continue;
            visited.add(visitKey);
            stack.push({
                position: nextPosition,
                currentVoice: nextVoice,
                lastSeen: nextLastSeen,
                seenSinceLast: nextSeenSinceLast,
                terminalCoverageMask: nextCoverageMask
            });
        }
    }

    return index;
}
