import assert from 'node:assert/strict';
import { computeDelayPenaltyBreakdown, calculateStrettoScore, SubjectVariant } from './strettoScoring';
import { StrettoChainOption, StrettoSearchOptions } from '../../types';

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


function testMissingStepPenalty() {
  const variants: SubjectVariant[] = [
    {
      type: 'N',
      truncationBeats: 0,
      lengthTicks: 480,
      notes: [{ relTick: 0, durationTicks: 480, pitch: 60 }],
    },
  ];

  const chain: StrettoChainOption[] = [
    { startBeat: 0, transposition: 0, type: 'N', length: 480, voiceIndex: 0 },
    { startBeat: 1, transposition: 12, type: 'N', length: 480, voiceIndex: 1 },
  ];

  const options: StrettoSearchOptions = {
    ensembleTotal: 4,
    targetChainLength: 4,
    subjectVoiceIndex: 0,
    truncationMode: 'None',
    truncationTargetBeats: 0,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 0.3,
    scaleRoot: 0,
    scaleMode: 'Major',
  };

  const scored = calculateStrettoScore(chain, variants, [0, 0], options, 480);
  const missingPenalty = scored.scoreLog?.penalties
    .filter((item) => item.reason.startsWith('P_missing_steps:'))
    .reduce((sum, item) => sum + item.points, 0) ?? 0;

  assert.equal(missingPenalty, 400, 'Missing-step penalty must be -200 for each missing step (2 * 200).');
}


function testPostTruncationContractionPenalty() {
  const variants: SubjectVariant[] = [
    { type: 'N', truncationBeats: 0, lengthTicks: 4800, notes: [{ relTick: 0, durationTicks: 4800, pitch: 60 }] },
    { type: 'N', truncationBeats: 9.5, lengthTicks: 4560, notes: [{ relTick: 0, durationTicks: 4560, pitch: 64 }] },
  ];

  const chain: StrettoChainOption[] = [
    { startBeat: 0, transposition: 0, type: 'N', length: 4800, voiceIndex: 0 },
    { startBeat: 6, transposition: 7, type: 'N', length: 4560, voiceIndex: 1 },
    { startBeat: 11.5, transposition: 12, type: 'N', length: 4800, voiceIndex: 2 },
  ];

  const options: StrettoSearchOptions = {
    ensembleTotal: 4,
    targetChainLength: 3,
    subjectVoiceIndex: 0,
    truncationMode: 3,
    truncationTargetBeats: 9.5,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 0.3,
    scaleRoot: 0,
    scaleMode: 'Major',
  };

  const scored = calculateStrettoScore(chain, variants, [0, 1, 0], options, 480);
  const postTruncPenalty = scored.scoreLog?.penalties
    .filter((item) => item.reason.startsWith('P_distance: post-truncation contraction miss'))
    .reduce((sum, item) => sum + item.points, 0) ?? 0;

  assert.equal(postTruncPenalty, 40, 'Expected post-truncation contraction miss to incur 40 points.');
}

function testInvalidChainsDoNotExposeScores() {
  const variants: SubjectVariant[] = [
    {
      type: 'N',
      truncationBeats: 0,
      lengthTicks: 480,
      notes: [
        { relTick: 0, durationTicks: 160, pitch: 60 },
        { relTick: 160, durationTicks: 160, pitch: 62 },
        { relTick: 320, durationTicks: 160, pitch: 64 }
      ],
    },
  ];

  const chain: StrettoChainOption[] = [
    { startBeat: 0, transposition: 0, type: 'N', length: 480, voiceIndex: 0 },
    { startBeat: 0, transposition: 1, type: 'N', length: 480, voiceIndex: 1 },
  ];

  const options: StrettoSearchOptions = {
    ensembleTotal: 2,
    targetChainLength: 2,
    subjectVoiceIndex: 0,
    truncationMode: 'None',
    truncationTargetBeats: 0,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 1,
    scaleRoot: 0,
    scaleMode: 'Major',
  };

  const scored = calculateStrettoScore(chain, variants, [0, 0], options, 480);
  assert.equal(scored.isValid, false, 'Expected persistent dissonance run to invalidate chain.');
  assert.equal(scored.score, undefined, 'Invalid chain must not expose a score.');
}

function runRegression() {
  testRepeatedDelayPenalty();
  testClusterPenaltyCanAccumulateAtCenter();
  testEarlyExpansionPenaltyBeforeFinalThird();
  testNoEarlyExpansionPenaltyInFinalThird();
  testMissingStepPenalty();
  testPostTruncationContractionPenalty();
  testInvalidChainsDoNotExposeScores();
  console.log('PASS: stretto distance-penalty regression suite.');
}

runRegression();
