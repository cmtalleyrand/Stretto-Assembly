import { getIntervalLabel } from './midiSpelling';

const expectations: Array<[number, string]> = [
  [15, '+m10'],
  [16, '+M10'],
  [20, '+m13'],
  [21, '+M13'],
  [27, '+m17'],
  [32, '+m20'],
  [33, '+M20'],
  [-20, '-m13'],
  [31, '+P19'],
];

for (const [semitones, expected] of expectations) {
  const actual = getIntervalLabel(semitones);
  if (actual !== expected) {
    throw new Error(`Expected ${semitones} to format as ${expected}, received ${actual}`);
  }
}

console.log('midiSpelling compound interval formatting tests passed.');
