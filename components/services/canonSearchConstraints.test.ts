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
  subjectVoiceIndex: 0
};

const report4 = runCanonSearch(subject, baseOptions, 480);
const steps4 = new Set(report4.results.map((r) => r.transpositionStep));

assert.ok(report4.results.length > 0, 'Expected at least one viable 4-voice canon result after transposition constraints.');
assert.equal(steps4.has(0), false, 'Active voices must have unique transpositions relative to entry 0.');
assert.equal(steps4.has(5), false, 'T=5 violates alto-bass and soprano-bass minimum constraints.');
assert.equal(steps4.has(-5), false, 'T=-5 violates alto-bass and soprano-bass minimum constraints.');
assert.equal(steps4.has(24), false, 'T=24 violates soprano-alto maximum span (P12).');
assert.equal(steps4.has(-24), false, 'T=-24 violates soprano-alto maximum span (P12).');
assert.equal(steps4.has(-7), true, 'T=-7 should satisfy all configured span constraints in 4 voices.');

const report5 = runCanonSearch(subject, { ...baseOptions, ensembleTotal: 5, chainLengthMin: 5, chainLengthMax: 5 }, 480);
const steps5 = new Set(report5.results.map((r) => r.transpositionStep));
assert.ok(report5.results.length > 0, 'Expected at least one viable 5-voice canon result.');
assert.equal(steps5.has(5), false, '5-voice role extension must still enforce transposition span constraints.');

console.log('canon search transposition constraints passed');
