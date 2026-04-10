import assert from 'node:assert/strict';
import { parseSimpleAbc } from './abcBridge';

const ppq = 480;

const twoFourWithoutL = parseSimpleAbc('M:2/4\nK:C\nC D', ppq);
assert.equal(
  twoFourWithoutL[0]?.durationTicks,
  120,
  'When L: is omitted and M:2/4 is active, default unit length must be 1/16 (120 ticks at PPQ=480).'
);

const sixEightWithoutL = parseSimpleAbc('M:6/8\nK:C\nC D', ppq);
assert.equal(
  sixEightWithoutL[0]?.durationTicks,
  240,
  'When L: is omitted and M:6/8 is active, default unit length must be 1/8 (240 ticks at PPQ=480).'
);

const explicitLengthOverridesMeter = parseSimpleAbc('M:2/4\nL:1/8\nK:C\nC D', ppq);
assert.equal(
  explicitLengthOverridesMeter[0]?.durationTicks,
  240,
  'Explicit L: must override meter-derived default note length.'
);

console.log('abcBridgeParseSimpleAbcMeterTest passed');
