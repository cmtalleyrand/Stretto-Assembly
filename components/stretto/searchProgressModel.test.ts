import assert from 'node:assert/strict';
import {
    computeSearchProgressDisplay,
    nextSearchProgressAccumulator,
    SearchProgressState
} from './searchProgressModel';

// Test: Stage transitions and phase labels are correct
function testPhaseLabels() {
    const pairwiseState: SearchProgressState = {
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
            dagEdgesEvaluated: 0,
            dagExploredWorkItems: 0,
            dagLiveFrontierWorkItems: 0
        },
        heartbeat: false
    };

    const acc1 = nextSearchProgressAccumulator(pairwiseState, null);
    const pairwiseDisplay = computeSearchProgressDisplay(pairwiseState, acc1);
    assert.match(pairwiseDisplay.phaseLabel, /Phase 1/, 'Pairwise stage should map to phase 1');

    const tripletState: SearchProgressState = {
        ...pairwiseState,
        elapsedMs: 2000,
        stage: 'triplet'
    };
    const acc2 = nextSearchProgressAccumulator(tripletState, acc1);
    const tripletDisplay = computeSearchProgressDisplay(tripletState, acc2);
    assert.match(tripletDisplay.phaseLabel, /Phase 2/, 'Triplet stage should map to phase 2');

    const dagState: SearchProgressState = {
        ...pairwiseState,
        elapsedMs: 3000,
        stage: 'dag'
    };
    const acc3 = nextSearchProgressAccumulator(dagState, acc2);
    const dagDisplay = computeSearchProgressDisplay(dagState, acc3);
    assert.match(dagDisplay.phaseLabel, /Phase 3/, 'DAG stage should map to phase 3');
}

// Test: Stage estimates are bounded [0, 100] and monotone non-decreasing
function testStageEstimateMonotonicity() {
    let previousEstimate = -1;
    const stages = [0, 25, 50, 75, 100];

    for (const progress of stages) {
        const state: SearchProgressState = {
            elapsedMs: 1000 + progress * 100,
            stage: 'pairwise',
            completedUnits: progress,
            totalUnits: 100,
            terminal: false,
            telemetry: {
                validPairs: 0,
                validTriplets: 0,
                chainsFound: 0,
                maxDepthReached: 1,
                targetChainLength: 8,
                pairwiseOperationsProcessed: progress,
                tripletOperationsProcessed: 0,
                dagNodesExpanded: 0,
                dagEdgesEvaluated: 0,
                dagExploredWorkItems: 0,
                dagLiveFrontierWorkItems: 0
            },
            heartbeat: false
        };
        const acc = nextSearchProgressAccumulator(state, null);
        const display = computeSearchProgressDisplay(state, acc);

        assert.ok(display.stageEstimatePercent >= 0 && display.stageEstimatePercent <= 100,
            `Stage estimate must be in [0, 100], got ${display.stageEstimatePercent}`);
        assert.ok(display.stageEstimatePercent >= previousEstimate,
            `Stage estimate must be monotone: was ${previousEstimate}, now ${display.stageEstimatePercent}`);
        previousEstimate = display.stageEstimatePercent;
    }
}

// Test: Overall estimates are bounded [0, 100]
function testOverallEstimateBounds() {
    const state: SearchProgressState = {
        elapsedMs: 5000,
        stage: 'dag',
        completedUnits: 50,
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
            dagEdgesEvaluated: 8400,
            dagExploredWorkItems: 1200,
            dagLiveFrontierWorkItems: 400
        },
        heartbeat: false
    };

    const acc = nextSearchProgressAccumulator(state, null);
    const display = computeSearchProgressDisplay(state, acc);

    assert.ok(display.overallEstimatePercent >= 0 && display.overallEstimatePercent <= 100,
        `Overall estimate must be in [0, 100], got ${display.overallEstimatePercent}`);
    assert.equal(display.dagEdgesPerExpandedNode, 7, 'DAG edges/node should expose transition branching factor.');
    assert.equal(display.dagCompletionLowerBoundPercent, 75, 'Completion lower bound should use explored/(explored+live) when heuristic ratio is absent.');
    assert.equal(Math.round(display.dagFrontierPressurePercent ?? 0), 25, 'Frontier pressure should expose live frontier share.');
    assert.match(display.countersLabel, /DAG edges evaluated per DAG node expanded 7\.00/, 'DAG counters should include edges-per-node diagnostic with glossary terms.');
}

// Test: Terminal state reaches 100% overall estimate
function testTerminalState() {
    const terminalState: SearchProgressState = {
        elapsedMs: 10000,
        stage: 'dag',
        completedUnits: 100,
        totalUnits: 100,
        terminal: true,
        telemetry: {
            validPairs: 600,
            validTriplets: 200,
            chainsFound: 10,
            maxDepthReached: 8,
            targetChainLength: 8,
            pairwiseOperationsProcessed: 700,
            tripletOperationsProcessed: 4500,
            dagNodesExpanded: 5000,
            dagEdgesEvaluated: 20000,
            dagExploredWorkItems: 5000,
            dagLiveFrontierWorkItems: 0
        },
        heartbeat: false
    };

    const acc = nextSearchProgressAccumulator(terminalState, null);
    const display = computeSearchProgressDisplay(terminalState, acc);

    assert.equal(display.overallEstimatePercent, 100, 'Terminal state should show 100% overall estimate');
}

// Test: Throughput label formatting
function testThroughputLabel() {
    const state: SearchProgressState = {
        elapsedMs: 5000,
        stage: 'pairwise',
        completedUnits: 700,
        totalUnits: 1000,
        terminal: false,
        telemetry: {
            validPairs: 0,
            validTriplets: 0,
            chainsFound: 0,
            maxDepthReached: 1,
            targetChainLength: 8,
            pairwiseOperationsProcessed: 700,
            tripletOperationsProcessed: 0,
            dagNodesExpanded: 0,
            dagEdgesEvaluated: 0,
            dagExploredWorkItems: 0,
            dagLiveFrontierWorkItems: 0
        },
        heartbeat: false
    };

    const acc = nextSearchProgressAccumulator(state, null);
    const display = computeSearchProgressDisplay(state, acc);

    // Throughput label should contain "Rate" and be well-formed
    assert.ok(display.throughputLabel.includes('Rate'),
        `Throughput label should contain "Rate", got: ${display.throughputLabel}`);
    assert.match(display.countersLabel, /Pairwise operations processed/, 'Pairwise stage should emit glossary-aligned pairwise counter terminology.');
}

// Test: Heartbeat mode shows liveness indicator
function testHeartbeatLabel() {
    const heartbeatState: SearchProgressState = {
        elapsedMs: 5000,
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
            dagEdgesEvaluated: 0,
            dagExploredWorkItems: 0,
            dagLiveFrontierWorkItems: 0
        },
        heartbeat: true
    };

    const acc = nextSearchProgressAccumulator(heartbeatState, null);
    const display = computeSearchProgressDisplay(heartbeatState, acc);

    // Heartbeat should show liveness indicator
    assert.ok(display.stageLabel.length > 0, 'Stage label should be populated on heartbeat');
}

// Run all tests
testPhaseLabels();
testStageEstimateMonotonicity();
testOverallEstimateBounds();
testTerminalState();
testThroughputLabel();
testHeartbeatLabel();

console.log('searchProgressModel tests passed: all invariants validated.');
