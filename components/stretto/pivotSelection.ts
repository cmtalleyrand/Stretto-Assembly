import { PivotSearchMetric } from '../services/pairwisePivotSearch';

/**
 * Resolves the active pivot row with O(n) membership scan over ranked metrics.
 * If the currently selected pivot exists in the result set, preserve it.
 * Otherwise return null so UI can distinguish "active search pivot" from
 * "selected ranking row" without silently projecting rank-1.
 */
export function resolveActiveRowPivot(pivotMidi: number, metrics: PivotSearchMetric[]): number | null {
  for (const metric of metrics) {
    if (metric.pivotMidi === pivotMidi) {
      return pivotMidi;
    }
  }
  return null;
}
