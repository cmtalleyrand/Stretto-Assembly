import assert from 'node:assert/strict';
import { buildVoiceTranspositionAdmissibilityIndex } from './voiceTranspositionAdmissibility';

const index = buildVoiceTranspositionAdmissibilityIndex({
    targetChainLength: 8,
    voiceCount: 4,
    transpositionCount: 3,
    rootVoiceIndex: 0
});

// Cooldown: with 4 voices, a repeated voice requires at least 2 distinct non-self voices since last use.
assert.equal(index.hasAnyTranspositionPair(1, 0, 0), false, 'i=1 cannot repeat root voice immediately');
assert.equal(index.hasAnyTranspositionPair(3, 2, 0), true, 'i=3 can return to voice 0 after two distinct non-0 voices');

// Obligation: once all other voices have appeared since a voice was used, that voice is obligated before non-obligated repeats.
assert.equal(index.hasAnyTranspositionPair(4, 3, 1), false, 'i=4 cannot repeat non-obligated voice 1 when voice 0 is obligated');
assert.equal(index.hasAnyTranspositionPair(4, 3, 0), true, 'i=4 can satisfy the obligation by returning to voice 0');

// Terminal coverage: entries in [targetChainLength - nVoices, targetChainLength - 1] must cover all voices.
assert.equal(index.hasAnyTranspositionPair(7, 0, 0), false, 'i=7 cannot end with duplicate-only coverage in the terminal 4-entry window');
assert.equal(index.hasAnyTranspositionPair(7, 2, 3), true, 'i=7 allows transitions compatible with full terminal coverage');

// O(1) tuple keying includes transposition pair dimensions.
for (let tPrevIdx = 0; tPrevIdx < 3; tPrevIdx++) {
    for (let tCurrIdx = 0; tCurrIdx < 3; tCurrIdx++) {
        assert.equal(index.has(4, 3, 0, tPrevIdx, tCurrIdx), true, 'admissible edge must be set for all transposition index pairs');
        assert.equal(index.has(4, 3, 1, tPrevIdx, tCurrIdx), false, 'inadmissible edge must be unset for all transposition index pairs');
    }
}

console.log('voiceTranspositionAdmissibility.test: all assertions passed.');

const transpositions = [0, 12, 15];
const prunedByAdjacentSeparation = buildVoiceTranspositionAdmissibilityIndex({
    targetChainLength: 8,
    voiceCount: 4,
    transpositionCount: transpositions.length,
    rootVoiceIndex: 0,
    transpositionPairPredicate: (tPrevIdx, tCurrIdx) => Math.abs(transpositions[tCurrIdx] - transpositions[tPrevIdx]) >= 5
});

// Adjacent-transposition rule: absolute deltas below 5 semitones are illegal for immediate neighbors.
// Example raised in review: +15 followed by +12 (delta -3) must be pruned by the index.
assert.equal(
    prunedByAdjacentSeparation.has(4, 3, 0, 2, 1),
    false,
    'adjacent transition +15 -> +12 (|Δ|=3) must be inadmissible'
);
assert.equal(
    prunedByAdjacentSeparation.has(4, 3, 0, 1, 0),
    true,
    'adjacent transition +12 -> 0 (|Δ|=12) remains admissible'
);

console.log('voiceTranspositionAdmissibility.test: predicate-filter assertions passed.');
