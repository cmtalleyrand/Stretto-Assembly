import assert from 'node:assert/strict';
import { resolveActiveRowPivot } from './pivotSelection';
import { PivotSearchMetric } from '../services/pairwisePivotSearch';

const metrics: PivotSearchMetric[] = [
  {
    pivotMidi: 60,
    viablePairs: 5,
    totalPairs: 10,
    viablePairRate: 0.5,
    averageViableDissonance: 0.2,
    delaysWithViablePairs: 4,
    totalDelays: 8,
    delayCoverageRate: 0.5,
    varietyWeightedDelayDissonance: 0.3,
    objectiveScore: 0.6,
  },
  {
    pivotMidi: 64,
    viablePairs: 6,
    totalPairs: 10,
    viablePairRate: 0.6,
    averageViableDissonance: 0.25,
    delaysWithViablePairs: 5,
    totalDelays: 8,
    delayCoverageRate: 0.625,
    varietyWeightedDelayDissonance: 0.28,
    objectiveScore: 0.66,
  },
];

assert.equal(resolveActiveRowPivot(64, metrics), 64, 'Must preserve the selected pivot row when present.');
assert.equal(resolveActiveRowPivot(67, metrics), null, 'Must return null when selected pivot is absent to avoid false row projection.');
assert.equal(resolveActiveRowPivot(67, []), null, 'Must return null for empty metric sets.');

console.log('pivotSelection.test.ts passed');
