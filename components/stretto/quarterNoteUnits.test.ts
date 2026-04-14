import assert from 'node:assert/strict';
import { formatQuarterNoteUnits } from './quarterNoteUnits';

assert.equal(formatQuarterNoteUnits(0.5), '1/2Q');
assert.equal(formatQuarterNoteUnits(1), '1Q');
assert.equal(formatQuarterNoteUnits(2), '2Q');
assert.equal(formatQuarterNoteUnits(2.5), '2 1/2Q');
assert.equal(formatQuarterNoteUnits(1.49), '1 1/2Q');
assert.equal(formatQuarterNoteUnits(Number.NaN), '?');

console.log('quarterNoteUnits formatting tests passed.');
