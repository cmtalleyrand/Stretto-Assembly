import assert from 'node:assert/strict';
import { runCanonSearch } from './canonSearch';
import type { CanonSearchOptions, RawNote } from '../../types';

const subject: RawNote[] = [
  { midi: 60, ticks: 0, durationTicks: 1920, velocity: 90, name: 'C4', voiceIndex: 0 },
  { midi: 62, ticks: 1920, durationTicks: 1920, velocity: 90, name: 'D4', voiceIndex: 0 }
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
  transpositionMode: 'independent'
};

const report4 = runCanonSearch(subject, baseOptions, 480);
assert.ok(report4.results.length > 0, 'Expected at least one viable 4-voice canon result.');
for (const result of report4.results) {
  assert.equal(result.transpositionSteps.length, baseOptions.ensembleTotal, 'Each result must include one transposition step per voice.');
}

const report5 = runCanonSearch(subject, { ...baseOptions, ensembleTotal: 5, chainLengthMin: 5, chainLengthMax: 5 }, 480);
assert.ok(report5.results.length > 0, 'Expected at least one viable 5-voice canon result.');
for (const result of report5.results) {
  assert.equal(result.transpositionSteps.length, 5, '5-voice results must include five transposition steps.');
}

console.log('canon search transposition constraints passed');
