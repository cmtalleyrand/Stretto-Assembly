export type MetricEstimateClass = 'exact' | 'lower-bound' | 'heuristic';

export interface TelemetryGlossaryEntry {
  label: string;
  formalDefinition: string;
  unit: string;
  incrementSite: string;
  estimateClass: MetricEstimateClass;
}

export const STRETTO_TELEMETRY_GLOSSARY: Record<string, TelemetryGlossaryEntry> = {
  nodesVisited: {
    label: 'Nodes visited',
    formalDefinition: 'Total number of chain-state nodes expanded by deterministic DAG traversal during the completed run.',
    unit: 'count (nodes)',
    incrementSite: 'Incremented when a DAG state is dequeued for expansion in search traversal.',
    estimateClass: 'exact'
  },
  runTimeMs: {
    label: 'Run time',
    formalDefinition: 'Wall-clock duration consumed by the completed search execution from start to termination.',
    unit: 'milliseconds (ms)',
    incrementSite: 'Computed from search start and stop timestamps at terminal report emission.',
    estimateClass: 'exact'
  },
  progressPercent: {
    label: 'Depth progress',
    formalDefinition: 'Ratio of maximum realized chain depth to requested target depth, clamped to [0, 100].',
    unit: 'percent (%)',
    incrementSite: 'Recomputed from report.maxDepthReached and targetChainLength when status panel renders.',
    estimateClass: 'lower-bound'
  },
  maxDepthReached: {
    label: 'Max depth reached',
    formalDefinition: 'Greatest chain prefix length that survived all constraints at least once.',
    unit: 'count (entries)',
    incrementSite: 'Updated when traversal emits a deeper admissible chain prefix.',
    estimateClass: 'exact'
  },
  runtimePhaseHeuristic: {
    label: 'Budget phase label',
    formalDefinition: 'Heuristic partition of wall-clock budget consumption used as a rough narrative phase indicator; not a proof of algorithmic completion.',
    unit: 'categorical label',
    incrementSite: 'Derived from elapsedBudgetPercent buckets in deriveSearchRuntimePresentation.',
    estimateClass: 'heuristic'
  },
  elapsedBudgetPercent: {
    label: 'Time budget usage',
    formalDefinition: 'Ratio of elapsed wall-clock milliseconds to configured maxSearchTimeMs, clamped to [0, 100].',
    unit: 'percent (%)',
    incrementSite: 'Recomputed on each UI timer tick during active search.',
    estimateClass: 'exact'
  },
  elapsedWallClockMs: {
    label: 'Elapsed wall-clock',
    formalDefinition: 'Milliseconds elapsed since the UI observed the current search start event.',
    unit: 'milliseconds (ms)',
    incrementSite: 'Updated by 200ms interval in StrettoChainView while isSearching is true.',
    estimateClass: 'exact'
  },
  estimatedRemainingMs: {
    label: 'Estimated remaining',
    formalDefinition: 'Configured budget minus elapsed wall-clock milliseconds, floored at zero.',
    unit: 'milliseconds (ms)',
    incrementSite: 'Derived in deriveSearchRuntimePresentation from elapsed and budget.',
    estimateClass: 'heuristic'
  },
  structuralScanInvocations: {
    label: 'Structural scans',
    formalDefinition: 'Number of structural admissibility scans invoked during traversal.',
    unit: 'count (invocations)',
    incrementSite: 'Incremented at each structural constraint evaluation callsite.',
    estimateClass: 'exact'
  },
  pairStageRejected: {
    label: 'Pair rejects',
    formalDefinition: 'Pair candidates rejected before triplet formation due to pairwise admissibility constraints.',
    unit: 'count (pairs)',
    incrementSite: 'Incremented in pairwise compatibility filter when pair is rejected.',
    estimateClass: 'exact'
  },
  tripletStageRejected: {
    label: 'Triplet rejects',
    formalDefinition: 'Triplet candidates rejected by triplet-level harmonic and policy constraints.',
    unit: 'count (triplets)',
    incrementSite: 'Incremented after triplet candidate evaluation returns inadmissible.',
    estimateClass: 'exact'
  },
  globalLineageStageRejected: {
    label: 'Global rejects',
    formalDefinition: 'Candidates rejected by lineage/global-history constraints after local validity checks.',
    unit: 'count (candidates)',
    incrementSite: 'Incremented when global lineage policy vetoes a candidate transition.',
    estimateClass: 'exact'
  },
  transitionRowsReturned: {
    label: 'Returned rows',
    formalDefinition: 'Number of transition rows emitted by transition-generation routines.',
    unit: 'count (rows)',
    incrementSite: 'Incremented when an admissible transition record is appended to return buffer.',
    estimateClass: 'exact'
  },
  transitionCandidatesEnumerated: {
    label: 'Enumerated candidates',
    formalDefinition: 'Number of transition candidates constructed for potential filtering.',
    unit: 'count (candidates)',
    incrementSite: 'Incremented at transition candidate enumeration loop prior to accept/reject.',
    estimateClass: 'exact'
  },
  nodeBudgetUsedPercent: {
    label: 'Node budget usage',
    formalDefinition: 'Fraction of global node-expansion budget consumed by traversal.',
    unit: 'percent (%)',
    incrementSite: 'Computed from nodesVisited relative to configured node-cap at diagnostics finalization.',
    estimateClass: 'exact'
  },
  completionRatioLowerBound: {
    label: 'Completion lower bound',
    formalDefinition: 'Lower-bound estimator of completion derived from explored-frontier coverage statistics.',
    unit: 'percent (%)',
    incrementSite: 'Derived from termination frontier coverage metrics.',
    estimateClass: 'lower-bound'
  },
  maxFrontierSize: {
    label: 'Max frontier size',
    formalDefinition: 'Maximum number of frontier nodes retained simultaneously during DAG expansion.',
    unit: 'count (nodes)',
    incrementSite: 'Updated when a frontier snapshot exceeds prior peak size.',
    estimateClass: 'exact'
  },
  stagePercent: {
    label: 'Stage progress',
    formalDefinition: 'Displayed completion percentage within the current progress stage, using stage units and heartbeat reconciliation.',
    unit: 'percent (%)',
    incrementSite: 'Derived by computeSearchProgressDisplay from current telemetry and accumulator state.',
    estimateClass: 'heuristic'
  },
  overallEstimatePercent: {
    label: 'Overall estimate',
    formalDefinition: 'Cross-stage completion estimator combining phase priors and current stage progress.',
    unit: 'percent (%)',
    incrementSite: 'Derived by computeSearchProgressDisplay from stage priors and observed units.',
    estimateClass: 'heuristic'
  },
  elapsedProgressMs: {
    label: 'Elapsed progress timer',
    formalDefinition: 'Wall-clock elapsed milliseconds reported by backend progress telemetry frame.',
    unit: 'milliseconds (ms)',
    incrementSite: 'Emitted by backend heartbeat/progress messages.',
    estimateClass: 'exact'
  },
  validPairs: {
    label: 'Valid pairs',
    formalDefinition: 'Number of pairwise combinations currently retained as admissible.',
    unit: 'count (pairs)',
    incrementSite: 'Incremented when a pair passes pairwise compatibility gates.',
    estimateClass: 'exact'
  },
  validTriplets: {
    label: 'Valid triplets',
    formalDefinition: 'Number of triplet combinations retained after triplet-stage constraints.',
    unit: 'count (triplets)',
    incrementSite: 'Incremented when a triplet passes triplet gate checks.',
    estimateClass: 'exact'
  },
  chainsFound: {
    label: 'Chains found',
    formalDefinition: 'Number of full-length admissible chains discovered so far in the active run.',
    unit: 'count (chains)',
    incrementSite: 'Incremented when traversal reaches target depth with a valid chain.',
    estimateClass: 'exact'
  },
  targetChainLength: {
    label: 'Target chain length',
    formalDefinition: 'Configured required chain length used as termination criterion for successful candidates.',
    unit: 'count (entries)',
    incrementSite: 'Set by user configuration before run start.',
    estimateClass: 'exact'
  }
};

export function metricHelpText(metricKey: keyof typeof STRETTO_TELEMETRY_GLOSSARY): string {
  const entry = STRETTO_TELEMETRY_GLOSSARY[metricKey];
  return `${entry.label}: ${entry.formalDefinition} Unit: ${entry.unit}. Increment site: ${entry.incrementSite} Classification: ${entry.estimateClass}.`;
}
