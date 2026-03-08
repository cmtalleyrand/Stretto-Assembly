import assert from 'node:assert/strict';
import { computeDelayPenaltyBreakdown } from './strettoScoring';

function testRepeatedDelayPenalty() {
  const delays = [1, 1, 1.5, 2];
  const breakdown = computeDelayPenaltyBreakdown(delays, 5);
  const repeatedOnly = breakdown.items
    .filter((item) => item.reason.startsWith('P_distance: repeated delay'))
    .reduce((sum, item) => sum + item.points, 0);

  assert.equal(repeatedOnly, 20, 'Expected one repeated-delay penalty event at 20 points.');
}

function testClusterPenaltyCanAccumulateAtCenter() {
  const delays = [1.0, 1.5, 1.0];
  const breakdown = computeDelayPenaltyBreakdown(delays, 4);
  const clusteredOnly = breakdown.items
    .filter((item) => item.reason.startsWith('P_distance: clustered delay'))
    .reduce((sum, item) => sum + item.points, 0);

  // left endpoint: 10, center: 20 (both sides within 0.5), right endpoint: 10
  assert.equal(clusteredOnly, 40, 'Cluster penalty aggregation failed for ±0.5-neighborhood rule.');
}

function testEarlyExpansionPenaltyBeforeFinalThird() {
  const delays = [0.5, 1.0, 0.75, 0.8];
  const breakdown = computeDelayPenaltyBreakdown(delays, 5);
  const expansionOnly = breakdown.items
    .filter((item) => item.reason.startsWith('P_distance: early expansion'))
    .reduce((sum, item) => sum + item.points, 0);

  assert.equal(expansionOnly, 40, 'Expected one early-expansion penalty before final third threshold.');
}

function testNoEarlyExpansionPenaltyInFinalThird() {
  const delays = [1.0, 0.5, 0.5, 1.25];
  const breakdown = computeDelayPenaltyBreakdown(delays, 5);
  const expansionOnly = breakdown.items
    .filter((item) => item.reason.startsWith('P_distance: early expansion'))
    .reduce((sum, item) => sum + item.points, 0);

  assert.equal(expansionOnly, 0, 'Expansion in final third must not be penalized by early-expansion rule.');
}

function runRegression() {
  testRepeatedDelayPenalty();
  testClusterPenaltyCanAccumulateAtCenter();
  testEarlyExpansionPenaltyBeforeFinalThird();
  testNoEarlyExpansionPenaltyInFinalThird();
  console.log('PASS: stretto distance-penalty regression suite.');
}

runRegression();
