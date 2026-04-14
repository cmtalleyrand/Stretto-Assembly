import { PivotSearchMetric } from '../services/pairwisePivotSearch';

/**
 * Resolves the active pivot row with O(n) membership scan over ranked metrics.
 * If the currently selected pivot exists in the result set, preserve it;
 * otherwise fall back to the best-ranked pivot.
 */
export function resolveActiveRowPivot(pivotMidi: number, metrics: PivotSearchMetric[]): number | null {
  for (const metric of metrics) {
    if (metric.pivotMidi === pivotMidi) {
      return pivotMidi;
    }
  }
  return metrics.length > 0 ? metrics[0].pivotMidi : null;
}
