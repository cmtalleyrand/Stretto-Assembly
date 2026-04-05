import assert from 'node:assert/strict';
import { extractMeterFromAbc } from './abcBridge';

assert.deepEqual(
  extractMeterFromAbc('M:3/4\nK:C\nc d e'),
  { num: 3, den: 4 },
  'Meter extractor must parse canonical numeric meter headers.'
);

assert.deepEqual(
  extractMeterFromAbc('X:1 T:Inline Header M:6/8 L:1/8 K:G c d e'),
  { num: 6, den: 8 },
  'Meter extractor must parse inline numeric meter headers, not only line-start headers.'
);

assert.deepEqual(
  extractMeterFromAbc('X:1\nM:3/4 % Waltz meter\nK:D\nd e f'),
  { num: 3, den: 4 },
  'Meter extractor must ignore trailing ABC comments on the meter header line.'
);

assert.equal(
  extractMeterFromAbc('X:1\nM:3/0\nK:C\nc d e f'),
  null,
  'Meter extractor must reject invalid numeric meters with zero denominator.'
);

assert.deepEqual(
  extractMeterFromAbc('X:1\nM:C\nK:C\nc d e f'),
  { num: 4, den: 4 },
  'Meter extractor must map common-time symbol C to 4/4.'
);

assert.deepEqual(
  extractMeterFromAbc('X:1\nM:C|\nK:C\nc d e f'),
  { num: 2, den: 2 },
  'Meter extractor must map cut-time symbol C| to 2/2.'
);

assert.equal(
  extractMeterFromAbc('X:1\nK:C\nc d e f'),
  null,
  'Meter extractor must return null when no meter header exists.'
);

console.log('abcBridgeMeterTest passed');
