import assert from 'node:assert/strict';
import { buildAllowedVoicePairs, checkCounterpointStructure, checkCounterpointStructureWithBassRole, isStrongBeat, isVoicePairAllowedForTransposition, passesGlobalLineageStage, passesPairStage, passesTripletStage, resolveNextFrontierLayer, searchStrettoChains, shouldPruneLowestVoicePair, shouldYieldToEventLoop, toBoundaryPairKey, toCanonicalTripletKey, toOrderedBoundarySignature, violatesPairwiseLowerBound, violatesTripletParallelPolicy } from './strettoGenerator';
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
  violatesPairwiseLowerBound({ dissonanceRatio: 0.8, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding dissonance ratio threshold'
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 3, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 1, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding dissonance run-event threshold'
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 2, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 1, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true }, 0.75),
  false,
  'pairwise lower-bound helper must accept records that satisfy both hard bounds'
);


assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1, maxDissonanceRunTicks: 720, maxAllowedContinuousDissonanceTicks: 480, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true }, 0.75),
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


const perfectParallelA = {
  type: 'N' as const,
  truncationBeats: 0,
  lengthTicks: 960,
  notes: [
    { relTick: 0, durationTicks: 480, pitch: 60 },
    { relTick: 480, durationTicks: 480, pitch: 62 }
  ]
};
const perfectParallelB = {
  type: 'N' as const,
  truncationBeats: 0,
  lengthTicks: 960,
  notes: [
    { relTick: 0, durationTicks: 480, pitch: 67 },
    { relTick: 480, durationTicks: 480, pitch: 69 }
  ]
};
const perfectParallelScan = checkCounterpointStructure(perfectParallelA, perfectParallelB, 0, 0, 1.0, ppq);
assert.equal(perfectParallelScan.hasParallelPerfect58, true, 'pairwise scan must flag strict parallel perfect motion when both voices move simultaneously by equal signed delta from a perfect interval');

const contraryMotionB = {
  type: 'N' as const,
  truncationBeats: 0,
  lengthTicks: 960,
  notes: [
    { relTick: 0, durationTicks: 480, pitch: 67 },
    { relTick: 480, durationTicks: 480, pitch: 65 }
  ]
};
const contraryMotionScan = checkCounterpointStructure(perfectParallelA, contraryMotionB, 0, 0, 1.0, ppq);
assert.equal(contraryMotionScan.hasParallelPerfect58, false, 'pairwise scan must not flag contrary motion as parallel perfect motion');

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
assert.ok((p4Pair.p4Spans?.length ?? 0) > 0, 'pairwise metadata must include P4 simultaneity spans');
assert.equal((p4Pair.parallelPerfectStartTicks?.length ?? 0), 0, 'pairwise metadata must not report forbidden perfect locations for pure P4 fixtures');


const p4WithAAsBass = checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.01, 'a', ppq);
assert.equal(p4WithAAsBass.compatible, false, 'pairwise scan must reject P4 when variant A is known bass and forms the lower note');

const p4WithBAsBass = checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, -10, 0.01, 'b', ppq);
assert.equal(p4WithBAsBass.compatible, false, 'pairwise scan must reject P4 when variant B is known bass and forms the lower note');

assert.equal(
  violatesTripletParallelPolicy(
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    120,
    120,
    960
  ),
  true,
  'triplet policy must reject consecutive boundaries that both carry P5/P8 parallel motion'
);

assert.equal(
  violatesTripletParallelPolicy(
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    360,
    420,
    960
  ),
  true,
  'triplet policy must reject any P5/P8 parallel motion when neither adjacent delay is below Sb/3'
);

assert.equal(
  violatesTripletParallelPolicy(
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
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

assert.equal(isStrongBeat(0, ppq, 4, 4), true, '4/4 downbeat must be strong');
assert.equal(isStrongBeat(ppq * 2, ppq, 4, 4), true, '4/4 beat 3 must be strong');
assert.equal(isStrongBeat(ppq, ppq, 4, 4), false, '4/4 beat 2 must be weak');
assert.equal(isStrongBeat(ppq * 3, ppq, 4, 4), false, '4/4 beat 4 must be weak');

assert.equal(isStrongBeat(0, ppq, 12, 8), true, '12/8 beat 1 must be strong');
assert.equal(isStrongBeat(ppq * 3, ppq, 12, 8), true, '12/8 beat 3 (dotted-quarter index 3) must be strong');
assert.equal(isStrongBeat(Math.round(ppq * 1.5), ppq, 12, 8), false, '12/8 beat 2 must be weak');
assert.equal(isStrongBeat(Math.round(ppq * 4.5), ppq, 12, 8), false, '12/8 beat 4 must be weak');

assert.equal(isStrongBeat(0, ppq, 6, 8), true, '6/8 downbeat must be strong');
assert.equal(isStrongBeat(Math.round(ppq * 1.5), ppq, 6, 8), false, '6/8 second beat must be weak under first-beat-only rule');

assert.equal(isStrongBeat(0, ppq, 9, 8), true, '9/8 downbeat must be strong');
assert.equal(isStrongBeat(ppq * 3, ppq, 9, 8), false, '9/8 third dotted-quarter beat must be weak under first-beat-only rule');


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
  false,
  'lowest-voice pair pruning must not trigger for asymmetric bass-role incompatibility'
);
const conservativePairs = buildAllowedVoicePairs(0, 4, shouldPruneLowestVoicePair(asymmetricBassStrictA.compatible, asymmetricBassStrictB.compatible));
assert.equal(conservativePairs.has('2->3'), true, 'asymmetric bass-role incompatibility must preserve tenor->bass assignment for later triplet resolution');
assert.equal(conservativePairs.has('3->2'), true, 'asymmetric bass-role incompatibility must preserve bass->tenor assignment for later triplet resolution');

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
assert.equal(typeof reportA.stats.stageStats.pairwiseParallelRejected, 'number', 'stage stats must include pairwise parallel-perfect rejection counter');
assert.equal(typeof reportA.stats.stageStats.transitionWindowLookups, 'number', 'stage stats must include transition-window lookup counter');
assert.equal(typeof reportA.stats.stageStats.transitionsReturned, 'number', 'stage stats must include transition-window return-volume counter');
assert.equal(typeof reportA.stats.stageStats.candidateTransitionsEnumerated, 'number', 'stage stats must include candidate-transition enumeration counter');
assert.ok(Array.isArray(reportA.stats.stageStats.dissonanceSpans), 'stage stats must expose dissonance span metadata');
assert.ok(Array.isArray(reportA.stats.stageStats.p4Spans), 'stage stats must expose P4 span metadata');
assert.ok(Array.isArray(reportA.stats.stageStats.parallelPerfectLocationTicks), 'stage stats must expose parallel-perfect location metadata');
assert.ok(reportA.stats.stageStats.structuralScanInvocations > 0, 'stage stats must report at least one guarded structural scan invocation');
assert.ok((reportA.stats.stageStats.transitionWindowLookups ?? 0) >= 0, 'transition-window lookup counter must be non-negative');
assert.ok((reportA.stats.stageStats.transitionsReturned ?? 0) >= 0, 'transition-window return-volume counter must be non-negative');
assert.ok((reportA.stats.stageStats.candidateTransitionsEnumerated ?? 0) > 0, 'candidate-transition enumeration counter must report positive traversal volume on this fixture');
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
      (prev.type === 'I' || prevIsTruncated) && (curr.type === 'I' || currIsTruncated),
      true,
      `transformed entries must be followed by normal entries (chain id: ${result.id}, index: ${i})`
    );

    assert.ok(
      Math.abs(curr.transposition - prev.transposition) >= 5,
      `adjacent transpositions must differ by at least a perfect fourth (chain id: ${result.id}, index: ${i})`
    );

    if (i >= 2) {
      const prevPrev = result.entries[i - 2];
      const prevDelay = prev.startBeat - prevPrev.startBeat;
      const currDelay = curr.startBeat - prev.startBeat;
      const subjectLengthBeats = prev.length / ppq;

      if (prevDelay >= subjectLengthBeats / 2 || currDelay >= subjectLengthBeats / 2) {
        assert.ok(
          currDelay < prevDelay,
          `half-length OR trigger must enforce contraction (chain id: ${result.id}, index: ${i})`
        );
      }

      assert.ok(
        prevDelay - currDelay <= subjectLengthBeats / 4,
        `maximum contraction must be bounded by quarter subject length (chain id: ${result.id}, index: ${i})`
      );
    }
  }
}

console.log('stretto canonical key + deterministic DAG traversal tests passed');
