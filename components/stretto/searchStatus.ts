import { StrettoSearchReport } from '../../types';

export interface SearchStatusPresentation {
  heading: string;
  detail: string;
  toneClass: string;
  progressPercent: number;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
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
    const closeToTarget = maxDepth >= Math.max(1, safeTarget - 1);
    if (closeToTarget) {
      return {
        heading: 'Search Timed Out Near Completion',
        detail: `Depth progress ${maxDepth}/${safeTarget} (${progressPercent}%). Search reached near-target depth before timeout.${extensionText}`,
        toneClass: 'bg-yellow-900/30 border-yellow-800 text-yellow-200',
        progressPercent
      };
    }

    return {
      heading: 'Search Timed Out Before Target Depth',
      detail: `Depth progress ${maxDepth}/${safeTarget} (${progressPercent}%). This indicates search-space growth under current settings; guidance is to reduce branching factor (e.g., stricter structural constraints) or rerun with more time.${extensionText}`,
      toneClass: 'bg-yellow-900/30 border-yellow-800 text-yellow-200',
      progressPercent
    };
  }

  if (report.stats.stopReason === 'NodeLimit') {
    return {
      heading: 'Search Node Budget Reached',
      detail: `Depth progress ${maxDepth}/${safeTarget} (${progressPercent}%). Node budget saturation indicates combinatorial explosion; tighten admissibility constraints to decrease branching complexity.`,
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
