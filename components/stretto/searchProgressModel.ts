export type SearchProgressStage = 'pairwise' | 'triplet' | 'dag';

export interface SearchProgressState {
    elapsedMs: number;
    stage: SearchProgressStage;
    completedUnits: number;
    totalUnits: number;
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
    stagePercent: number;
    overallEstimatePercent: number;
    unitLabel: string;
    phaseLabel: string;
    throughputLabel: string;
    etaLabel: string;
    rateUnitLabel: string;
    stars: string;
    isHeartbeat: boolean;
}

const STAGE_ORDER: SearchProgressStage[] = ['pairwise', 'triplet', 'dag'];

const STAGE_LABELS: Record<SearchProgressStage, string> = {
    pairwise: 'Pairwise compatibility scan',
    triplet: 'Triplet compatibility indexing',
    dag: 'Chain expansion and scoring'
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
            stagePercent: 0,
            overallEstimatePercent: 0,
            unitLabel: '0 / 1',
            phaseLabel: 'Phase 0 / 3',
            throughputLabel: 'Rate n/a',
            etaLabel: 'ETA n/a',
            rateUnitLabel: 'units/s',
            stars: '☆☆☆☆☆☆☆☆☆☆',
            isHeartbeat: false
        };
    }

    const boundedTotal = Math.max(1, progress.totalUnits);
    const boundedCompleted = Math.max(0, Math.min(progress.completedUnits, boundedTotal));
    const stagePercent = Math.round((boundedCompleted / boundedTotal) * 100);
    const phaseIndex = STAGE_ORDER.indexOf(progress.stage);
    const safePhaseIndex = phaseIndex < 0 ? 0 : phaseIndex;
    const rawOverallPercent = Math.round((safePhaseIndex * STAGE_SPAN_PERCENT) + ((stagePercent / 100) * STAGE_SPAN_PERCENT));
    const isComplete = progress.stage === 'dag' && boundedCompleted >= boundedTotal;
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

    return {
        stageLabel: progress.heartbeat ? 'Search active (collecting stage metrics)' : STAGE_LABELS[progress.stage],
        stagePercent,
        overallEstimatePercent,
        unitLabel: `${boundedCompleted.toLocaleString()} / ${boundedTotal.toLocaleString()}`,
        phaseLabel: `Phase ${safePhaseIndex + 1} / ${STAGE_ORDER.length}`,
        throughputLabel: throughputRate > 0 ? `Rate ${throughputRate.toFixed(1)} ${rateUnitLabel}` : 'Rate warming up',
        etaLabel: `ETA ${formatSeconds(etaSeconds)}`,
        rateUnitLabel,
        stars: '★'.repeat(filledStars).padEnd(10, '☆'),
        isHeartbeat: progress.heartbeat
    };
}
