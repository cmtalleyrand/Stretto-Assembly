import assert from 'node:assert/strict';
import { generatePolyphonicHarmonicRegions } from './strettoCore';
import { RawNote } from '../../types';

function detectSingleRegionChordName(notes: RawNote[]): string {
  const regions = generatePolyphonicHarmonicRegions(notes, 0);
  assert.equal(regions.length, 1, 'Expected one harmonic region for a two-note sustained dyad.');
  return regions[0].detailedInfo?.chordName ?? '';
}

{
  const firstInversionMajorDyad: RawNote[] = [
    { midi: 64, ticks: 0, durationTicks: 480, velocity: 0.8, name: 'E4' },
    { midi: 72, ticks: 0, durationTicks: 480, velocity: 0.8, name: 'C5' }
  ];
  const chordName = detectSingleRegionChordName(firstInversionMajorDyad);
  assert.ok(chordName.endsWith('Maj (no 5)'), 'A sixth dyad must be recognized as first-inversion major harmony.');
  assert.ok(chordName.startsWith('C'), 'A sixth dyad in E-C must resolve to C as the inferred root.');
}

{
  const compoundThirdDyad: RawNote[] = [
    { midi: 48, ticks: 0, durationTicks: 480, velocity: 0.8, name: 'C3' },
    { midi: 64, ticks: 0, durationTicks: 480, velocity: 0.8, name: 'E4' }
  ];
  const chordName = detectSingleRegionChordName(compoundThirdDyad);
  assert.ok(chordName.endsWith('Maj (no 5)'), 'A tenth must be normalized to a third for dyad chord detection.');
  assert.ok(chordName.startsWith('C'), 'A tenth dyad C-E must retain C as the inferred root.');
}

{
  const firstInversionMinorCompoundSixthDyad: RawNote[] = [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8, name: 'C4' },
    { midi: 81, ticks: 0, durationTicks: 480, velocity: 0.8, name: 'A5' }
  ];
  const chordName = detectSingleRegionChordName(firstInversionMinorCompoundSixthDyad);
  assert.ok(chordName.endsWith('Min (no 5)'), 'A compound sixth must map to first-inversion minor harmony.');
  assert.ok(chordName.startsWith('A'), 'A compound sixth dyad C-A must infer A as the chord root.');
}

console.log('strettoCoreDyadChordDetection.test passed');
