import assert from 'node:assert/strict';
import { runCanonSearch } from './canonSearch';
import type { CanonSearchOptions, RawNote } from '../../types';

const subject: RawNote[] = [
  { midi: 60, ticks: 0,    durationTicks: 1920, velocity: 90, name: 'C4', voiceIndex: 0 },
  { midi: 62, ticks: 1920, durationTicks: 1920, velocity: 90, name: 'D4', voiceIndex: 0 },
];

const baseOptions: CanonSearchOptions = {
  ensembleTotal: 4,
  delayMinBeats: 0.5,
  delayMaxBeats: 0.5,
  chainLengthMin: 4,
  chainLengthMax: 4,
  allowInversions: false,
  allowThirdSixth: false,
  pivotMidi: 60,
  useChromaticInversion: true,
  scaleRoot: 0,
  scaleMode: 'Major',
  subjectVoiceIndex: 0,
  transpositionMode: 'independent',
  dissonanceThreshold: 0.99, // near-open so we don't prune test cases
};

// ─── 4-voice independent mode ────────────────────────────────────────────────

const report4 = await runCanonSearch(subject, baseOptions, 480);

assert.ok(report4.results.length > 0,
  'Expected at least one viable 4-voice canon result');

// Every result must have exactly V transposition slots
assert.ok(
  report4.results.every(r => r.transpositionSteps.length === 4),
  'All 4-voice results must have exactly 4 transposition slots'
);

// Voice spacing rules: soprano (slot 0) must be higher than bass (slot 3) by ≥19 st
assert.ok(
  report4.results.every(r => r.transpositionSteps[0] - r.transpositionSteps[3] >= 19),
  'Soprano–bass gap must be ≥19 semitones in all results'
);

// Adjacent slots S–A and A–T: gap ∈ [3, 19]
assert.ok(
  report4.results.every(r => {
    const s = r.transpositionSteps;
    return (s[0] - s[1] >= 3 && s[0] - s[1] <= 19) &&
           (s[1] - s[2] >= 3 && s[1] - s[2] <= 19);
  }),
  'Soprano–Alto and Alto–Tenor gaps must each be in [3, 19]'
);

// Tenor–Bass gap: [7, 21]
assert.ok(
  report4.results.every(r => {
    const s = r.transpositionSteps;
    return s[2] - s[3] >= 7 && s[2] - s[3] <= 21;
  }),
  'Tenor–Bass gap must be in [7, 21]'
);

// ─── 5-voice independent mode ────────────────────────────────────────────────

const report5 = await runCanonSearch(
  subject,
  { ...baseOptions, ensembleTotal: 5, chainLengthMin: 5, chainLengthMax: 5 },
  480
);

assert.ok(report5.results.length > 0,
  'Expected at least one viable 5-voice canon result');

assert.ok(
  report5.results.every(r => r.transpositionSteps.length === 5),
  'All 5-voice results must have exactly 5 transposition slots'
);

// ─── Cumulative mode smoke test ───────────────────────────────────────────────

const report4cum = await runCanonSearch(
  subject,
  { ...baseOptions, transpositionMode: 'cumulative' },
  480
);

assert.ok(report4cum.results.length > 0,
  'Cumulative mode must produce results');

// ─── Third transposition mode: free re-entry ─────────────────────────────────

const lockFixture = await runCanonSearch(
  subject,
  {
    ...baseOptions,
    ensembleTotal: 3,
    chainLengthMin: 6,
    chainLengthMax: 6,
    transpositionMode: 'independent',
  },
  480
);

assert.ok(lockFixture.results.length > 0, 'Independent mode fixture must produce results');
assert.ok(
  lockFixture.results.every((result) => result.entries.every((entry, i) => {
    if (i < 3) return true;
    return entry.transposition === result.entries[i % 3].transposition;
  })),
  'Independent mode must reuse each voice slot initial transposition on re-entry'
);

const unlockFixture = await runCanonSearch(
  subject,
  {
    ...baseOptions,
    ensembleTotal: 3,
    chainLengthMin: 6,
    chainLengthMax: 6,
    transpositionMode: 'independent_reentry_free',
  },
  480
);

assert.ok(unlockFixture.results.length > 0, 'Free re-entry mode fixture must produce results');
assert.ok(
  unlockFixture.results.some((result) =>
    result.entries.some((entry, i) => i >= 3 && entry.transposition !== result.entries[i % 3].transposition)
  ),
  'Independent free re-entry mode must allow a voice slot to re-enter at a different transposition'
);

// ─── Progress callback fires ─────────────────────────────────────────────────

let progressCalls = 0;
await runCanonSearch(subject, baseOptions, 480, () => { progressCalls++; });
assert.ok(progressCalls > 0, 'onProgress callback must be called at least once');

console.log('canon search constraints: all assertions passed');
console.log(`  4-voice results: ${report4.results.length}`);
console.log(`  5-voice results: ${report5.results.length}`);
console.log(`  cumulative results: ${report4cum.results.length}`);
console.log(`  progress callbacks: ${progressCalls}`);
