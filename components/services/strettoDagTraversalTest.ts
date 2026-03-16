import assert from 'node:assert/strict';
import { buildAllowedVoicePairs, checkCounterpointStructure, checkCounterpointStructureWithBassRole, isStrongBeat, isVoicePairAllowedForTransposition, passesGlobalLineageStage, passesPairStage, passesTripletStage, resolveNextFrontierLayer, searchStrettoChains, shouldPruneLowestVoicePair, shouldYieldToEventLoop, toBoundaryPairKey, toCanonicalTripletKey, toOrderedBoundarySignature, violatesPairwiseLowerBound, violatesTripletParallelPolicy } from './strettoGenerator';
import { INTERVALS } from './strettoConstants';
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
  violatesPairwiseLowerBound({ dissonanceRatio: 0.8, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding dissonance ratio threshold'
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 3, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 1, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true }, 0.75),
  true,
  'pairwise lower-bound helper must reject records exceeding dissonance run-event threshold'
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 2, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 1, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true }, 0.75),
  false,
  'pairwise lower-bound helper must accept records that satisfy both hard bounds'
);


assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1, maxDissonanceRunTicks: 720, maxAllowedContinuousDissonanceTicks: 480, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true }, 0.75),
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
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    120,
    120,
    960
  ),
  true,
  'triplet policy must reject consecutive boundaries that both carry P5/P8 parallel motion'
);

assert.equal(
  violatesTripletParallelPolicy(
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    360,
    420,
    960
  ),
  true,
  'triplet policy must reject any P5/P8 parallel motion when neither adjacent delay is below Sb/3'
);

assert.equal(
  violatesTripletParallelPolicy(
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: true, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    { dissonanceRatio: 0, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 0, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
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
// Rule 2B: tenor-bass requires >= 7 semitones separation. Use transpositionAB=-7 (bass 7 below tenor)
// to test that asymmetric P4 bass-role incompatibility does NOT prune the lowest pair (disallowLowestPair=false).
const conservativePairs = buildAllowedVoicePairs(-7, 4, shouldPruneLowestVoicePair(asymmetricBassStrictA.compatible, asymmetricBassStrictB.compatible));
assert.equal(conservativePairs.has('2->3'), true, 'asymmetric bass-role incompatibility must preserve tenor->bass assignment when Rule 2B spacing is satisfied');
// (3->2) with transpositionAB=-7 means tenor is 7 semitones BELOW bass — Rule 2B violation, correctly absent.
assert.equal(conservativePairs.has('3->2'), false, 'bass->tenor assignment must be absent when tenor transposition falls below bass by 7 (Rule 2B)');

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

// Structural integrity assertions on every chain returned for the base fixture.
const delayStep = ppq / 2;
const tradTranspositions = new Set([0, 12, -12, 24, -24, 7, -5, 19, -17, 31, -29, 5, -7, 17, -19, 29, -31]);

for (const result of reportA.results) {
  for (let i = 0; i < result.entries.length; i++) {
    const entry = result.entries[i];
    assert.ok(
      entry.voiceIndex >= 0 && entry.voiceIndex < options.ensembleTotal,
      `voice index ${entry.voiceIndex} must be in [0, ${options.ensembleTotal}) (chain ${result.id}, entry ${i})`
    );
    if (i > 0) {
      const prev = result.entries[i - 1];
      assert.ok(
        entry.startBeat > prev.startBeat,
        `start beats must be strictly increasing (chain ${result.id}, entry ${i})`
      );
      const delayTicks = Math.round((entry.startBeat - prev.startBeat) * ppq);
      assert.ok(
        delayTicks > 0 && delayTicks % delayStep === 0,
        `delay ${delayTicks} must be a positive multiple of delayStep=${delayStep} (chain ${result.id}, entry ${i})`
      );
    }
    assert.ok(
      tradTranspositions.has(entry.transposition),
      `transposition ${entry.transposition} must be a valid traditional transposition (chain ${result.id}, entry ${i})`
    );
  }
}
// §B voice ordering regression: every temporal pair in every result chain must satisfy
// ordering + spacing rules, regardless of whether the entries sound simultaneously.
for (const result of reportA.results) {
  for (let i = 0; i < result.entries.length; i++) {
    for (let j = i + 1; j < result.entries.length; j++) {
      const eA = result.entries[i];
      const eB = result.entries[j];
      assert.ok(
        isVoicePairAllowedForTransposition(
          eA.voiceIndex, eB.voiceIndex,
          eB.transposition - eA.transposition,
          options.ensembleTotal,
          false
        ),
        `§B voice ordering violation: entries ${i},${j} v${eA.voiceIndex}@${eA.transposition} vs v${eB.voiceIndex}@${eB.transposition} in chain ${result.id}`
      );
    }
  }
}

assert.ok(
  ['Success', 'Exhausted', 'Timeout', 'NodeLimit', 'MaxResults'].includes(reportA.stats.stopReason),
  'search must terminate with an explicit completion reason'
);
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
const transformAdmissibleTranspositions = new Set<number>([
  ...Array.from(INTERVALS.TRAD_TRANSPOSITIONS),
  ...Array.from(INTERVALS.THIRD_SIXTH_TRANSPOSITIONS)
]);

const transformConstrainedReport = await searchStrettoChains(subject, transformConstrainedOptions, ppq);
if (transformConstrainedReport.results.length === 0) {
  console.warn('[transform-adjacency] no candidates produced; invariants skipped for this fixture');
}

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
      transformAdmissibleTranspositions.has(curr.transposition),
      `absolute transposition must remain in admissible vocabulary regardless of adjacent delta (chain id: ${result.id}, index: ${i})`
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



const normalizeChainSignatureSet = (report: Awaited<ReturnType<typeof searchStrettoChains>>): Set<string> => {
  const signatures = new Set<string>();
  for (const result of report.results) {
    const chainSig = result.entries
      .map((entry) => `${Math.round(entry.startBeat * ppq)}:${((entry.transposition % 12) + 12) % 12}:${entry.type}:${entry.voiceIndex}`)
      .join('|');
    signatures.add(chainSig);
  }
  return signatures;
};

interface TraversalFixture {
  name: string;
  subject: RawNote[];
  options: StrettoSearchOptions;
}

const fixtureEntry7Regime: TraversalFixture = {
  name: 'entry-7-regime',
  subject: [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
    { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' }
  ],
  options: {
    ...options,
    maxSearchTimeMs: 90000,
    targetChainLength: 7,
    thirdSixthMode: 'None',
    maxPairwiseDissonance: 0.75
  }
};

const fixtureBeyondEntry7: TraversalFixture = {
  name: 'beyond-entry-7',
  subject: [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
    { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
    { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' }
  ],
  options: {
    ...options,
    maxSearchTimeMs: 90000,
    targetChainLength: 8,
    thirdSixthMode: 'None',
    inversionMode: 'None',
    truncationMode: 'None',
    maxPairwiseDissonance: 0.75
  }
};

const fixtureStressNearLimits: TraversalFixture = {
  name: 'stress-near-limits',
  subject: [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
    { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
    { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' },
    { midi: 71, ticks: 2880, durationTicks: 480, velocity: 90, name: 'B4' },
    { midi: 72, ticks: 3360, durationTicks: 480, velocity: 90, name: 'C5' }
  ],
  options: {
    ...options,
    maxSearchTimeMs: 90000,
    ensembleTotal: 5,
    targetChainLength: 9,
    thirdSixthMode: 'Unlimited',
    inversionMode: 'None',
    truncationMode: 'None',
    maxPairwiseDissonance: 0.9
  }
};

const traversalFixtures: TraversalFixture[] = [fixtureEntry7Regime, fixtureBeyondEntry7, fixtureStressNearLimits];

const thirdSixthTranspositions = new Set([3, 4, 8, 9, -3, -4, -8, -9, 15, 16, 20, 21, -15, -16, -20, -21]);

for (const fixture of traversalFixtures) {
  const report = await searchStrettoChains(
    fixture.subject,
    fixture.options,
    ppq
  );

  assert.ok(
    report.stats.nodesVisited >= 0,
    `search must complete without error for fixture ${fixture.name}`
  );

  // Structural integrity: every chain must have valid voice indices, no duplicates,
  // strictly increasing start beats, delay multiples, and valid transpositions.
  const useThirdSixth = fixture.options.thirdSixthMode !== 'None';
  const validTranspositionsForFixture = useThirdSixth
    ? new Set([...tradTranspositions, ...thirdSixthTranspositions])
    : tradTranspositions;

  for (const result of report.results) {
    for (let i = 0; i < result.entries.length; i++) {
      const entry = result.entries[i];
      assert.ok(
        entry.voiceIndex >= 0 && entry.voiceIndex < fixture.options.ensembleTotal,
        `[${fixture.name}] voice index ${entry.voiceIndex} must be in [0, ${fixture.options.ensembleTotal}) (chain ${result.id}, entry ${i})`
      );
      if (i > 0) {
        const prev = result.entries[i - 1];
        assert.ok(
          entry.startBeat > prev.startBeat,
          `[${fixture.name}] start beats must be strictly increasing (chain ${result.id}, entry ${i})`
        );
        const delayTicks = Math.round((entry.startBeat - prev.startBeat) * ppq);
        assert.ok(
          delayTicks > 0 && delayTicks % delayStep === 0,
          `[${fixture.name}] delay ${delayTicks} must be a positive multiple of delayStep=${delayStep} (chain ${result.id}, entry ${i})`
        );
      }
      assert.ok(
        validTranspositionsForFixture.has(entry.transposition),
        `[${fixture.name}] transposition ${entry.transposition} must be a valid interval (chain ${result.id}, entry ${i})`
      );
    }
  }

  // §B voice ordering regression for fixture chains.
  for (const result of report.results) {
    for (let i = 0; i < result.entries.length; i++) {
      for (let j = i + 1; j < result.entries.length; j++) {
        const eA = result.entries[i];
        const eB = result.entries[j];
        assert.ok(
          isVoicePairAllowedForTransposition(
            eA.voiceIndex, eB.voiceIndex,
            eB.transposition - eA.transposition,
            fixture.options.ensembleTotal,
            false
          ),
          `[${fixture.name}] §B voice ordering violation: entries ${i},${j} v${eA.voiceIndex}@${eA.transposition} vs v${eB.voiceIndex}@${eB.transposition} in chain ${result.id}`
        );
      }
    }
  }

  if (report.results.length === 0 && report.stats.stopReason === 'Exhausted') {
    console.warn(`[traversal:${fixture.name}] exhausted search returned 0 chains — check constraints`);
  }

  const signatures = normalizeChainSignatureSet(report);
  const nodes = report.stats.nodesVisited;
  const edges = report.stats.coverage?.edgesTraversed ?? report.stats.edgesTraversed ?? 0;

  console.log(
    `[traversal:${fixture.name}] stopReason=${report.stats.stopReason} ` +
    `nodes=${nodes} edges=${edges} ` +
    `maxDepth=${report.stats.maxDepthReached} chains=${signatures.size}`
  );
}

console.log('stretto canonical key + deterministic DAG traversal tests passed');
