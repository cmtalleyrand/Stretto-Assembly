import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoChainResult, StrettoSearchOptions } from '../../types';

const PPQ = 480;

const subject: RawNote[] = [
  { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
  { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
  { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
  { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
  { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' }
];

const options: StrettoSearchOptions = {
  ensembleTotal: 5,
  targetChainLength: 5,
  subjectVoiceIndex: 1,
  truncationMode: 'None',
  truncationTargetBeats: 1,
  inversionMode: 'None',
  useChromaticInversion: false,
  thirdSixthMode: 'None',
  pivotMidi: 60,
  requireConsonantEnd: false,
  disallowComplexExceptions: true,
  maxPairwiseDissonance: 0.5,
  scaleRoot: 0,
  scaleMode: 'Major',
  collectDiagnosticSpans: true
};

function toCandidateChainSignature(result: StrettoChainResult): string {
  const entries = result.entries
    .map((entry) => `${entry.startBeat.toFixed(3)}:${entry.transposition}:${entry.type}:${entry.length}:${entry.voiceIndex}`)
    .join('|');
  return `${entries}|score=${result.score.toFixed(6)}`;
}

const mapReport = await searchStrettoChains(subject, options, PPQ, undefined, { backend: 'map' });
const denseReport = await searchStrettoChains(subject, options, PPQ, undefined, { backend: 'dense' });

assert.ok(mapReport.results.length > 0, 'map backend must produce at least one candidate chain.');
assert.ok(denseReport.results.length > 0, 'dense backend must produce at least one candidate chain.');

const mapSignatures = mapReport.results.map(toCandidateChainSignature);
const denseSignatures = denseReport.results.map(toCandidateChainSignature);
assert.deepEqual(denseSignatures, mapSignatures, 'Candidate-chain outputs must be identical across precompute backends.');

const mapStageStatKeys = Object.keys(mapReport.stats.stageStats).sort();
const denseStageStatKeys = Object.keys(denseReport.stats.stageStats).sort();
assert.deepEqual(
  denseStageStatKeys,
  mapStageStatKeys,
  'Diagnostics payload shape (stageStats keys) must remain stable across backend selection.'
);

console.log('stretto precompute backend regression test passed');
