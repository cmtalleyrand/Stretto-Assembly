import assert from 'node:assert/strict';
import { violatesCombinedDissonanceStarts } from './strettoGenerator';

// A-B: run [15,16], gap, run [17,18]. A-C: run [16,17].
// Combined: [15,16] → [16,17] → [17,18] are adjacent → macro-run of 3 → violation.
const chainedRuns = [
  { startTick: 15, endTick: 16 },
  { startTick: 16, endTick: 17 },
  { startTick: 17, endTick: 18 },
];
assert.equal(
  violatesCombinedDissonanceStarts(chainedRuns, 480, 0),
  true,
  'Combined overlap-run constraint must reject a texture-level dissonance streak of 3.'
);

// Two runs separated by a genuine gap: macro-run of 1 each → no violation.
const separatedRuns = [
  { startTick: 120, endTick: 180 },
  { startTick: 360, endTick: 420 },
];
assert.equal(
  violatesCombinedDissonanceStarts(separatedRuns, 480, 0),
  false,
  'Combined overlap-run constraint must accept two separated single-run spans.'
);

// Two adjacent runs, both on weak beats → allowed (count 2, both weak).
const twoWeakRuns = [
  { startTick: 120, endTick: 240 },
  { startTick: 240, endTick: 360 },
];
assert.equal(
  violatesCombinedDissonanceStarts(twoWeakRuns, 480, 0),
  false,
  'Two adjacent weak-beat runs should not be rejected.'
);

// Two adjacent runs where first starts on a strong beat → C4A violation.
const strongThenAdjacent = [
  { startTick: 0, endTick: 120 },   // strong beat (tick 0 = beat 1)
  { startTick: 120, endTick: 240 },
];
assert.equal(
  violatesCombinedDissonanceStarts(strongThenAdjacent, 480, 0),
  true,
  'Adjacent run starting from a strong beat must be rejected (C4A).'
);

console.log('strettoCombinedOverlapRunTest passed');
