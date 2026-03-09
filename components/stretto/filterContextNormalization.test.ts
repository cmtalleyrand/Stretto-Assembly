import assert from 'node:assert/strict';
import { normalizeLexical, normalizeNumericStrings } from './filterContextNormalization';

const pitchesAB = new Set(['G', 'C', 'A#']);
const pitchesBA = new Set(['A#', 'G', 'C']);

assert.deepEqual(
    normalizeLexical(pitchesAB),
    normalizeLexical(pitchesBA),
    'Lexical normalization must be insertion-order invariant for equivalent sets.'
);

const delaysAB = new Set(['2', '0.5', '10']);
assert.deepEqual(
    normalizeNumericStrings(delaysAB),
    ['0.5', '2', '10'],
    'Numeric normalization must produce ascending numeric order.'
);

console.log('filterContextNormalization tests passed');
