import assert from 'node:assert/strict';
import { analyzeStrettoTripletCandidate } from './strettoCore';
import { RawNote } from '../../types';

const subject: RawNote[] = [
  { ticks: 0, durationTicks: 480, midi: 60, name: 'C4', velocity: 100, voiceIndex: 0 },
  { ticks: 480, durationTicks: 480, midi: 62, name: 'D4', velocity: 100, voiceIndex: 0 },
  { ticks: 960, durationTicks: 480, midi: 64, name: 'E4', velocity: 100, voiceIndex: 0 }
];

const result = analyzeStrettoTripletCandidate(
  subject,
  7,
  12,
  480,
  960,
  480,
  { num: 4, den: 4 },
  false,
  false,
  60,
  false,
  0,
  1
);

assert.equal(result.notes.length, subject.length * 3, 'Triplet discovery must emit three transformed entries worth of notes.');
assert.ok(result.intervalLabel.includes('→'), 'Triplet discovery label must encode ordered interval pair.');
assert.ok(result.id.startsWith('triplet:'), 'Triplet discovery candidate id must be namespaced.');
assert.equal(result.delayTicks, 480, 'Triplet discovery summary delayTicks must represent first entry delay for stable sorting.');

console.log('PASS strettoTripletDiscoveryTest');
