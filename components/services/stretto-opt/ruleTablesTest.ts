import assert from 'node:assert/strict';
import { buildTranspositionRuleTables, TranspositionRuleMask } from './ruleTables';

function intervalClassLegacy(transposition: number): number {
    return ((transposition % 12) + 12) % 12;
}

function isRestrictedLegacy(intervalClass: number): boolean {
    return [3, 4, 8, 9].includes(intervalClass);
}

function isFreeLegacy(intervalClass: number): boolean {
    return [0, 5, 7].includes(intervalClass);
}

function meetsAdjacentSeparationLegacy(transposition: number): boolean {
    return Math.abs(transposition) >= 5;
}

const representativeDeltas = [-24, -13, -12, -9, -5, -4, 0, 4, 5, 7, 19];
const table = buildTranspositionRuleTables(representativeDeltas);

assert.equal(table.size, representativeDeltas.length, 'table cardinality must preserve distinct input deltas');

for (const transpositionDelta of representativeDeltas) {
    const index = table.indexOf(transpositionDelta);
    assert.notEqual(index, undefined, `missing index for transposition delta ${transpositionDelta}`);

    const intervalClass = intervalClassLegacy(transpositionDelta);
    const isRestricted = isRestrictedLegacy(intervalClass);
    const isFree = isFreeLegacy(intervalClass);
    const meetsAdjacentSeparation = meetsAdjacentSeparationLegacy(transpositionDelta);

    assert.equal(table.deltaAt(index!), transpositionDelta, `delta round-trip failed for ${transpositionDelta}`);
    assert.equal(table.intervalClassAt(index!), intervalClass, `interval class mismatch for ${transpositionDelta}`);
    assert.equal(table.isRestrictedAt(index!), isRestricted, `restricted mismatch for ${transpositionDelta}`);
    assert.equal(table.isFreeAt(index!), isFree, `free mismatch for ${transpositionDelta}`);
    assert.equal(table.meetsAdjacentSeparationAt(index!), meetsAdjacentSeparation, `adjacent separation mismatch for ${transpositionDelta}`);

    const mask = table.ruleMaskAt(index!);
    assert.equal((mask & TranspositionRuleMask.RestrictedIntervalClass) !== 0, isRestricted, `restricted mask mismatch for ${transpositionDelta}`);
    assert.equal((mask & TranspositionRuleMask.FreeIntervalClass) !== 0, isFree, `free mask mismatch for ${transpositionDelta}`);
    assert.equal((mask & TranspositionRuleMask.MeetsAdjacentSeparation) !== 0, meetsAdjacentSeparation, `adjacent separation mask mismatch for ${transpositionDelta}`);
    assert.equal((mask & TranspositionRuleMask.ParallelPerfect58Class) !== 0, [0, 7].includes(intervalClass), `parallel perfect mask mismatch for ${transpositionDelta}`);
}

// Edge deltas around the A.7 threshold: abs(t) >= 5
assert.equal(table.meetsAdjacentSeparationAt(table.indexOf(-5)!), true, 'delta -5 must satisfy adjacent-separation rule');
assert.equal(table.meetsAdjacentSeparationAt(table.indexOf(-4)!), false, 'delta -4 must violate adjacent-separation rule');
assert.equal(table.meetsAdjacentSeparationAt(table.indexOf(4)!), false, 'delta 4 must violate adjacent-separation rule');
assert.equal(table.meetsAdjacentSeparationAt(table.indexOf(5)!), true, 'delta 5 must satisfy adjacent-separation rule');

// Deduplication must preserve first appearance index for deterministic kernels.
const deduplicated = buildTranspositionRuleTables([7, 7, -5, -5, 7, 0]);
assert.equal(deduplicated.size, 3, 'duplicate transposition deltas must collapse to unique indices');
assert.equal(deduplicated.deltaAt(deduplicated.indexOf(7)!), 7);
assert.equal(deduplicated.deltaAt(deduplicated.indexOf(-5)!), -5);
assert.equal(deduplicated.deltaAt(deduplicated.indexOf(0)!), 0);

console.log('ruleTablesTest: all assertions passed.');
