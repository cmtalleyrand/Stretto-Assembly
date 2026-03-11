import assert from 'node:assert/strict';
import type { RawNote } from '../../types';
import { analyzeStrettoCandidate } from './strettoCore';

const ppq = 480;
const ts = { num: 4, den: 4 };

const makeSubject = (pitches: number[]): RawNote[] => pitches.map((midi, idx) => ({
  midi,
  ticks: idx * ppq,
  durationTicks: ppq,
  velocity: 90,
  name: `N${idx}`,
  voiceIndex: 0
}));

const twoEventSubject = makeSubject([60, 62]);
const ratioRejected = analyzeStrettoCandidate(twoEventSubject, 1, 0, ppq, ts, false, 60, false, 0, 0.5);
assert.equal(ratioRejected.dissonanceRatio, 1, 'fixture must produce fully dissonant overlap for ratio-policy enforcement');
assert.equal(ratioRejected.grade, 'INVALID', 'pairwise discovery must hard-reject candidates whose dissonance ratio exceeds configured cap');
assert.equal(
  ratioRejected.errors.some((e) => e.type === 'Unresolved Dissonance' && e.severity === 'fatal'),
  true,
  'ratio-policy rejection must be surfaced as a fatal dissonance error for deterministic grading'
);

const oneBeatSubject = makeSubject([60]);
const ratioAllowed = analyzeStrettoCandidate(oneBeatSubject, 1, 0, ppq, ts, false, 60, false, 0, 1.0);
assert.notEqual(ratioAllowed.grade, 'INVALID', 'pairwise discovery must admit candidates when ratio/run constraints are satisfied');


const sustainedDissonanceSubject: RawNote[] = [
  { midi: 60, ticks: 0, durationTicks: ppq * 2, velocity: 90, name: 'S0', voiceIndex: 0 }
];
const durationRejected = analyzeStrettoCandidate(sustainedDissonanceSubject, 1, 0, ppq, ts, false, 60, false, 0, 1.0);
assert.equal(durationRejected.grade, 'INVALID', 'pairwise discovery must hard-reject candidates whose continuous dissonance duration exceeds one beat even when event count is within bounds');
assert.equal(
  durationRejected.errors.some((e) => e.type === 'Unresolved Dissonance' && e.severity === 'fatal'),
  true,
  'continuous-duration rejection must be reported as fatal unresolved dissonance'
);

const threeEventSubject = makeSubject([60, 62, 64]);
const runRejected = analyzeStrettoCandidate(threeEventSubject, 1, 0, ppq, ts, false, 60, false, 0, 1.0);
assert.equal(runRejected.grade, 'INVALID', 'pairwise discovery must hard-reject candidates with dissonance run length above two events');
assert.equal(
  runRejected.errors.some((e) => e.type === 'Consecutive Dissonance' && e.severity === 'fatal'),
  true,
  'run-length rejection must be reported as fatal consecutive dissonance'
);

console.log('strettoPairwisePolicyTest: PASS');
