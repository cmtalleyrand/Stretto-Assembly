export type TranspositionIndex = number & { readonly __brand: 'TranspositionIndex' };

export const enum TranspositionRuleMask {
    RestrictedIntervalClass = 1 << 0,
    FreeIntervalClass = 1 << 1,
    MeetsAdjacentSeparation = 1 << 2,
    ParallelPerfect58Class = 1 << 3
}

const RESTRICTED_INTERVAL_CLASSES = new Set([3, 4, 8, 9]);
const FREE_INTERVAL_CLASSES = new Set([0, 5, 7]);
const PARALLEL_PERFECT_58_INTERVAL_CLASSES = new Set([0, 7]);

export interface TranspositionRuleTableView {
    readonly size: number;
    indexOf(transpositionDelta: number): TranspositionIndex | undefined;
    deltaAt(index: TranspositionIndex): number;
    intervalClassAt(index: TranspositionIndex): number;
    isRestrictedAt(index: TranspositionIndex): boolean;
    isFreeAt(index: TranspositionIndex): boolean;
    meetsAdjacentSeparationAt(index: TranspositionIndex): boolean;
    ruleMaskAt(index: TranspositionIndex): number;
}

function toIntervalClass(transpositionDelta: number): number {
    return ((transpositionDelta % 12) + 12) % 12;
}

function toTranspositionIndex(index: number): TranspositionIndex {
    return index as TranspositionIndex;
}

function assertValidIndex(index: TranspositionIndex, size: number): number {
    const numericIndex = index as number;
    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= size) {
        throw new RangeError(`TranspositionIndex out of bounds: ${numericIndex} (size=${size})`);
    }
    return numericIndex;
}

/**
 * Builds immutable transposition rule tables keyed by stable TranspositionIndex values.
 * Complexity: O(n) time and O(n) memory, where n = distinct transposition deltas.
 */
export function buildTranspositionRuleTables(transpositionDeltas: readonly number[]): TranspositionRuleTableView {
    const uniqueDeltas = Array.from(new Set(transpositionDeltas));
    const size = uniqueDeltas.length;
    const deltaByIndex = Int16Array.from(uniqueDeltas);
    const intervalClassByIndex = Uint8Array.from(uniqueDeltas, toIntervalClass);
    const ruleMaskByIndex = Uint8Array.from(uniqueDeltas, (delta) => {
        const intervalClass = toIntervalClass(delta);
        let mask = 0;
        if (RESTRICTED_INTERVAL_CLASSES.has(intervalClass)) mask |= TranspositionRuleMask.RestrictedIntervalClass;
        if (FREE_INTERVAL_CLASSES.has(intervalClass)) mask |= TranspositionRuleMask.FreeIntervalClass;
        if (Math.abs(delta) >= 5) mask |= TranspositionRuleMask.MeetsAdjacentSeparation;
        if (PARALLEL_PERFECT_58_INTERVAL_CLASSES.has(intervalClass)) mask |= TranspositionRuleMask.ParallelPerfect58Class;
        return mask;
    });

    const indexByDelta = new Map<number, TranspositionIndex>();
    for (let i = 0; i < size; i++) {
        indexByDelta.set(deltaByIndex[i], toTranspositionIndex(i));
    }

    const tableView: TranspositionRuleTableView = {
        size,
        indexOf(transpositionDelta: number): TranspositionIndex | undefined {
            return indexByDelta.get(transpositionDelta);
        },
        deltaAt(index: TranspositionIndex): number {
            return deltaByIndex[assertValidIndex(index, size)];
        },
        intervalClassAt(index: TranspositionIndex): number {
            return intervalClassByIndex[assertValidIndex(index, size)];
        },
        isRestrictedAt(index: TranspositionIndex): boolean {
            return (ruleMaskByIndex[assertValidIndex(index, size)] & TranspositionRuleMask.RestrictedIntervalClass) !== 0;
        },
        isFreeAt(index: TranspositionIndex): boolean {
            return (ruleMaskByIndex[assertValidIndex(index, size)] & TranspositionRuleMask.FreeIntervalClass) !== 0;
        },
        meetsAdjacentSeparationAt(index: TranspositionIndex): boolean {
            return (ruleMaskByIndex[assertValidIndex(index, size)] & TranspositionRuleMask.MeetsAdjacentSeparation) !== 0;
        },
        ruleMaskAt(index: TranspositionIndex): number {
            return ruleMaskByIndex[assertValidIndex(index, size)];
        }
    };

    return Object.freeze(tableView);
}
