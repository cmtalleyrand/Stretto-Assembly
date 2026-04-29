// Model A — full-length delay-variant enumerator.
//
// Emits every (d_1..d_n, varIdx_1..varIdx_n) sequence consistent with rules
// A.1, A.2, A.3, A.4, A.5, A.6, A.8, A.9, A.10 and the variant quotas
// (nInv, nTrunc). Transposition and voice are not touched here.
//
// Stage 0 in the new pipeline; replaces the per-position transition emission
// of buildDelayVariantAdmissibilityModel for the join-driven search path.

import { StrettoSearchOptions, StrettoConstraintMode } from '../../types';
import { SubjectVariant } from './strettoScoring';
import { shouldYieldToEventLoop } from './strettoGenerator';

export interface DelayVariantSequence {
    // Delays in ticks, length n. delays[0] is the gap from e_0 (root) to e_1.
    delays: Int32Array;
    // Variant index per entry, length n+1 including the root at index 0 (always 0).
    variants: Uint8Array;
    nInv: number;
    nTrunc: number;
}

export interface DelayVariantModelStats {
    statesVisited: number;
    sequencesEmitted: number;
    truncatedAtCap: boolean;
}

export interface DelayVariantModelOptions {
    // Hard ceiling on emitted sequences. If reached, emission stops and
    // truncatedAtCap is set. Use Infinity to disable.
    maxSequences?: number;
    // Optional consumer for streaming. If provided, sequences are NOT
    // accumulated into the returned array (returned array will be empty).
    onSequence?: (seq: DelayVariantSequence) => void;
}

export interface DelayVariantModelResult {
    sequences: DelayVariantSequence[];
    stats: DelayVariantModelStats;
}

function quotaAllows(mode: StrettoConstraintMode, current: number): boolean {
    if (mode === 'None') return false;
    if (typeof mode === 'number') return current < mode;
    return true;
}

// A.1 threshold: a delay is "long" if delayTicks > Sb/3. Long delays must be
// unique across the entire chain.
function isLongDelay(delayTicks: number, fullSubjectTicks: number): boolean {
    return delayTicks * 3 > fullSubjectTicks;
}

export async function buildDelayVariantSequences(
    variants: SubjectVariant[],
    delayStep: number,
    targetChainLength: number,
    options: StrettoSearchOptions,
    modelOptions: DelayVariantModelOptions = {}
): Promise<DelayVariantModelResult> {
    const { maxSequences = Infinity, onSequence } = modelOptions;
    const accumulate = !onSequence;

    const isCanonDelaySearch = options.delaySearchCategory === 'canon';
    const ppq = delayStep * 2;
    const canonMinRaw = Math.round((options.canonDelayMinBeats ?? 1) * ppq);
    const canonMaxRaw = Math.round((options.canonDelayMaxBeats ?? 4) * ppq);
    const canonLowerTicks = Math.max(delayStep, Math.min(canonMinRaw, canonMaxRaw));
    const canonUpperTicks = Math.max(delayStep, Math.max(canonMinRaw, canonMaxRaw));
    const canonDelayMinTicks = Math.ceil(canonLowerTicks / delayStep) * delayStep;
    const canonDelayMaxTicks = Math.floor(canonUpperTicks / delayStep) * delayStep;
    const canonOk = (d: number) => !isCanonDelaySearch || (d >= canonDelayMinTicks && d <= canonDelayMaxTicks);

    const fullSubjectTicks = variants[0].lengthTicks;
    const fullSubjectHalfTicks = fullSubjectTicks / 2;

    // Pre-compute variant flags.
    const vIsInv: boolean[] = variants.map(v => v.type === 'I');
    const vIsTrunc: boolean[] = variants.map(v => v.truncationBeats > 0);
    const vLengthTicks: number[] = variants.map(v => v.lengthTicks);

    // Walking arrays — n internal entries (e_1..e_n) plus root e_0 fixed at variant 0.
    // Chain length convention here matches the existing code: targetChainLength is
    // the number of entries in the chain, including e_0. We emit (targetChainLength)
    // variants and (targetChainLength - 1) delays.
    const n = targetChainLength;
    if (n < 2) {
        return {
            sequences: [],
            stats: { statesVisited: 0, sequencesEmitted: 0, truncatedAtCap: false }
        };
    }

    const variantStack = new Uint8Array(n);
    const delayStack = new Int32Array(n - 1);
    variantStack[0] = 0;

    // A.1 tracker: set of long delays already used. Encoded as a Map<number, count>
    // for O(1) push/pop on the DFS stack.
    const usedLongDelays = new Map<number, number>();

    const sequences: DelayVariantSequence[] = [];
    let statesVisited = 0;
    let sequencesEmitted = 0;
    let truncatedAtCap = false;
    let operationCounter = 0;

    const emit = (nInv: number, nTrunc: number) => {
        const seq: DelayVariantSequence = {
            delays: delayStack.slice(),
            variants: variantStack.slice(),
            nInv,
            nTrunc
        };
        sequencesEmitted++;
        if (onSequence) onSequence(seq);
        if (accumulate) sequences.push(seq);
    };

    async function dfs(
        depth: number,         // index of NEXT entry to place (1..n-1 means placing e_depth)
        prevVariantIdx: number,
        prevEntryLengthTicks: number,
        prevDelayTicks: number,        // delay leading INTO the previous entry; -1 for depth==1
        prevPrevDelayTicks: number,    // -1 if not applicable
        nInv: number,
        nTrunc: number
    ): Promise<boolean> {
        statesVisited++;
        operationCounter++;
        if (shouldYieldToEventLoop(operationCounter)) {
            await new Promise<void>((r) => setTimeout(r, 0));
        }

        // Determine min/max delay for this position.
        let minD = delayStep;
        let maxD = Math.floor(prevEntryLengthTicks * (2 / 3)); // A.6
        if (depth === 1) {
            if (isCanonDelaySearch) {
                minD = canonDelayMinTicks;
                maxD = canonDelayMaxTicks;
            } else {
                minD = Math.floor(prevEntryLengthTicks * 0.5); // first delay ≥ Sb/2 by convention
            }
        } else {
            if (isCanonDelaySearch) {
                minD = prevDelayTicks;
                maxD = prevDelayTicks;
            } else {
                // A.5 max contraction: d_{n-1} − d_n ≤ Sb/4, so d_n ≥ prev − Sb/4
                minD = Math.max(minD, prevDelayTicks - Math.floor(prevEntryLengthTicks / 4));
                // A.3 expansion recoil: if prev>prevprev and prev>Sb/3, then d_n < prevprev − 0.5 beats
                if (prevPrevDelayTicks >= 0
                    && prevDelayTicks > prevPrevDelayTicks
                    && prevDelayTicks * 3 > prevEntryLengthTicks) {
                    maxD = Math.min(maxD, prevPrevDelayTicks - delayStep);
                }
            }
        }
        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;
        if (minD > maxD) return false;

        const halfPrev = prevEntryLengthTicks / 2;

        for (let delayTicks = minD; delayTicks <= maxD; delayTicks += delayStep) {
            if (!canonOk(delayTicks)) continue;

            // A.2 OR-form trigger: if prev≥Sb/2 or curr≥Sb/2 then curr<prev.
            if (depth >= 2 && !isCanonDelaySearch
                && (prevDelayTicks >= halfPrev || delayTicks >= halfPrev)
                && delayTicks >= prevDelayTicks) continue;

            // A.1 long-delay global uniqueness.
            const isLong = !isCanonDelaySearch && isLongDelay(delayTicks, fullSubjectTicks);
            if (isLong && usedLongDelays.has(delayTicks)) continue;

            // A.4 post-truncation contraction: if prev variant was truncated, contract
            // by ≥ 1 beat — unless prev delay < Sb/3.
            if (depth >= 2 && vIsTrunc[prevVariantIdx]
                && prevDelayTicks * 3 >= prevEntryLengthTicks
                && (prevDelayTicks - delayTicks) < ppq) continue;

            for (let nextVariantIdx = 0; nextVariantIdx < variants.length; nextVariantIdx++) {
                const isInv = vIsInv[nextVariantIdx];
                const isTrunc = vIsTrunc[nextVariantIdx];
                const prevIsInv = vIsInv[prevVariantIdx];
                const prevIsTrunc = vIsTrunc[prevVariantIdx];

                // A.8 transform-following normality
                if ((prevIsInv || prevIsTrunc) && (isInv || isTrunc)) continue;
                // A.9 first internal entry (e_1) must not be inverted
                if (depth === 1 && isInv) continue;
                // A.10 no truncation at delay >= Sb/2
                if (!isCanonDelaySearch && isTrunc && delayTicks >= fullSubjectHalfTicks) continue;
                // Quotas
                if (isInv && !quotaAllows(options.inversionMode, nInv)) continue;
                if (isTrunc && !quotaAllows(options.truncationMode, nTrunc)) continue;

                // Push frame.
                variantStack[depth] = nextVariantIdx;
                delayStack[depth - 1] = delayTicks;
                if (isLong) usedLongDelays.set(delayTicks, (usedLongDelays.get(delayTicks) ?? 0) + 1);

                if (depth === n - 1) {
                    emit(
                        nInv + (isInv ? 1 : 0),
                        nTrunc + (isTrunc ? 1 : 0)
                    );
                    if (sequencesEmitted >= maxSequences) {
                        truncatedAtCap = true;
                        if (isLong) {
                            const c = usedLongDelays.get(delayTicks)!;
                            if (c <= 1) usedLongDelays.delete(delayTicks);
                            else usedLongDelays.set(delayTicks, c - 1);
                        }
                        return true;
                    }
                } else {
                    const stop = await dfs(
                        depth + 1,
                        nextVariantIdx,
                        vLengthTicks[nextVariantIdx],
                        delayTicks,
                        depth >= 2 ? prevDelayTicks : -1,
                        nInv + (isInv ? 1 : 0),
                        nTrunc + (isTrunc ? 1 : 0)
                    );
                    if (stop) {
                        if (isLong) {
                            const c = usedLongDelays.get(delayTicks)!;
                            if (c <= 1) usedLongDelays.delete(delayTicks);
                            else usedLongDelays.set(delayTicks, c - 1);
                        }
                        return true;
                    }
                }

                // Pop long-delay marker.
                if (isLong) {
                    const c = usedLongDelays.get(delayTicks)!;
                    if (c <= 1) usedLongDelays.delete(delayTicks);
                    else usedLongDelays.set(delayTicks, c - 1);
                }
            }
        }

        return false;
    }

    await dfs(1, 0, vLengthTicks[0], -1, -1, 0, 0);

    return {
        sequences,
        stats: { statesVisited, sequencesEmitted, truncatedAtCap }
    };
}
