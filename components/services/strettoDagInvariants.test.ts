import assert from 'node:assert/strict';
import {
  buildAllowedVoicePairs,
  checkCounterpointStructure,
  checkCounterpointStructureWithBassRole,
  isStrongBeat,
  isVoicePairAllowedForTransposition,
  passesGlobalLineageStage,
  passesPairStage,
  passesTripletStage,
  resolveNextFrontierLayer,
  shouldPruneLowestVoicePair,
  shouldYieldToEventLoop,
  toBoundaryPairKey,
  toCanonicalTripletKey,
  toOrderedBoundarySignature,
  violatesPairwiseLowerBound
} from './strettoGenerator';
import type { StrettoChainOption } from '../../types';
import { ppq } from './testFixtures/strettoTraversalFixtures';

assert.equal(toCanonicalTripletKey({ variantA: 0, variantB: 1, variantC: 2, delayAB: 240, delayBC: 480, transpositionAB: 7, transpositionBC: -5 }), '0|1|2|240|480|7|-5');

const left: StrettoChainOption = { startBeat: 0, transposition: 0, type: 'N', length: 960, voiceIndex: 1 };
const right: StrettoChainOption = { startBeat: 1, transposition: 7, type: 'N', length: 960, voiceIndex: 2 };
assert.equal(toBoundaryPairKey(left, right, ppq), '1:N->2:N|d480|t7');

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
assert.notEqual(toOrderedBoundarySignature(historyA, ppq), toOrderedBoundarySignature(historyB, ppq));

assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.8, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, bassRoleDissonanceRunSpans: { none: [], a: [], b: [] }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    0.75
  ),
  true
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 3, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 1, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, bassRoleDissonanceRunSpans: { none: [], a: [], b: [] }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    0.75
  ),
  true
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: true, hasVoiceCrossing: true, maxDissonanceRunEvents: 2, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 1, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, bassRoleDissonanceRunSpans: { none: [], a: [], b: [] }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    0.75
  ),
  false
);
assert.equal(
  violatesPairwiseLowerBound({ dissonanceRatio: 0.2, hasFourth: false, hasVoiceCrossing: false, maxDissonanceRunEvents: 1, maxDissonanceRunTicks: 720, maxAllowedContinuousDissonanceTicks: 480, hasParallelPerfect58: false, disallowLowestPair: false, allowedVoicePairs: new Set<string>(), allowedVoiceMaskRows: [], p4SimultaneityCount: 0, bassRoleCompatible: { none: true, a: true, b: true }, bassRoleDissonanceRatio: { none: 0, a: 0, b: 0 }, bassRoleMaxRunEvents: { none: 0, a: 0, b: 0 }, bassRoleDissonanceRunSpans: { none: [], a: [], b: [] }, intervalClass: 0, isRestrictedInterval: false, isFreeInterval: true, meetsAdjacentTranspositionSeparation: true },
    0.75
  ),
  true
);

const stageCounterFixture = { pairStageRejected: 0, tripletStageRejected: 0, globalLineageStageRejected: 0 } as any;
assert.equal(passesPairStage(stageCounterFixture, true), true);
assert.equal(passesTripletStage(stageCounterFixture, true), true);
assert.equal(passesGlobalLineageStage(stageCounterFixture, true), true);
assert.equal(passesPairStage(stageCounterFixture, false), false);
assert.equal(passesTripletStage(stageCounterFixture, false), false);
assert.equal(passesGlobalLineageStage(stageCounterFixture, false), false);
assert.equal(stageCounterFixture.pairStageRejected, 1);
assert.equal(stageCounterFixture.tripletStageRejected, 1);
assert.equal(stageCounterFixture.globalLineageStageRejected, 1);

const perfectParallelA = { type: 'N' as const, truncationBeats: 0, lengthTicks: 960, notes: [{ relTick: 0, durationTicks: 480, pitch: 60 }, { relTick: 480, durationTicks: 480, pitch: 62 }] };
const perfectParallelB = { type: 'N' as const, truncationBeats: 0, lengthTicks: 960, notes: [{ relTick: 0, durationTicks: 480, pitch: 67 }, { relTick: 480, durationTicks: 480, pitch: 69 }] };
const perfectParallelScan = checkCounterpointStructure(perfectParallelA, perfectParallelB, 0, 0, 1.0, ppq);
assert.equal(perfectParallelScan.hasParallelPerfect58, false);

const consecutiveParallelA = { type: 'N' as const, truncationBeats: 0, lengthTicks: 960, notes: [{ relTick: 0, durationTicks: 320, pitch: 60 }, { relTick: 320, durationTicks: 320, pitch: 62 }, { relTick: 640, durationTicks: 320, pitch: 64 }] };
const consecutiveParallelB = { type: 'N' as const, truncationBeats: 0, lengthTicks: 960, notes: [{ relTick: 0, durationTicks: 320, pitch: 67 }, { relTick: 320, durationTicks: 320, pitch: 69 }, { relTick: 640, durationTicks: 320, pitch: 71 }] };
assert.equal(checkCounterpointStructure(consecutiveParallelA, consecutiveParallelB, 0, 0, 1.0, ppq).hasParallelPerfect58, true);

const largeDelayParallelB = { type: 'N' as const, truncationBeats: 0, lengthTicks: 960, notes: [{ relTick: 0, durationTicks: 80, pitch: 67 }, { relTick: 80, durationTicks: 880, pitch: 69 }] };
assert.equal(checkCounterpointStructure(perfectParallelA, largeDelayParallelB, 400, 0, 1.0, ppq).hasParallelPerfect58, true);

const contraryMotionB = { type: 'N' as const, truncationBeats: 0, lengthTicks: 960, notes: [{ relTick: 0, durationTicks: 480, pitch: 67 }, { relTick: 480, durationTicks: 480, pitch: 65 }] };
assert.equal(checkCounterpointStructure(perfectParallelA, contraryMotionB, 0, 0, 1.0, ppq).hasParallelPerfect58, false);

const p4UpperVoiceA = { type: 'N' as const, truncationBeats: 0, lengthTicks: 960, notes: [{ relTick: 0, durationTicks: 480, pitch: 60 }, { relTick: 480, durationTicks: 480, pitch: 62 }] };
const p4UpperVoiceB = { type: 'N' as const, truncationBeats: 0, lengthTicks: 960, notes: [{ relTick: 0, durationTicks: 480, pitch: 65 }, { relTick: 480, durationTicks: 480, pitch: 67 }] };
const p4Pair = checkCounterpointStructure(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.01, ppq);
assert.equal(p4Pair.compatible, true);
assert.equal(p4Pair.dissonanceRatio, 0);
assert.equal(p4Pair.hasParallelPerfect58, false);
assert.ok((p4Pair.p4Spans?.length ?? 0) > 0);
assert.equal(p4Pair.parallelPerfectStartTicks?.length ?? 0, 0);

assert.equal(checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.01, 'a', ppq).compatible, false);
assert.equal(checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, -10, 0.01, 'b', ppq).compatible, false);

const nextLayer = new Map<string, number>([['a', 1], ['b', 2]]);
assert.deepEqual(resolveNextFrontierLayer(nextLayer, false), [1, 2]);
assert.deepEqual(resolveNextFrontierLayer(nextLayer, true), []);

assert.equal(shouldYieldToEventLoop(0, 8), false);
assert.equal(shouldYieldToEventLoop(7, 8), false);
assert.equal(shouldYieldToEventLoop(8, 8), true);
assert.equal(shouldYieldToEventLoop(16, 8), true);

assert.equal(isStrongBeat(0, ppq, 4, 4), true);
assert.equal(isStrongBeat(ppq * 2, ppq, 4, 4), true);
assert.equal(isStrongBeat(ppq, ppq, 4, 4), false);
assert.equal(isStrongBeat(ppq * 3, ppq, 4, 4), false);
assert.equal(isStrongBeat(0, ppq, 12, 8), true);
assert.equal(isStrongBeat(ppq * 3, ppq, 12, 8), true);
assert.equal(isStrongBeat(Math.round(ppq * 1.5), ppq, 12, 8), false);
assert.equal(isStrongBeat(Math.round(ppq * 4.5), ppq, 12, 8), false);
assert.equal(isStrongBeat(0, ppq, 6, 8), true);
assert.equal(isStrongBeat(Math.round(ppq * 1.5), ppq, 6, 8), false);
assert.equal(isStrongBeat(0, ppq, 9, 8), true);
assert.equal(isStrongBeat(ppq * 3, ppq, 9, 8), false);

assert.equal(isVoicePairAllowedForTransposition(2, 3, 0, 4, true), false);
assert.equal(isVoicePairAllowedForTransposition(0, 1, 0, 4, true), true);

const asymmetricBassStrictA = checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.2, 'a', ppq);
const asymmetricBassStrictB = checkCounterpointStructureWithBassRole(p4UpperVoiceA, p4UpperVoiceB, 0, 0, 0.2, 'b', ppq);
assert.equal(asymmetricBassStrictA.compatible, false);
assert.equal(asymmetricBassStrictB.compatible, true);
assert.equal(shouldPruneLowestVoicePair(asymmetricBassStrictA.compatible, asymmetricBassStrictB.compatible), false);

const conservativePairs = buildAllowedVoicePairs(-7, 4, shouldPruneLowestVoicePair(asymmetricBassStrictA.compatible, asymmetricBassStrictB.compatible));
assert.equal(conservativePairs.has('2->3'), true);
assert.equal(conservativePairs.has('3->2'), false);

const allowedPairs = buildAllowedVoicePairs(0, 4, true);
assert.equal(allowedPairs.has('2->3'), false);
assert.equal(allowedPairs.has('0->1'), true);

console.log('stretto helper invariants passed');
