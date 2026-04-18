import { PivotSearchMetric } from '../services/pairwisePivotSearch';
import type { RawNote } from '../../types';

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

/**
 * Computes pivot-select candidates from subject notes in O(n log n):
 * O(n) deduplication using a Set and O(k log k) numeric sort for deterministic UI ordering.
 * Falls back to the current pivot when the subject is empty.
 */
export function resolvePivotSelectOptions(pivotMidi: number, subjectNotes: RawNote[]): number[] {
  const uniquePivots = new Set<number>();
  for (const note of subjectNotes) {
    uniquePivots.add(note.midi);
  }
  const sorted = Array.from(uniquePivots.values()).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : [pivotMidi];
}
