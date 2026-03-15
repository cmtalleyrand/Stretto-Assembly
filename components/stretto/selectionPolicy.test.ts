import assert from 'node:assert/strict';
import { StrettoCandidate } from '../../types';
import { isCandidateAllowedByHardPairwisePolicy, pruneCheckedIdsByHardPairwisePolicy } from './selectionPolicy';

const candidate = (id: string, dissonanceRatio: number): StrettoCandidate => ({
    id,
    intervalSemis: 0,
    intervalLabel: id,
    delayBeats: 1,
    delayTicks: 480,
    grade: 'STRONG',
    errors: [],
    notes: [],
    dissonanceRatio,
    nctRatio: 0,
    pairDissonanceScore: 0,
    endsOnDissonance: false
});

const allowed = candidate('allowed', 0.4);
const disallowed = candidate('disallowed', 0.9);

assert.equal(isCandidateAllowedByHardPairwisePolicy(allowed, 0.5), true, 'hard-policy predicate must admit candidates at or below configured cap');
assert.equal(isCandidateAllowedByHardPairwisePolicy(disallowed, 0.5), false, 'hard-policy predicate must reject candidates above configured cap');

const checked = new Set<string>(['allowed', 'disallowed', 'missing']);
const pruned = pruneCheckedIdsByHardPairwisePolicy(checked, [allowed, disallowed], 0.5);
assert.deepEqual(Array.from(pruned.values()).sort(), ['allowed'], 'selection pruning must remove over-cap and stale ids so hidden disallowed candidates cannot remain actionable');

console.log('selectionPolicy.test: PASS');
