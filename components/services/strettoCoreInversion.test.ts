import assert from 'node:assert/strict';
import { getInvertedPitch } from './strettoCore';
import { SCALE_INTERVALS } from './strettoConstants';

function isChromaticInScale(pitch: number, scaleRoot: number, scaleMode: string): boolean {
    const intervals = SCALE_INTERVALS[scaleMode] || SCALE_INTERVALS.Major;
    const semitone = ((pitch - scaleRoot) % 12 + 12) % 12;
    return !intervals.includes(semitone);
}

// Regression: chromatic pitches must invert to chromatic pitches in tonal inversion mode.
const cMajorChromaticSubject = [61, 63, 66, 70];
const cMajorPivot = 60;
const cMajorInverted = cMajorChromaticSubject.map((pitch) =>
    getInvertedPitch(pitch, cMajorPivot, 0, 'Major', false)
);

assert.deepEqual(
    cMajorInverted,
    [58, 56, 54, 49],
    'Tonal inversion should mirror chromatic notes within the chromatic lattice around the pivot.'
);
assert.ok(
    cMajorInverted.every((pitch) => isChromaticInScale(pitch, 0, 'Major')),
    'Every chromatic input pitch should invert to another chromatic pitch.'
);

// Pivot-local chromatic symmetry in C major around G: #4 <-> b6
assert.equal(
    getInvertedPitch(66, 67, 0, 'Major', false),
    68,
    'In C major around G, #4 (F#) should invert to b6 (Ab).'
);
assert.equal(
    getInvertedPitch(68, 67, 0, 'Major', false),
    66,
    'In C major around G, b6 (Ab) should invert back to #4 (F#).'
);

console.log('strettoCore chromatic inversion regression tests passed');
