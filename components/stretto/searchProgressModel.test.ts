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
    telemetry: {
        validPairs: 0,
        validTriplets: 0,
        chainsFound: 0,
        maxDepthReached: 1,
        targetChainLength: 8,
        pairwiseOperationsProcessed: 100,
        tripletOperationsProcessed: 0,
        dagNodesExpanded: 0,
        dagEdgesEvaluated: 0
    },
    heartbeat: false
};

const accumulatorAfterPairwiseStart = nextSearchProgressAccumulator(pairwiseStart, null);
const pairwiseDisplay = computeSearchProgressDisplay(pairwiseStart, accumulatorAfterPairwiseStart);
assert.equal(pairwiseDisplay.stageEstimatePercent, 10, 'Pairwise stage estimate should be unit-complete ratio.');
assert.equal(pairwiseDisplay.phaseLabel, 'Phase 1 / 3', 'Pairwise stage should map to phase 1.');
assert.match(pairwiseDisplay.throughputLabel, /Rate warming up|Rate \d+\.\d combinations\/s/, 'Pairwise throughput label should be populated.');

const pairwiseAdvance: SearchProgressState = {
    ...pairwiseStart,
    elapsedMs: 5000,
    completedUnits: 700,
    telemetry: {
        ...pairwiseStart.telemetry,
        pairwiseOperationsProcessed: 700
    }
};
const accumulatorAfterPairwiseAdvance = nextSearchProgressAccumulator(pairwiseAdvance, accumulatorAfterPairwiseStart);
const pairwiseAdvanceDisplay = computeSearchProgressDisplay(pairwiseAdvance, accumulatorAfterPairwiseAdvance);
assert.equal(pairwiseAdvanceDisplay.stageEstimatePercent, 70, 'Pairwise stage estimate should track bounded completion.');
assert.match(pairwiseAdvanceDisplay.throughputLabel, /Rate \d+\.\d combinations\/s/, 'Throughput should become numeric after stage advances.');
assert.equal(pairwiseAdvanceDisplay.overallEstimatePercent, 23, 'Overall estimate should use equal phase partitioning.');

const tripletStart: SearchProgressState = {
    elapsedMs: 6000,
    stage: 'triplet',
    completedUnits: 0,
    totalUnits: 500,
    terminal: false,
    telemetry: {
        validPairs: 600,
        validTriplets: 0,
        chainsFound: 0,
        maxDepthReached: 3,
        targetChainLength: 8,
        pairwiseOperationsProcessed: 700,
        tripletOperationsProcessed: 0,
        dagNodesExpanded: 0,
        dagEdgesEvaluated: 0
    },
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
    telemetry: {
        validPairs: 600,
        validTriplets: 200,
        chainsFound: 10,
        maxDepthReached: 7,
        targetChainLength: 8,
        pairwiseOperationsProcessed: 700,
        tripletOperationsProcessed: 4500,
        dagNodesExpanded: 1200,
        dagEdgesEvaluated: 8400
    },
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

const dagStart: SearchProgressState = {
    elapsedMs: 10000,
    stage: 'dag',
    completedUnits: 4,
    totalUnits: 8,
    telemetry: {
        ...tripletStart.telemetry,
        maxDepthReached: 4,
        dagNodesExpanded: 200,
        dagEdgesEvaluated: 400
    },
    heartbeat: false
};
const accumulatorAfterDagTransition = nextSearchProgressAccumulator(dagStart, accumulatorAfterTripletTransition);
const dagAdvanceSameDepth: SearchProgressState = {
    ...dagStart,
    elapsedMs: 16000,
    completedUnits: 4,
    telemetry: {
        ...dagStart.telemetry,
        dagNodesExpanded: 380,
        dagEdgesEvaluated: 820
    }
};
const dagDisplay = computeSearchProgressDisplay(dagAdvanceSameDepth, accumulatorAfterDagTransition);
assert.match(dagDisplay.throughputLabel, /Rate \d+\.\d nodes\/s/, 'DAG throughput should use operation counters and node-denominated units.');
assert.match(dagDisplay.etaLabel, /ETA (?:<1s|\d+s|\d+\.\dm)/, 'DAG ETA should remain finite when operation counters advance despite constant depth.');

console.log('searchProgressModel test passed.');
