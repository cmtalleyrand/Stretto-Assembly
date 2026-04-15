import assert from 'node:assert/strict';
import { getVoiceCode } from './midiVoices';

const satbCodes = [0, 1, 2, 3].map((index) => getVoiceCode(index, 4));
assert.deepEqual(satbCodes, ['S', 'A', 'T', 'B'], '4-voice labeling must use SATB compact role codes.');

satbCodes.forEach((code) => {
    assert.equal(/^V\d+$/.test(code), false, 'Compact role codes must not use V{index} numeric formatting.');
});

assert.equal(getVoiceCode(0, 5), 'S1', '5-voice labeling must preserve numbered SATB semantics.');
assert.equal(getVoiceCode(1, 5), 'S2', '5-voice labeling must preserve numbered SATB semantics.');
assert.equal(getVoiceCode(3, 6), 'A2', '6-voice labeling must preserve numbered SATB semantics.');
assert.equal(getVoiceCode(2, 4, { 2: 'Counterline' }), 'Counterline', 'Custom voice name overrides must take precedence.');

console.log('PASS midiVoicesVoiceCode.test');
