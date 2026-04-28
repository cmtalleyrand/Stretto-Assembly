export type SearchProgressStage = 'pairwise' | 'triplet' | 'dag';

export interface SearchProgressState {
    elapsedMs: number;
    stage: SearchProgressStage;
    completedUnits: number;
    totalUnits: number;
    terminal: boolean;
    telemetry: {
        validPairs: number;
        validTriplets: number;
        chainsFound: number;
        maxDepthReached: number;
        targetChainLength: number;
        pairwiseOperationsProcessed: number;
        tripletOperationsProcessed: number;
        dagNodesExpanded: number;
        dagEdgesEvaluated: number;
        dagExploredWorkItems: number;
        dagLiveFrontierWorkItems: number;
        dagHeuristicCompletionRatio?: number;
    };
    heartbeat: boolean;
}

export interface SearchProgressAccumulator {
    stage: SearchProgressStage;
    stageStartElapsedMs: number;
    stageStartCompletedUnits: number;
    stageStartOperationCounter: number;
}

export interface SearchProgressDisplay {
    stageLabel: string;
    stageEstimatePercent: number;
    stagePercent: number;
    overallEstimatePercent: number;
    unitLabel: string;
    phaseLabel: string;
    throughputLabel: string;
    etaLabel: string;
    rateUnitLabel: string;
    stars: string;
    isHeartbeat: boolean;
    depthAxisPercent: number;
    traversalCompletionPercent: number | null;
    countersLabel: string;
    dagEdgesPerExpandedNode: number | null;
    dagFrontierPressurePercent: number | null;
    dagCompletionLowerBoundPercent: number | null;
}

const STAGE_ORDER: SearchProgressStage[] = ['pairwise', 'triplet', 'dag'];

export const STAGE_LABELS: Record<SearchProgressStage, string> = {
    pairwise: 'Stage 1/3 — Pairwise compatibility',
    triplet:  'Stage 2/3 — Triplet harmonic check',
    dag:      'Stage 3/3 — Chain assembly',
};

const STAGE_SPAN_PERCENT = 100 / STAGE_ORDER.length;

function formatSeconds(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return 'n/a';
    if (seconds < 1) return '<1s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${(seconds / 60).toFixed(1)}m`;
}

export function nextSearchProgressAccumulator(
    progress: SearchProgressState,
    previous: SearchProgressAccumulator | null
): SearchProgressAccumulator {
    const stageOperationCounter = progress.stage === 'pairwise'
        ? progress.telemetry.pairwiseOperationsProcessed
        : progress.stage === 'triplet'
            ? progress.telemetry.tripletOperationsProcessed
            : progress.telemetry.dagEdgesEvaluated + progress.telemetry.dagNodesExpanded;
    if (!previous || previous.stage !== progress.stage) {
        return {
            stage: progress.stage,
            stageStartElapsedMs: progress.elapsedMs,
            stageStartCompletedUnits: progress.completedUnits,
            stageStartOperationCounter: stageOperationCounter
        };
    }
    return previous;
}

export function computeSearchProgressDisplay(
    progress: SearchProgressState | null,
    accumulator: SearchProgressAccumulator | null
): SearchProgressDisplay {
    if (!progress) {
        return {
            stageLabel: 'Initializing search worker',
            stageEstimatePercent: 0,
            stagePercent: 0,
            overallEstimatePercent: 0,
            unitLabel: '0 / 1',
            phaseLabel: 'Phase 0 / 3',
            throughputLabel: 'Rate n/a',
            etaLabel: 'ETA n/a',
            rateUnitLabel: 'units/s',
            stars: '☆☆☆☆☆☆☆☆☆☆',
            isHeartbeat: false,
            depthAxisPercent: 0,
            traversalCompletionPercent: null,
            countersLabel: 'explored 0 · live 0 · nodes 0 · edges 0 · maxDepth 0',
            dagEdgesPerExpandedNode: null,
            dagFrontierPressurePercent: null,
            dagCompletionLowerBoundPercent: null,
        };
    }

    const boundedTotal = Math.max(1, progress.totalUnits);
    const boundedCompleted = Math.max(0, Math.min(progress.completedUnits, boundedTotal));
    const stageEstimatePercent = Math.round((boundedCompleted / boundedTotal) * 100);
    const phaseIndex = STAGE_ORDER.indexOf(progress.stage);
    const safePhaseIndex = phaseIndex < 0 ? 0 : phaseIndex;
    const rawOverallPercent = Math.round((safePhaseIndex * STAGE_SPAN_PERCENT) + ((stageEstimatePercent / 100) * STAGE_SPAN_PERCENT));
    const isComplete = progress.stage === 'dag'
        && boundedCompleted >= boundedTotal
        && progress.terminal;
    const overallEstimatePercent = isComplete ? 100 : Math.max(0, Math.min(99, rawOverallPercent));

    const stageOperationCounter = progress.stage === 'pairwise'
        ? progress.telemetry.pairwiseOperationsProcessed
        : progress.stage === 'triplet'
            ? progress.telemetry.tripletOperationsProcessed
            : progress.telemetry.dagEdgesEvaluated + progress.telemetry.dagNodesExpanded;
    const activeAccumulator = accumulator ?? {
        stage: progress.stage,
        stageStartElapsedMs: progress.elapsedMs,
        stageStartCompletedUnits: progress.completedUnits,
        stageStartOperationCounter: stageOperationCounter
    };
    const stageElapsedMs = Math.max(1, progress.elapsedMs - activeAccumulator.stageStartElapsedMs);
    const stageProcessedUnits = Math.max(0, boundedCompleted - activeAccumulator.stageStartCompletedUnits);
    const depthBasedRateUnitsPerSecond = stageProcessedUnits / (stageElapsedMs / 1000);
    const remainingDepthUnits = Math.max(0, boundedTotal - boundedCompleted);
    const depthBasedEtaSeconds = depthBasedRateUnitsPerSecond > 0 ? remainingDepthUnits / depthBasedRateUnitsPerSecond : Number.POSITIVE_INFINITY;
    const dagOperationCounter = progress.telemetry.dagEdgesEvaluated + progress.telemetry.dagNodesExpanded;
    const stageStartOperationCounter = activeAccumulator.stage === progress.stage
        ? activeAccumulator.stageStartOperationCounter
        : stageOperationCounter;
    const stageProcessedOperations = Math.max(0, stageOperationCounter - stageStartOperationCounter);
    const operationRatePerSecond = stageProcessedOperations / (stageElapsedMs / 1000);
    const dagProgressRatio = boundedCompleted / boundedTotal;
    const dagEstimatedRemainingOperations = (progress.stage === 'dag' && dagOperationCounter > 0 && dagProgressRatio > 0)
        ? dagOperationCounter * ((1 / dagProgressRatio) - 1)
        : Number.POSITIVE_INFINITY;
    const rateUnitLabel = progress.stage === 'dag' ? 'nodes/s' : 'combinations/s';
    const throughputRate = progress.stage === 'dag' ? operationRatePerSecond : depthBasedRateUnitsPerSecond;
    const etaSeconds = progress.stage === 'dag'
        ? (operationRatePerSecond > 0 ? dagEstimatedRemainingOperations / operationRatePerSecond : Number.POSITIVE_INFINITY)
        : depthBasedEtaSeconds;

    const filledStars = Math.max(1, Math.min(10, Math.round(overallEstimatePercent / 10)));
    const depthAxisPercent = Math.max(
        0,
        Math.min(100, Math.round((progress.telemetry.maxDepthReached / Math.max(1, progress.telemetry.targetChainLength)) * 100))
    );
    const queueDenominator = progress.telemetry.dagExploredWorkItems + progress.telemetry.dagLiveFrontierWorkItems;
    const traversalCompletionPercent = queueDenominator > 0
        ? Math.max(0, Math.min(100, Math.round((progress.telemetry.dagExploredWorkItems / queueDenominator) * 100)))
        : null;
    const dagEdgesPerExpandedNode = progress.telemetry.dagNodesExpanded > 0
        ? progress.telemetry.dagEdgesEvaluated / progress.telemetry.dagNodesExpanded
        : null;
    const dagFrontierPressurePercent = queueDenominator > 0
        ? Math.max(0, Math.min(100, (progress.telemetry.dagLiveFrontierWorkItems / queueDenominator) * 100))
        : null;
    const lowerBoundRatio = Number.isFinite(progress.telemetry.dagHeuristicCompletionRatio ?? Number.NaN)
        ? Math.max(0, Math.min(1, progress.telemetry.dagHeuristicCompletionRatio as number))
        : queueDenominator > 0
            ? progress.telemetry.dagExploredWorkItems / queueDenominator
            : 0;
    const dagCompletionLowerBoundPercent = Math.round(lowerBoundRatio * 100);
    const countersLabel = progress.stage === 'dag'
        ? `DAG explored ${progress.telemetry.dagExploredWorkItems.toLocaleString()} · live ${progress.telemetry.dagLiveFrontierWorkItems.toLocaleString()} · edges/node ${(dagEdgesPerExpandedNode ?? 0).toFixed(2)} · frontier pressure ${(dagFrontierPressurePercent ?? 0).toFixed(1)}% · completion lower bound ${dagCompletionLowerBoundPercent}% · maxDepth ${progress.telemetry.maxDepthReached.toLocaleString()}`
        : progress.stage === 'triplet'
            ? `Triplet operations ${progress.telemetry.tripletOperationsProcessed.toLocaleString()} · valid triplets ${progress.telemetry.validTriplets.toLocaleString()} · valid pairs ${progress.telemetry.validPairs.toLocaleString()}`
            : `Pairwise operations ${progress.telemetry.pairwiseOperationsProcessed.toLocaleString()} · valid pairs ${progress.telemetry.validPairs.toLocaleString()}`;

    return {
        stageLabel: progress.heartbeat ? 'Search active (collecting stage metrics)' : STAGE_LABELS[progress.stage],
        stageEstimatePercent,
        stagePercent: stageEstimatePercent,
        overallEstimatePercent,
        unitLabel: `${boundedCompleted.toLocaleString()} / ${boundedTotal.toLocaleString()}`,
        phaseLabel: `Phase ${safePhaseIndex + 1} / ${STAGE_ORDER.length}`,
        throughputLabel: throughputRate > 0 ? `Rate ${throughputRate.toFixed(1)} ${rateUnitLabel}` : 'Rate warming up',
        etaLabel: `ETA ${formatSeconds(etaSeconds)}`,
        rateUnitLabel,
        stars: '★'.repeat(filledStars).padEnd(10, '☆'),
        isHeartbeat: progress.heartbeat,
        depthAxisPercent,
        traversalCompletionPercent,
        countersLabel,
        dagEdgesPerExpandedNode,
        dagFrontierPressurePercent,
        dagCompletionLowerBoundPercent,
    };
}
