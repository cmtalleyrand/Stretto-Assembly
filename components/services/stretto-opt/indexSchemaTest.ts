import assert from 'node:assert/strict';
import { createStrettoIndexSchema } from './indexSchema';

const variants = [
    {
        type: 'N',
        truncationBeats: 0,
        lengthTicks: 960,
        notes: [
            { relTick: 0, durationTicks: 240, pitch: 60 },
            { relTick: 240, durationTicks: 240, pitch: 62 }
        ]
    },
    {
        type: 'I',
        truncationBeats: 0,
        lengthTicks: 960,
        notes: [
            { relTick: 0, durationTicks: 240, pitch: 60 },
            { relTick: 240, durationTicks: 240, pitch: 58 }
        ]
    },
    {
        type: 'N',
        truncationBeats: 0,
        lengthTicks: 960,
        notes: [
            { relTick: 0, durationTicks: 240, pitch: 60 },
            { relTick: 240, durationTicks: 240, pitch: 62 }
        ]
    }
] as const;

const delays = [240, 480, 240] as const;
const transpositions = [0, 12, -12, 0] as const;

const schema = createStrettoIndexSchema(variants, delays, transpositions);

assert.deepEqual(schema.bounds, {
    variantCount: 2,
    delayCount: 2,
    transpositionCount: 3
});
assert.ok(Object.isFrozen(schema.bounds));

const variantIndex = schema.mapVariantToIndex(variants[0]);
assert.equal(schema.mapVariantToIndex(variants[2]), variantIndex, 'Equivalent variants should map to the same index.');
assert.equal(schema.variantSignatureFromIndex(variantIndex), 'N|0|960|0:240:60,240:240:62');
assert.deepEqual(schema.variantFromIndex(variantIndex), {
    type: 'N',
    truncationBeats: 0,
    lengthTicks: 960,
    notes: [
        { relTick: 0, durationTicks: 240, pitch: 60 },
        { relTick: 240, durationTicks: 240, pitch: 62 }
    ]
});

const delayIndex = schema.mapDelayToIndex(480);
assert.equal(schema.delayFromIndex(delayIndex), 480);

const transpositionIndex = schema.mapTranspositionToIndex(-12);
assert.equal(schema.transpositionFromIndex(transpositionIndex), -12);

assert.throws(() => schema.mapDelayToIndex(999), /Unknown delay value/);
assert.throws(() => schema.mapTranspositionToIndex(Number.NaN), /finite number/);

console.log('indexSchemaTest passed');
