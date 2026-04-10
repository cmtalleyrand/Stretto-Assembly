import assert from 'node:assert/strict';
import {
    computeSearchProgressDisplay,
    nextSearchProgressAccumulator,
    SearchProgressState
} from './searchProgressModel';

const pairwiseStart: SearchProgressState = {
    elapsedMs: 1000,
    stage: 'pairwise',
    completedUnits: 100,
    totalUnits: 1000,
    heartbeat: false
};

const accumulatorAfterPairwiseStart = nextSearchProgressAccumulator(pairwiseStart, null);
const pairwiseDisplay = computeSearchProgressDisplay(pairwiseStart, accumulatorAfterPairwiseStart);
assert.equal(pairwiseDisplay.stagePercent, 10, 'Pairwise stage percent should be unit-complete ratio.');
assert.equal(pairwiseDisplay.phaseLabel, 'Phase 1 / 3', 'Pairwise stage should map to phase 1.');
assert.match(pairwiseDisplay.throughputLabel, /Rate warming up|Rate \d+\.\d units\/s/, 'Pairwise throughput label should be populated.');

const pairwiseAdvance: SearchProgressState = {
    ...pairwiseStart,
    elapsedMs: 5000,
    completedUnits: 700
};
const accumulatorAfterPairwiseAdvance = nextSearchProgressAccumulator(pairwiseAdvance, accumulatorAfterPairwiseStart);
const pairwiseAdvanceDisplay = computeSearchProgressDisplay(pairwiseAdvance, accumulatorAfterPairwiseAdvance);
assert.equal(pairwiseAdvanceDisplay.stagePercent, 70, 'Pairwise stage percentage should track bounded completion.');
assert.match(pairwiseAdvanceDisplay.throughputLabel, /Rate \d+\.\d units\/s/, 'Throughput should become numeric after stage advances.');
assert.equal(pairwiseAdvanceDisplay.overallEstimatePercent, 23, 'Overall estimate should use equal phase partitioning.');

const tripletStart: SearchProgressState = {
    elapsedMs: 6000,
    stage: 'triplet',
    completedUnits: 0,
    totalUnits: 500,
    heartbeat: false
};
const accumulatorAfterTripletTransition = nextSearchProgressAccumulator(tripletStart, accumulatorAfterPairwiseAdvance);
assert.equal(
    accumulatorAfterTripletTransition.stageStartElapsedMs,
    tripletStart.elapsedMs,
    'Stage transition must reset stage elapsed baseline.'
);
const tripletDisplay = computeSearchProgressDisplay(tripletStart, accumulatorAfterTripletTransition);
assert.equal(tripletDisplay.phaseLabel, 'Phase 2 / 3', 'Triplet stage should map to phase 2.');
assert.equal(tripletDisplay.stagePercent, 0, 'Triplet stage at zero completion should render zero stage percent.');

const heartbeatDisplay = computeSearchProgressDisplay({ ...tripletStart, heartbeat: true }, accumulatorAfterTripletTransition);
assert.match(
    heartbeatDisplay.stageLabel,
    /collecting stage metrics/,
    'Heartbeat updates should expose liveness metadata in label.'
);

console.log('searchProgressModel test passed.');
