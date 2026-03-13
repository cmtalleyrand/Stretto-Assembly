import assert from 'node:assert/strict';
import { violatesCombinedDissonanceStarts } from './strettoGenerator';

const alternatingStarts = [0, 120, 240, 360];
assert.equal(
  violatesCombinedDissonanceStarts(alternatingStarts, 480, 0),
  true,
  'Combined overlap-run constraint must reject a global dissonance streak longer than two events.'
);

const boundedStarts = [120, 360];
assert.equal(
  violatesCombinedDissonanceStarts(boundedStarts, 480, 0),
  false,
  'Combined overlap-run constraint must accept dissonance starts when run-length constraints are not exceeded.'
);

console.log('strettoCombinedOverlapRunTest passed');
