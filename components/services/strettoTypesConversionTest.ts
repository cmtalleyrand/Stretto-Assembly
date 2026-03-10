import assert from 'node:assert/strict';
import {
  fromLegacyChainOption,
  fromLegacyChainOptions,
  toLegacyChainOption,
  toLegacyChainOptions,
  type CanonicalStrettoChainEntry,
  type StrettoChainOption,
} from '../../types';

const legacyE0: StrettoChainOption = {
  startBeat: 0,
  transposition: 0,
  type: 'N',
  length: 480,
  voiceIndex: 0,
};

const canonicalE0 = fromLegacyChainOption(legacyE0, {
  previousStartBeatFromE0: 0,
  fullLengthTicks: 480,
});
assert.deepEqual(
  canonicalE0,
  {
    delayBeatsFromPreviousEntry: 0,
    transpositionSemisFromE0: 0,
    voiceIndex: 0,
    isInverted: false,
    isTruncated: false,
  },
  'Origin entry must encode zero relative delay and neutral transform flags.'
);

const legacySecondEntry: StrettoChainOption = {
  startBeat: 3.5,
  transposition: 7,
  type: 'I',
  length: 360,
  voiceIndex: 2,
};

const canonicalSecond = fromLegacyChainOption(legacySecondEntry, {
  previousStartBeatFromE0: 2,
  fullLengthTicks: 480,
});
assert.equal(canonicalSecond.delayBeatsFromPreviousEntry, 1.5, 'Relative delay must be measured from the previous chain entry.');
assert.equal(canonicalSecond.isInverted, true, 'Inverted legacy type must map to canonical inversion flag.');
assert.equal(canonicalSecond.isTruncated, true, 'Shorter legacy length must map to canonical truncation flag.');

const canonicalSource: CanonicalStrettoChainEntry = {
  delayBeatsFromPreviousEntry: 1.25,
  transpositionSemisFromE0: -5,
  voiceIndex: 1,
  isInverted: true,
  isTruncated: false,
};

const legacyConverted = toLegacyChainOption(canonicalSource, {
  previousStartBeatFromE0: 2,
  lengthTicks: 240,
});
assert.deepEqual(
  legacyConverted,
  {
    startBeat: 3.25,
    transposition: -5,
    type: 'I',
    length: 240,
    voiceIndex: 1,
  },
  'Canonical relative delay must be accumulated with previous absolute start for legacy output.'
);

const legacyChain: StrettoChainOption[] = [
  { startBeat: 0, transposition: 0, type: 'N', length: 480, voiceIndex: 0 },
  { startBeat: 1.5, transposition: 7, type: 'I', length: 300, voiceIndex: 1 },
  { startBeat: 2.0, transposition: 12, type: 'N', length: 480, voiceIndex: 2 },
];

const canonicalChain = fromLegacyChainOptions(legacyChain, { fullLengthTicks: 480 });
assert.deepEqual(
  canonicalChain.map((entry) => entry.delayBeatsFromPreviousEntry),
  [0, 1.5, 0.5],
  'Chain conversion should infer each delay from adjacent legacy absolute starts.'
);

const roundTripLegacyChain = toLegacyChainOptions(canonicalChain, {
  lengthTicksByIndex: [480, 300, 480],
});
assert.deepEqual(
  roundTripLegacyChain,
  legacyChain,
  'Chain-level conversion should round-trip absolute starts without caller-managed predecessor state.'
);

console.log('strettoTypesConversion tests passed');
