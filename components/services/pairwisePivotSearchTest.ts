import assert from 'node:assert/strict';
import type { RawNote } from '../../types';
import { computeSubjectPivotCandidates, rankPivotCandidates } from './pairwisePivotSearch';

const subject: RawNote[] = [
  { midi: 64, ticks: 0, durationTicks: 240, velocity: 0.8, name: 'E4' },
  { midi: 60, ticks: 240, durationTicks: 240, velocity: 0.8, name: 'C4' },
  { midi: 67, ticks: 480, durationTicks: 240, velocity: 0.8, name: 'G4' },
  { midi: 64, ticks: 720, durationTicks: 240, velocity: 0.8, name: 'E4' }
];

const pivots = computeSubjectPivotCandidates(subject);
assert.deepEqual(pivots, [60, 64, 67], 'Pivot candidate extraction must include all unique subject notes in ascending order.');

const ranked = rankPivotCandidates({
  pivots,
  referencePivot: 64,
  evaluatePivot: (pivotMidi) => {
    if (pivotMidi === 60) {
      return [
        { delayTicks: 240, dissonanceRatio: 0.25, isViable: true },
        { delayTicks: 240, dissonanceRatio: 0.4, isViable: true },
        { delayTicks: 480, dissonanceRatio: 0.55, isViable: false },
      ];
    }
    if (pivotMidi === 64) {
      return [
        { delayTicks: 240, dissonanceRatio: 0.2, isViable: true },
        { delayTicks: 240, dissonanceRatio: 0.3, isViable: true },
        { delayTicks: 480, dissonanceRatio: 0.28, isViable: true },
      ];
    }
    return [
      { delayTicks: 240, dissonanceRatio: 0.2, isViable: true },
      { delayTicks: 240, dissonanceRatio: 0.35, isViable: true },
      { delayTicks: 480, dissonanceRatio: 0.9, isViable: false },
    ];
  }
});

assert.equal(ranked[0].pivotMidi, 64, 'Ranking must prefer higher viable-pair rate and delay coverage before dissonance tie-breakers.');
assert.equal(ranked[0].viablePairs, 3, 'Viable pair count must be tracked in pivot metrics.');
assert.equal(ranked[0].totalPairs, 3, 'Total pair count must be tracked in pivot metrics.');
assert.equal(ranked[0].delaysWithViablePairs, 2, 'Delay coverage numerator must count delays with at least one viable pair.');
assert.equal(ranked[0].totalDelays, 2, 'Delay coverage denominator must count all tested delays.');
assert.ok(ranked[0].varietyWeightedDelayDissonance <= ranked[0].averageViableDissonance, 'Geometric delay weighting must bias toward least dissonant pairs per delay.');

const tieBreakRanked = rankPivotCandidates({
  pivots: [60, 67],
  referencePivot: 64,
  evaluatePivot: () => [
    { delayTicks: 240, dissonanceRatio: 0.25, isViable: true },
    { delayTicks: 480, dissonanceRatio: 0.3, isViable: true },
  ]
});
assert.equal(tieBreakRanked[0].pivotMidi, 67, 'Tie-break must prefer pivot nearest to the reference pivot.');

console.log('PASS pairwisePivotSearchTest');
