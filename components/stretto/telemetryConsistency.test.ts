import assert from 'node:assert/strict';
import { deriveCoverageDisplayMetrics } from './StrettoChainView';
import { StrettoSearchReport } from '../../types';

type Coverage = NonNullable<NonNullable<StrettoSearchReport['stats']['coverage']>>;

function computeCompletionLowerBound(coverage: Pick<Coverage, 'exploredWorkItems' | 'liveFrontierWorkItems'>): number | null {
  const denom = coverage.exploredWorkItems + coverage.liveFrontierWorkItems;
  return denom > 0 ? (coverage.exploredWorkItems / denom) : null;
}

const monotoneTraversalStates: Array<Pick<Coverage, 'exploredWorkItems' | 'liveFrontierWorkItems'>> = [
  { exploredWorkItems: 0, liveFrontierWorkItems: 1 },
  { exploredWorkItems: 1, liveFrontierWorkItems: 1 },
  { exploredWorkItems: 2, liveFrontierWorkItems: 1 },
  { exploredWorkItems: 3, liveFrontierWorkItems: 0 }
];

let previousExplored = -1;
let previousBound = -1;
for (const state of monotoneTraversalStates) {
  assert.ok(state.exploredWorkItems >= previousExplored, 'Explored work-item count must be monotone nondecreasing across traversal snapshots.');
  const bound = computeCompletionLowerBound(state);
  assert.ok(bound == null || (bound >= 0 && bound <= 1), 'Completion lower bound must lie in [0, 1] when defined.');
  if (bound != null) {
    assert.ok(bound >= previousBound, 'Completion lower bound must be monotone under fixed/decreasing live-frontier cardinality.');
    previousBound = bound;
  }
  previousExplored = state.exploredWorkItems;
}

const baseCoverage: Coverage = {
  nodeBudgetUsedPercent: null,
  exploredWorkItems: 21,
  liveFrontierWorkItems: 9,
  maxFrontierSize: 15,
  maxFrontierClassCount: 7,
  depthHistogram: { '1': 1, '2': 4, '3': 16 },
  completionLowerBound: 0.7,
  completionLowerBoundIsHeuristic: true,
  completionLowerBoundAssumptions: {
    monotoneQueuedWorkItems: true
  },
  edgesTraversed: 123,
  frontierSizeAtTermination: 2,
  frontierClassesAtTermination: 2,
  completionRatioLowerBound: 70
};

const displayed = deriveCoverageDisplayMetrics(baseCoverage).filter((metric) => metric.show);
assert.ok(displayed.some((metric) => metric.label.includes('(heuristic)')), 'Heuristic metric labels must include explicit heuristic annotation.');

const suppressed = deriveCoverageDisplayMetrics({
  ...baseCoverage,
  completionLowerBoundAssumptions: {
    monotoneQueuedWorkItems: false
  }
}).filter((metric) => metric.show);

assert.ok(
  !suppressed.some((metric) => metric.metricKey === 'completionRatioLowerBound'),
  'Heuristic completion metric must be hidden when monotone queued-work-item assumption is unmet.'
);

console.log('telemetryConsistency test passed');
