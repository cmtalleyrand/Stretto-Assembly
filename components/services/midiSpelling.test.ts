import { getIntervalLabel } from './midiSpelling';

type Expectation = {
  semitones: number;
  expected: string;
};

const expectations: readonly Expectation[] = [
  // Unison and simple interval boundaries (positive and negative).
  { semitones: 0, expected: 'P1' },
  { semitones: 1, expected: '+m2' },
  { semitones: -1, expected: '-m2' },
  { semitones: 11, expected: '+M7' },
  { semitones: -11, expected: '-M7' },

  // Octave boundaries: 12n ± {0, 1}.
  { semitones: 12, expected: '+P8' },
  { semitones: 13, expected: '+m9' },
  { semitones: 23, expected: '+M14' },
  { semitones: 24, expected: '+P15' },
  { semitones: 25, expected: '+m16' },
  { semitones: -12, expected: '-P8' },
  { semitones: -13, expected: '-m9' },
  { semitones: -23, expected: '-M14' },
  { semitones: -24, expected: '-P15' },
  { semitones: -25, expected: '-m16' },

  // Existing compound representatives.
  { semitones: 15, expected: '+m10' },
  { semitones: 16, expected: '+M10' },
  { semitones: 20, expected: '+m13' },
  { semitones: 21, expected: '+M13' },
  { semitones: 27, expected: '+m17' },
  { semitones: 31, expected: '+P19' },
  { semitones: 32, expected: '+m20' },
  { semitones: 33, expected: '+M20' },
  { semitones: -20, expected: '-m13' },

  // Additional compound representatives beyond prior coverage.
  { semitones: 35, expected: '+M21' },
  { semitones: 36, expected: '+P22' },
  { semitones: 37, expected: '+m23' },
  { semitones: 44, expected: '+m27' },
  { semitones: 47, expected: '+M28' },
  { semitones: 48, expected: '+P29' },
  { semitones: -35, expected: '-M21' },
  { semitones: -36, expected: '-P22' },
  { semitones: -37, expected: '-m23' },
  { semitones: -44, expected: '-m27' },
  { semitones: -47, expected: '-M28' },
  { semitones: -48, expected: '-P29' },
];

const descriptorByClass: Readonly<Record<number, { quality: string; number: number }>> = {
  0: { quality: 'P', number: 1 },
  1: { quality: 'm', number: 2 },
  2: { quality: 'M', number: 2 },
  3: { quality: 'm', number: 3 },
  4: { quality: 'M', number: 3 },
  5: { quality: 'P', number: 4 },
  6: { quality: 'A', number: 4 },
  7: { quality: 'P', number: 5 },
  8: { quality: 'm', number: 6 },
  9: { quality: 'M', number: 6 },
  10: { quality: 'm', number: 7 },
  11: { quality: 'M', number: 7 },
};

function parseSignedLabel(label: string): { sign: '' | '+' | '-'; quality: string; number: number } {
  const match = label.match(/^([+-]?)([A-Za-z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Label ${label} is not parseable.`);
  }

  return {
    sign: (match[1] as '' | '+' | '-'),
    quality: match[2],
    number: Number(match[3]),
  };
}

for (const { semitones, expected } of expectations) {
  const actual = getIntervalLabel(semitones);
  if (actual !== expected) {
    throw new Error(`Expected ${semitones} to format as ${expected}, received ${actual}`);
  }

  // Invariant 1: sign normalization is preserved for all non-zero intervals.
  if (semitones > 0 && !actual.startsWith('+')) {
    throw new Error(`Positive interval ${semitones} must preserve '+' sign, received ${actual}`);
  }
  if (semitones < 0 && !actual.startsWith('-')) {
    throw new Error(`Negative interval ${semitones} must preserve '-' sign, received ${actual}`);
  }
  if (semitones === 0 && actual !== 'P1') {
    throw new Error(`Zero interval must normalize to P1, received ${actual}`);
  }

  // Invariant 2: interval-class mapping is monotone over octave shifts.
  if (semitones !== 0) {
    const abs = Math.abs(semitones);
    const intervalClass = abs % 12;
    const octaves = Math.floor(abs / 12);
    const parsed = parseSignedLabel(actual);
    const descriptor = descriptorByClass[intervalClass];

    if (!descriptor) {
      throw new Error(`Missing descriptor for interval class ${intervalClass}.`);
    }

    const expectedNumber = abs <= 12
      ? (intervalClass === 0 ? 8 : descriptor.number)
      : descriptor.number + (octaves * 7);

    if (parsed.quality !== descriptor.quality) {
      throw new Error(
        `Quality mismatch for ${semitones}: expected ${descriptor.quality}, received ${parsed.quality}`
      );
    }

    if (parsed.number !== expectedNumber) {
      throw new Error(
        `Diatonic-number monotonicity mismatch for ${semitones}: expected ${expectedNumber}, received ${parsed.number}`
      );
    }
  }
}

console.log('midiSpelling compound interval formatting and normalization invariant tests passed.');
