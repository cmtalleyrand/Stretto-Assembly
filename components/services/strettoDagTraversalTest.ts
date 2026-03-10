import assert from 'node:assert/strict';
import { getDagNodeIdentity, resolveNextFrontierLayer, searchStrettoChains, toBoundaryPairKey, toCanonicalTripletKey, toOrderedBoundarySignature, violatesPairwiseLowerBound } from './strettoGenerator';
import type { RawNote, StrettoChainOption, StrettoSearchOptions } from '../../types';

const ppq = 480;

assert.equal(
  toCanonicalTripletKey({
    variantA: 0,
    variantB: 1,
    variantC: 2,
    delayAB: 240,
    delayBC: 480,
    transpositionAB: 7,
    transpositionBC: -5
  }),
  '0|1|2|240|480|7|-5',
  'triplet key must be positionally canonical and deterministic'
);

const left: StrettoChainOption = { startBeat: 0, transposition: 0, type: 'N', length: 960, voiceIndex: 1 };
const right: StrettoChainOption = { startBeat: 1, transposition: 7, type: 'N', length: 960, voiceIndex: 2 };
assert.equal(
  toBoundaryPairKey(left, right, ppq),
  '1:N->2:N|d480|t7',
  'boundary pair key must encode ordered voice/type relation plus delay/transposition delta'
);

const historyA: StrettoChainOption[] = [
  { startBeat: 0, transposition: 0, type: 'N', length: 960, voiceIndex: 1 },
  { startBeat: 1, transposition: -24, type: 'N', length: 960, voiceIndex: 2 },
  { startBeat: 2, transposition: -24, type: 'N', length: 960, voiceIndex: 3 },
  { startBeat: 3, transposition: -24, type: 'N', length: 960, voiceIndex: 0 }
];
const historyB: StrettoChainOption[] = [
  { startBeat: 0, transposition: 0, type: 'N', length: 960, voiceIndex: 1 },
  { startBeat: 1, transposition: 0, type: 'N', length: 960, voiceIndex: 2 },
  { startBeat: 2, transposition: 0, type: 'N', length: 960, voiceIndex: 3 },
  { startBeat: 3, transposition: -24, type: 'N', length: 960, voiceIndex: 0 }
];
assert.notEqual(
  toOrderedBoundarySignature(historyA, ppq),
  toOrderedBoundarySignature(historyB, ppq),
  'ordered boundary signatures must distinguish histories with different temporal transposition-delta placement'
);

assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.8, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1 }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding dissonance ratio threshold'
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 3 }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding dissonance run-event threshold'
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 2 }, 0.75),
  false,
  'pairwise lower-bound helper must accept records that satisfy both hard bounds'
);


const dagIdentityBase = {
  chain: [
    { startBeat: 0, transposition: 0, type: 'N' as const, length: 960, voiceIndex: 1 },
    { startBeat: 1, transposition: 7, type: 'N' as const, length: 480, voiceIndex: 2 }
  ],
  voiceEndTimesTicks: [960, 0, 1440, 0],
  nInv: 0,
  nTrunc: 1,
  nRestricted: 0,
  nFree: 2
};

assert.notEqual(
  getDagNodeIdentity({ ...dagIdentityBase, variantIndices: [0, 1] }, ppq),
  getDagNodeIdentity({ ...dagIdentityBase, variantIndices: [0, 2] }, ppq),
  'DAG node identity must discriminate variant-index histories because admissibility checks depend on per-position variant selections'
);

assert.notEqual(
  getDagNodeIdentity({ ...dagIdentityBase, variantIndices: [0, 1], chain: [
    { startBeat: 0, transposition: 0, type: 'N' as const, length: 960, voiceIndex: 1 },
    { startBeat: 1, transposition: 7, type: 'N' as const, length: 720, voiceIndex: 2 }
  ] }, ppq),
  getDagNodeIdentity({ ...dagIdentityBase, variantIndices: [0, 1] }, ppq),
  'DAG node identity must discriminate entry-length histories under truncation-enabled search'
);

const nextLayer = new Map<string, number>([['a', 1], ['b', 2]]);
assert.deepEqual(
  resolveNextFrontierLayer(nextLayer, false),
  [1, 2],
  'frontier resolver must carry queued successors when traversal has not been stopped'
);
assert.deepEqual(
  resolveNextFrontierLayer(nextLayer, true),
  [],
  'frontier resolver must halt traversal immediately after timeout/node-limit stop declaration'
);

const subject: RawNote[] = [
  { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
  { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
  { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
  { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' }
];

const options: StrettoSearchOptions = {
  ensembleTotal: 4,
  targetChainLength: 4,
  subjectVoiceIndex: 1,
  truncationMode: 'None',
  truncationTargetBeats: 1,
  inversionMode: 'None',
  useChromaticInversion: false,
  thirdSixthMode: 'None',
  pivotMidi: 60,
  requireConsonantEnd: false,
  disallowComplexExceptions: false,
  maxPairwiseDissonance: 0.75,
  scaleRoot: 0,
  scaleMode: 'Major'
};

const reportA = await searchStrettoChains(subject, options, ppq);
const reportB = await searchStrettoChains(subject, options, ppq);

const structureSignature = (entries: StrettoChainOption[]) => entries
  .map((e) => `${Math.round(e.startBeat * ppq)}:${e.transposition}:${e.type}:${e.voiceIndex}`)
  .join('|');

const signaturesA = reportA.results.map((r) => structureSignature(r.entries));
const signaturesB = reportB.results.map((r) => structureSignature(r.entries));
assert.deepEqual(signaturesA, signaturesB, 'deterministic DAG traversal must produce stable structural ordering for identical input');

assert.ok(reportA.stats.stageStats, 'stageStats must be emitted');
assert.equal(typeof reportA.stats.stageStats.deterministicDagMergedNodes, 'number', 'deterministic DAG merge counter must be numeric');
assert.ok(reportA.stats.stageStats.deterministicDagMergedNodes >= 0, 'merge counter must be non-negative');
assert.equal(typeof reportA.stats.stageStats.pairwiseWithFourth, 'number', 'pairwise fourth-presence counter must be numeric');
assert.equal(typeof reportA.stats.stageStats.pairwiseWithVoiceCrossing, 'number', 'pairwise voice-crossing counter must be numeric');
assert.equal(typeof reportA.stats.stageStats.tripleLowerBoundRejected, 'number', 'triplet lower-bound rejection counter must be numeric');
assert.ok(reportA.stats.coverage, 'coverage payload must be emitted');
assert.equal(typeof reportA.stats.coverage.maxFrontierSize, 'number', 'coverage must include max frontier size');
assert.equal(typeof reportA.stats.coverage.maxFrontierClassCount, 'number', 'coverage must include max frontier class count');


const originalDateNow = Date.now;
let nowTicks = 0;
Date.now = () => {
  nowTicks += 31000;
  return nowTicks;
};

try {
  const timeoutReport = await searchStrettoChains(subject, { ...options, targetChainLength: 2 }, ppq);
  assert.equal(timeoutReport.stats.maxDepthReached, 2, 'forced-timeout scenario must still record reached target depth');
  assert.equal(timeoutReport.stats.stopReason, 'Timeout', 'forced-timeout scenario must still enforce timeout guards while visiting terminal frontiers');
  assert.ok(timeoutReport.results.length > 0, 'forced-timeout scenario must retain already-reached full-length chains');
} finally {
  Date.now = originalDateNow;
}

console.log('stretto canonical key + deterministic DAG traversal tests passed');
