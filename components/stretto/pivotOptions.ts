/**
 * Build pivot options displayed in UI.
 * Ensures the current selection remains representable even when it is outside
 * the subject-constrained candidate set.
 */
export function buildVisiblePivotOptions(constrainedPivots: number[], selectedPivot: number): number[] {
  if (constrainedPivots.length === 0) {
    return [selectedPivot];
  }
  if (constrainedPivots.includes(selectedPivot)) {
    return constrainedPivots;
  }
  return [...constrainedPivots, selectedPivot].sort((a, b) => a - b);
}
