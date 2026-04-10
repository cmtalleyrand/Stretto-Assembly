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
    terminal: false,
    telemetry: { validPairs: 0, validTriplets: 0, chainsFound: 0, maxDepthReached: 1, targetChainLength: 8 },
    heartbeat: false
};

const accumulatorAfterPairwiseStart = nextSearchProgressAccumulator(pairwiseStart, null);
const pairwiseDisplay = computeSearchProgressDisplay(pairwiseStart, accumulatorAfterPairwiseStart);
assert.equal(pairwiseDisplay.stageEstimatePercent, 10, 'Pairwise stage estimate should be unit-complete ratio.');
assert.equal(pairwiseDisplay.phaseLabel, 'Phase 1 / 3', 'Pairwise stage should map to phase 1.');
assert.match(pairwiseDisplay.throughputLabel, /Rate warming up|Rate \d+\.\d units\/s/, 'Pairwise throughput label should be populated.');

const pairwiseAdvance: SearchProgressState = {
    ...pairwiseStart,
    elapsedMs: 5000,
    completedUnits: 700
};
const accumulatorAfterPairwiseAdvance = nextSearchProgressAccumulator(pairwiseAdvance, accumulatorAfterPairwiseStart);
const pairwiseAdvanceDisplay = computeSearchProgressDisplay(pairwiseAdvance, accumulatorAfterPairwiseAdvance);
assert.equal(pairwiseAdvanceDisplay.stageEstimatePercent, 70, 'Pairwise stage estimate should track bounded completion.');
assert.match(pairwiseAdvanceDisplay.throughputLabel, /Rate \d+\.\d units\/s/, 'Throughput should become numeric after stage advances.');
assert.equal(pairwiseAdvanceDisplay.overallEstimatePercent, 23, 'Overall estimate should use equal phase partitioning.');

const tripletStart: SearchProgressState = {
    elapsedMs: 6000,
    stage: 'triplet',
    completedUnits: 0,
    totalUnits: 500,
    terminal: false,
    telemetry: { validPairs: 600, validTriplets: 0, chainsFound: 0, maxDepthReached: 3, targetChainLength: 8 },
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
assert.equal(tripletDisplay.stageEstimatePercent, 0, 'Triplet stage at zero completion should render zero stage estimate.');

const heartbeatDisplay = computeSearchProgressDisplay({ ...tripletStart, heartbeat: true }, accumulatorAfterTripletTransition);
assert.match(
    heartbeatDisplay.stageLabel,
    /collecting stage metrics/,
    'Heartbeat updates should expose liveness metadata in label.'
);
assert.equal(heartbeatDisplay.isHeuristic, true, 'Display should explicitly mark stage values as heuristic estimates.');

const dagNonTerminal: SearchProgressState = {
    elapsedMs: 7000,
    stage: 'dag',
    completedUnits: 100,
    totalUnits: 100,
    terminal: false,
    telemetry: { validPairs: 600, validTriplets: 200, chainsFound: 10, maxDepthReached: 7, targetChainLength: 8 },
    heartbeat: false
};
const dagNonTerminalDisplay = computeSearchProgressDisplay(dagNonTerminal, nextSearchProgressAccumulator(dagNonTerminal, accumulatorAfterTripletTransition));
assert.equal(dagNonTerminalDisplay.stageEstimatePercent, 100, 'Stage estimate may numerically reach 100 before terminal confirmation.');
assert.equal(dagNonTerminalDisplay.overallEstimatePercent, 99, 'Overall estimate must remain below 100 before terminal DAG completion conditions.');

const dagTerminal: SearchProgressState = {
    ...dagNonTerminal,
    terminal: true
};
const dagTerminalDisplay = computeSearchProgressDisplay(dagTerminal, nextSearchProgressAccumulator(dagTerminal, accumulatorAfterTripletTransition));
assert.equal(dagTerminalDisplay.overallEstimatePercent, 100, 'Overall estimate should reach 100 only under terminal DAG completion conditions.');

console.log('searchProgressModel test passed.');
