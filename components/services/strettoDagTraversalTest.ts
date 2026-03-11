import assert from 'node:assert/strict';
import { buildAllowedVoicePairs, checkCounterpointStructure, checkCounterpointStructureWithBassRole, isVoicePairAllowedForTransposition, passesGlobalLineageStage, passesPairStage, passesTripletStage, resolveNextFrontierLayer, searchStrettoChains, shouldPruneLowestVoicePair, shouldYieldToEventLoop, toBoundaryPairKey, toCanonicalTripletKey, toOrderedBoundarySignature, violatesPairwiseLowerBound, violatesTripletParallelPolicy } from './strettoGenerator';
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
  violatesPairwiseLowerBound({ dissonanceRatio: 0.8, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding dissonance ratio threshold'
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 3, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 1, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding dissonance run-event threshold'
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 2, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 1, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true }, 0.75),
  false,
  'pairwise lower-bound helper must accept records that satisfy both hard bounds'
);


assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1, maxDissonanceRunTicks: 720, maxAllowedContinuousDissonanceTicks: 480, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding continuous dissonance-duration threshold'
);


const stageCounterFixture = { pairStageRejected: 0, tripletStageRejected: 0, globalLineageStageRejected: 0 } as any;
assert.equal(passesPairStage(stageCounterFixture, true), true, 'pair-stage predicate helper must pass true predicates without side effects');
assert.equal(passesTripletStage(stageCounterFixture, true), true, 'triplet-stage predicate helper must pass true predicates without side effects');
assert.equal(passesGlobalLineageStage(stageCounterFixture, true), true, 'global-lineage predicate helper must pass true predicates without side effects');
assert.equal(passesPairStage(stageCounterFixture, false), false, 'pair-stage predicate helper must reject false predicates');
assert.equal(passesTripletStage(stageCounterFixture, false), false, 'triplet-stage predicate helper must reject false predicates');
assert.equal(passesGlobalLineageStage(stageCounterFixture, false), false, 'global-lineage predicate helper must reject false predicates');
assert.equal(stageCounterFixture.pairStageRejected, 1, 'pair-stage helper must increment pair-stage rejection counter exactly once for one rejected predicate');
assert.equal(stageCounterFixture.tripletStageRejected, 1, 'triplet-stage helper must increment triplet-stage rejection counter exactly once for one rejected predicate');
assert.equal(stageCounterFixture.globalLineageStageRejected, 1, 'global-lineage helper must increment global-lineage rejection counter exactly once for one rejected predicate');

const p4UpperVoiceA = {
  type: 'N' as const,
  truncationBeats: 0,
  lengthTicks: 960,
  notes: [
    { relTick: 0, durationTicks: 480, pitch: 60 },
    { relTick: 480, durationTicks: 480, pitch: 62 }
  ]
};
const p4UpperVoiceB = {
  type: 'N' as const,
  truncationBeats: 0,
  lengthTicks: 960,
  notes: [
    { relTick: 0, durationTicks: 480, pitch: 65 },
    { relTick: 480, durationTicks: 480, pitch: 67 }
  ]
};
const p4Pair = checkCounterpointStructure(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.01, ppq);
assert.equal(p4Pair.compatible, true, 'pairwise scan must treat P4 as provisionally consonant before bass-context dissonance resolution');
assert.equal(p4Pair.dissonanceRatio, 0, 'pairwise P4-only slices must not accrue dissonance ratio burden');
assert.equal(p4Pair.hasParallelPerfect58, false, 'parallel P4 motion must never be tagged as forbidden perfect 5/8 parallel motion');


const p4WithAAsBass = checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.01, 'a', ppq);
assert.equal(p4WithAAsBass.compatible, false, 'pairwise scan must reject P4 when variant A is known bass and forms the lower note');

const p4WithBAsBass = checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, -10, 0.01, 'b', ppq);
assert.equal(p4WithBAsBass.compatible, false, 'pairwise scan must reject P4 when variant B is known bass and forms the lower note');

assert.equal(
  violatesTripletParallelPolicy(
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true },
    120,
    120,
    960
  ),
  true,
  'triplet policy must reject consecutive boundaries that both carry P5/P8 parallel motion'
);

assert.equal(
  violatesTripletParallelPolicy(
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true },
    360,
    420,
    960
  ),
  true,
  'triplet policy must reject any P5/P8 parallel motion when neither adjacent delay is below Sb/3'
);

assert.equal(
  violatesTripletParallelPolicy(
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true },
    240,
    420,
    960
  ),
  false,
  'triplet policy must preserve admissibility when at least one adjacent delay is below Sb/3'
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
  'frontier resolver must discard queued successors after timeout/node-limit stop declaration'
);

assert.equal(shouldYieldToEventLoop(0, 8), false, 'yield helper must not trigger at iteration zero');
assert.equal(shouldYieldToEventLoop(7, 8), false, 'yield helper must not trigger before interval boundary');
assert.equal(shouldYieldToEventLoop(8, 8), true, 'yield helper must trigger at interval boundary');
assert.equal(shouldYieldToEventLoop(16, 8), true, 'yield helper must trigger at repeated interval boundaries');


assert.equal(
  isVoicePairAllowedForTransposition(2, 3, 0, 4, true),
  false,
  'voice-metadata predicate must forbid assigning disallowLowestPair records to the two lowest voices'
);
assert.equal(
  isVoicePairAllowedForTransposition(0, 1, 0, 4, true),
  true,
  'voice-metadata predicate must preserve admissibility outside the two-lowest-voice slot when spacing constraints are satisfied'
);

const asymmetricBassStrictA = checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.2, 'a', ppq);
const asymmetricBassStrictB = checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.2, 'b', ppq);
assert.equal(asymmetricBassStrictA.compatible, false, 'fixture must include a bass-role asymmetry where side A-as-bass is dissonant');
assert.equal(asymmetricBassStrictB.compatible, true, 'fixture must include a bass-role asymmetry where side B-as-bass remains admissible');
assert.equal(
  shouldPruneLowestVoicePair(asymmetricBassStrictA.compatible, asymmetricBassStrictB.compatible),
  true,
  'lowest-voice pair pruning must trigger when either bass orientation is incompatible'
);
const conservativePairs = buildAllowedVoicePairs(0, 4, shouldPruneLowestVoicePair(asymmetricBassStrictA.compatible, asymmetricBassStrictB.compatible));
assert.equal(conservativePairs.has('2->3'), false, 'conservative lowest-pair pruning must remove tenor->bass assignment under asymmetric bass-role incompatibility');
assert.equal(conservativePairs.has('3->2'), false, 'conservative lowest-pair pruning must remove bass->tenor assignment under asymmetric bass-role incompatibility');

const allowedPairs = buildAllowedVoicePairs(0, 4, true);
assert.equal(allowedPairs.has('2->3'), false, 'precomputed voice-pair metadata must exclude lowest-pair assignment when disallowed');
assert.equal(allowedPairs.has('0->1'), true, 'precomputed voice-pair metadata must retain admissible non-lowest assignments');

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
assert.equal(typeof reportA.stats.stageStats.tripleParallelRejected, 'number', 'triplet parallel rejection counter must be numeric');

assert.equal(typeof reportA.stats.stageStats.pairStageRejected, 'number', 'stage stats must include pair-stage rejection counter');
assert.equal(typeof reportA.stats.stageStats.tripletStageRejected, 'number', 'stage stats must include triplet-stage rejection counter');
assert.equal(typeof reportA.stats.stageStats.globalLineageStageRejected, 'number', 'stage stats must include global-lineage-stage rejection counter');
assert.equal(typeof reportA.stats.stageStats.structuralScanInvocations, 'number', 'stage stats must include structural scan invocation counter');
assert.ok(reportA.stats.stageStats.structuralScanInvocations > 0, 'stage stats must report at least one guarded structural scan invocation');
assert.ok(reportA.stats.stageStats.tripletStageRejected > 0, 'triplet-stage rejection counter must record pre-scan pruning events');
assert.ok(reportA.stats.coverage, 'coverage payload must be emitted');
assert.equal(typeof reportA.stats.coverage.maxFrontierSize, 'number', 'coverage must include max frontier size');
assert.ok(['Success', 'Exhausted', 'Timeout', 'NodeLimit', 'MaxResults'].includes(reportA.stats.stopReason), 'search must terminate with an explicit completion reason');
assert.ok(reportA.stats.maxDepthReached >= 1, 'search run-to-completion test fixture must explore at least one expansion depth');

const transformConstrainedOptions: StrettoSearchOptions = {
  ...options,
  subjectVoiceIndex: 0,
  inversionMode: 'Unlimited',
  truncationMode: 'Unlimited',
  truncationTargetBeats: 2,
  thirdSixthMode: 'Unlimited',
  useChromaticInversion: true,
  maxPairwiseDissonance: 1,
  targetChainLength: 4
};

const transformConstrainedReport = await searchStrettoChains(subject, transformConstrainedOptions, ppq);
assert.ok(transformConstrainedReport.results.length > 0, 'transform-adjacency fixture must produce candidates for invariant validation');

let nonAdjacentOverlapWithSubP4DeltaCount = 0;

for (const result of transformConstrainedReport.results) {
  for (let i = 1; i < result.entries.length; i++) {
    const prev = result.entries[i - 1];
    const curr = result.entries[i];

    assert.notEqual(
      prev.type === 'I' && curr.type === 'I',
      true,
      `consecutive inversion entries must be pruned (chain id: ${result.id}, index: ${i})`
    );

    const prevIsTruncated = prev.length < ppq * 4;
    const currIsTruncated = curr.length < ppq * 4;
    assert.notEqual(
      prevIsTruncated && currIsTruncated,
      true,
      `consecutive truncation entries must be pruned (chain id: ${result.id}, index: ${i})`
    );

    assert.ok(
      Math.abs(curr.transposition - prev.transposition) >= 5,
      `adjacent transpositions must differ by at least a perfect fourth (chain id: ${result.id}, index: ${i})`
    );
  }

  // Regression for A.6 scoping: non-adjacent overlaps are harmonic predicates, not A.6 predicates.
  // Therefore, at least one valid chain should permit an overlapping (e_i, e_{i+2}) pair with
  // sub-P4 transposition delta while all immediate-adjacent deltas still satisfy A.6.
  for (let i = 0; i + 2 < result.entries.length; i++) {
    const left = result.entries[i];
    const right = result.entries[i + 2];
    const leftStartTicks = Math.round(left.startBeat * ppq);
    const rightStartTicks = Math.round(right.startBeat * ppq);
    const leftEndTicks = leftStartTicks + left.length;
    if (rightStartTicks < leftEndTicks && Math.abs(right.transposition - left.transposition) < 5) {
      nonAdjacentOverlapWithSubP4DeltaCount++;
      break;
    }
  }
}

assert.ok(
  nonAdjacentOverlapWithSubP4DeltaCount > 0,
  'A.6 must remain adjacent-only: search results should retain at least one harmonically-valid non-adjacent overlapping pair with |Δt| < P4'
);

console.log('stretto canonical key + deterministic DAG traversal tests passed');
