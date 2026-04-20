import { StrettoSearchReport } from '../../types';

export interface SearchStatusPresentation {
  heading: string;
  detail: string;
  toneClass: string;
  progressPercent: number;
}

export interface SearchRuntimePresentation {
  elapsedMs: number;
  budgetMs: number;
  elapsedPercent: number;
  estimatedRemainingMs: number;
}

export interface SearchDiagnosticsPresentation {
  summary: string;
  constraintSignals: string[];
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return clampPercent((numerator / denominator) * 100);
}

export function deriveSearchRuntimePresentation(elapsedMs: number, budgetMs: number): SearchRuntimePresentation {
  const safeBudgetMs = Math.max(1, Math.floor(budgetMs));
  const safeElapsedMs = Math.max(0, Math.floor(elapsedMs));
  const elapsedPercent = clampPercent((safeElapsedMs / safeBudgetMs) * 100);
  const estimatedRemainingMs = Math.max(0, safeBudgetMs - safeElapsedMs);
  return {
    elapsedMs: safeElapsedMs,
    budgetMs: safeBudgetMs,
    elapsedPercent,
    estimatedRemainingMs
  };
}

export function deriveSearchDiagnosticsPresentation(report: StrettoSearchReport): SearchDiagnosticsPresentation {
  const stageStats = report.stats.stageStats;
  const coverage = report.stats.coverage;

  if (!stageStats) {
    return {
      summary: 'Detailed search diagnostics unavailable for this run.',
      constraintSignals: []
    };
  }

  const pairRejectPercent = asPercent(stageStats.pairStageRejected, stageStats.pairwiseTotal);
  const pairCompatiblePercent = asPercent(stageStats.pairwiseCompatible, stageStats.pairwiseTotal);
  const tripletRejectedTotal = stageStats.tripletRejectedTotal
    ?? stageStats.triplePairwiseRejected + stageStats.tripleLowerBoundRejected + stageStats.tripleParallelRejected + stageStats.tripleVoiceRejected + stageStats.tripleP4BassRejected;
  const tripletAcceptedCandidates = stageStats.tripletCandidatesAccepted
    ?? stageStats.tripletAcceptedTotal
    ?? Math.max(0, stageStats.tripleCandidates - tripletRejectedTotal);
  const tripletDistinctShapesAccepted = stageStats.tripletDistinctShapesAccepted ?? stageStats.harmonicallyValidTriples;
  const tripleRejectPercent = asPercent(tripletRejectedTotal, stageStats.tripleCandidates);
  const tripletAcceptedPercent = asPercent(tripletAcceptedCandidates, stageStats.tripleCandidates);

  const signals: string[] = [];
  signals.push(`Pairwise combinations: ${stageStats.pairwiseTotal.toLocaleString()} total; ${stageStats.pairwiseCompatible.toLocaleString()} compatible (${pairCompatiblePercent}%), ${stageStats.pairStageRejected.toLocaleString()} rejected (${pairRejectPercent}%).`);
  signals.push(`Triplet candidates: ${stageStats.tripleCandidates.toLocaleString()} total; ${tripletAcceptedCandidates.toLocaleString()} accepted (${tripletAcceptedPercent}%), ${tripletRejectedTotal.toLocaleString()} rejected (${tripleRejectPercent}%). Distinct accepted shapes=${tripletDistinctShapesAccepted.toLocaleString()}.`);
  signals.push(`Triplet reject breakdown: pairwise=${stageStats.triplePairwiseRejected}, lowerBound=${stageStats.tripleLowerBoundRejected}, parallel=${stageStats.tripleParallelRejected}, voice=${stageStats.tripleVoiceRejected}, p4Bass=${stageStats.tripleP4BassRejected}.`);
  signals.push(`Global-lineage rejects: ${stageStats.globalLineageStageRejected}. Structural scans: ${stageStats.structuralScanInvocations.toLocaleString()}. DAG merges: ${stageStats.deterministicDagMergedNodes.toLocaleString()}.`);

  if (coverage) {
    const coverageTerms: string[] = [];
    if (typeof coverage.nodeBudgetUsedPercent === 'number') {
      coverageTerms.push(`nodeBudgetUsedPercent=${coverage.nodeBudgetUsedPercent}%`);
    }
    const completionAssumptionsHold = coverage.completionLowerBoundAssumptions?.monotoneQueuedWorkItems === true;
    if (completionAssumptionsHold && typeof coverage.completionLowerBound === 'number') {
      coverageTerms.push(`completionRatioLowerBound(heuristic)=${Math.round(coverage.completionLowerBound * 100)}%`);
    }
    coverageTerms.push(`exploredWorkItems=${coverage.exploredWorkItems.toLocaleString()}`);
    coverageTerms.push(`liveFrontierWorkItems=${coverage.liveFrontierWorkItems.toLocaleString()}`);
    coverageTerms.push(`maxFrontierSize=${coverage.maxFrontierSize.toLocaleString()}`);
    coverageTerms.push(`classes=${coverage.maxFrontierClassCount.toLocaleString()}`);
    coverageTerms.push(`terminationFrontier=${coverage.frontierSizeAtTermination.toLocaleString()} (${coverage.frontierClassesAtTermination.toLocaleString()} classes)`);
    signals.push(`Coverage: ${coverageTerms.join(' ')}.`);
  }

  return {
    summary: 'Stage-level counts only (no inferred root-cause classification).',
    constraintSignals: signals
  };
}

export function deriveSearchStatusPresentation(
  report: StrettoSearchReport,
  targetChainLength: number
): SearchStatusPresentation {
  const maxDepth = report.stats.maxDepthReached;
  const safeTarget = Math.max(1, targetChainLength);
  const progressPercent = clampPercent((maxDepth / safeTarget) * 100);
  const extensionMs = report.stats.timeoutExtensionAppliedMs || 0;
  const extensionText = extensionMs > 0 ? ` Timeout extension used: +${extensionMs}ms.` : '';

  if (report.stats.stopReason === 'Success') {
    return {
      heading: 'Search Succeeded',
      detail: `Target depth reached (${safeTarget}/${safeTarget}, ${progressPercent}%).${extensionText}`,
      toneClass: 'bg-green-900/30 border-green-800 text-green-200',
      progressPercent
    };
  }

  if (report.stats.stopReason === 'Timeout') {
    return {
      heading: 'Search Timed Out',
      detail: `Depth ${maxDepth}/${safeTarget} (${progressPercent}%).${extensionText}`,
      toneClass: 'bg-yellow-900/30 border-yellow-800 text-yellow-200',
      progressPercent
    };
  }

  if (report.stats.stopReason === 'NodeLimit') {
    return {
      heading: 'Search Node Budget Reached',
      detail: `Depth ${maxDepth}/${safeTarget} (${progressPercent}%). Node budget reached.`,
      toneClass: 'bg-yellow-900/30 border-yellow-800 text-yellow-200',
      progressPercent
    };
  }

  if (maxDepth > 0) {
    return {
      heading: 'Search Exhausted with Partial Depth',
      detail: `No full chain at requested depth ${safeTarget}; deepest valid depth was ${maxDepth} (${progressPercent}%).`,
      toneClass: 'bg-orange-900/30 border-orange-800 text-orange-200',
      progressPercent
    };
  }

  return {
    heading: 'Search Exhausted with No Valid Chain',
    detail: `No valid chain prefixes were retained at depth >= 1 for target depth ${safeTarget}; revise admissibility constraints or source material.`,
    toneClass: 'bg-red-900/30 border-red-800 text-red-200',
    progressPercent
  };
}
