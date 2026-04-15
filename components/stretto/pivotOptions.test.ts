import assert from 'node:assert/strict';
import { buildVisiblePivotOptions } from './pivotOptions';

const constrained = [60, 64, 67];

assert.deepEqual(
  buildVisiblePivotOptions(constrained, 64),
  constrained,
  'If selected pivot is constrained, the visible options should remain unchanged.'
);

assert.deepEqual(
  buildVisiblePivotOptions(constrained, 62),
  [60, 62, 64, 67],
  'If selected pivot is outside constraints, UI options must include it to avoid reversion artifacts.'
);

assert.deepEqual(
  buildVisiblePivotOptions([], 65),
  [65],
  'Fallback for empty constrained set must preserve the current pivot as the sole visible option.'
);

console.log('pivotOptions.test.ts passed');
