import assert from 'node:assert/strict';
import { resolveTimeSignature } from './timeSignatureResolver';

assert.deepEqual(
  resolveTimeSignature({ numerator: 3, denominator: 4 }),
  [3, 4],
  'Export time signature resolver must preserve valid simple meter values.'
);

assert.deepEqual(
  resolveTimeSignature({ numerator: 12, denominator: 8 }),
  [12, 8],
  'Export time signature resolver must preserve valid compound meter values.'
);

assert.deepEqual(
  resolveTimeSignature({ numerator: 0, denominator: 4 }),
  [4, 4],
  'Export time signature resolver must reject non-positive numerators.'
);

assert.deepEqual(
  resolveTimeSignature({ numerator: 5, denominator: 0 }),
  [4, 4],
  'Export time signature resolver must reject non-positive denominators.'
);

assert.deepEqual(
  resolveTimeSignature(),
  [4, 4],
  'Export time signature resolver must default to 4/4 when meter is omitted.'
);

console.log('strettoExportTimeSignatureTest passed');
