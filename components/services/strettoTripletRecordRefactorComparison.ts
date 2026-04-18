import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

const ppq = 480;

interface Fixture {
  name: string;
  minDurationMsPerMode: number;
  subject: RawNote[];
  options: StrettoSearchOptions;
}

interface ModeAggregate {
  elapsedMs: number;
  runs: number;
  wallMs: NumericSummary;
  pairwiseMs: NumericSummary;
  tripletMs: NumericSummary;
  dagMs: NumericSummary;
  totalMs: NumericSummary;
  resultsCount: NumericSummary;
  maxDepthReached: NumericSummary;
  harmonicallyValidTriples: number;
  tripletDistinctShapesAccepted: number;
  chainIdentity: string[];
  stopReasonHistogram: Record<string, number>;
}

interface NumericSummary {
  min: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  max: number;
  mean: number;
  stdDev: number;
}

function canonicalChainIdentities(
  report: Awaited<ReturnType<typeof searchStrettoChains>>
): string[] {
  return report.results.map((result) => result.entries
    .map((entry) => `${entry.startBeat.toFixed(6)}|${entry.transposition}|${entry.type}|${entry.length}|${entry.voiceIndex}`)
    .join('||')).sort();
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return Number.NaN;
  if (sortedValues.length === 1) return sortedValues[0];
  const clamped = Math.max(0, Math.min(1, p));
  const position = clamped * (sortedValues.length - 1);
  const left = Math.floor(position);
  const right = Math.ceil(position);
  if (left === right) return sortedValues[left];
  const w = position - left;
  return sortedValues[left] * (1 - w) + sortedValues[right] * w;
}

function summarize(values: number[]): NumericSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((acc, v) => acc + v, 0) / Math.max(1, n);
  const variance = sorted.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / Math.max(1, n);
  return {
    min: sorted[0],
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    max: sorted[n - 1],
    mean,
    stdDev: Math.sqrt(variance)
  };
}

async function runMode(
  fixture: Fixture,
  useLegacyIndexingPass: boolean
): Promise<ModeAggregate> {
  process.env.STRETTO_LEGACY_TRIPLET_RECORD_INDEX_PASS = useLegacyIndexingPass ? '1' : '0';

  let elapsedMs = 0;
  let runs = 0;
  const wallMsValues: number[] = [];
  const pairwiseMsValues: number[] = [];
  const tripletMsValues: number[] = [];
  const dagMsValues: number[] = [];
  const totalMsValues: number[] = [];
  const resultsCountValues: number[] = [];
  const maxDepthValues: number[] = [];
  let harmonicallyValidTriples = -1;
  let tripletDistinctShapesAccepted = -1;
  let chainIdentity: string[] = [];
  const stopReasonHistogram: Record<string, number> = {};

  while (elapsedMs < fixture.minDurationMsPerMode) {
    const t0 = Date.now();
    const report = await searchStrettoChains(fixture.subject, fixture.options, ppq);
    const dt = Date.now() - t0;
    elapsedMs += dt;
    runs++;
    wallMsValues.push(dt);
    pairwiseMsValues.push(report.stats.stageTiming.pairwiseMs);
    tripletMsValues.push(report.stats.stageTiming.tripletMs);
    dagMsValues.push(report.stats.stageTiming.dagMs);
    totalMsValues.push(report.stats.timeMs);
    resultsCountValues.push(report.results.length);
    maxDepthValues.push(report.stats.maxDepthReached);
    stopReasonHistogram[report.stats.stopReason] = (stopReasonHistogram[report.stats.stopReason] ?? 0) + 1;

    if (runs === 1) {
      harmonicallyValidTriples = report.stats.stageStats?.harmonicallyValidTriples ?? -1;
      tripletDistinctShapesAccepted = report.stats.stageStats?.tripletDistinctShapesAccepted ?? -1;
      chainIdentity = canonicalChainIdentities(report);
    }
  }

  return {
    elapsedMs,
    runs,
    wallMs: summarize(wallMsValues),
    pairwiseMs: summarize(pairwiseMsValues),
    tripletMs: summarize(tripletMsValues),
    dagMs: summarize(dagMsValues),
    totalMs: summarize(totalMsValues),
    resultsCount: summarize(resultsCountValues),
    maxDepthReached: summarize(maxDepthValues),
    harmonicallyValidTriples,
    tripletDistinctShapesAccepted,
    chainIdentity,
    stopReasonHistogram
  };
}

const fixtures: Fixture[] = [
  {
    name: 'fixture-A',
    minDurationMsPerMode: 15000,
    subject: [
      { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
      { midi: 64, ticks: 480, durationTicks: 480, velocity: 90, name: 'E4' },
      { midi: 67, ticks: 960, durationTicks: 480, velocity: 90, name: 'G4' }
    ],
    options: {
      ensembleTotal: 2,
      targetChainLength: 2,
      subjectVoiceIndex: 0,
      truncationMode: 'None',
      truncationTargetBeats: 1,
      inversionMode: 'None',
      useChromaticInversion: false,
      thirdSixthMode: 'None',
      pivotMidi: 60,
      requireConsonantEnd: false,
      disallowComplexExceptions: true,
      maxPairwiseDissonance: 0.5,
      maxSearchTimeMs: 1500,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  },
  {
    name: 'fixture-D',
    minDurationMsPerMode: 45000,
    subject: [
      { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
      { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
      { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
      { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' }
    ],
    options: {
      ensembleTotal: 4,
      targetChainLength: 4,
      subjectVoiceIndex: 1,
      truncationMode: 'None',
      truncationTargetBeats: 1,
      inversionMode: 'None',
      useChromaticInversion: false,
      thirdSixthMode: 'None',
      pivotMidi: 60,
      requireConsonantEnd: false,
      disallowComplexExceptions: true,
      maxPairwiseDissonance: 0.5,
      maxSearchTimeMs: 3000,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  },
  {
    name: 'fixture-E',
    minDurationMsPerMode: 45000,
    subject: [
      { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
      { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
      { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
      { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
      { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' }
    ],
    options: {
      ensembleTotal: 4,
      targetChainLength: 7,
      subjectVoiceIndex: 1,
      truncationMode: 'None',
      truncationTargetBeats: 1,
      inversionMode: 'None',
      useChromaticInversion: false,
      thirdSixthMode: 1,
      pivotMidi: 60,
      requireConsonantEnd: false,
      disallowComplexExceptions: true,
      maxPairwiseDissonance: 0.5,
      maxSearchTimeMs: 10000,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  },
  {
    name: 'fixture-F',
    minDurationMsPerMode: 45000,
    subject: [
      { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
      { midi: 64, ticks: 480, durationTicks: 480, velocity: 90, name: 'E4' },
      { midi: 67, ticks: 960, durationTicks: 480, velocity: 90, name: 'G4' },
      { midi: 72, ticks: 1440, durationTicks: 480, velocity: 90, name: 'C5' }
    ],
    options: {
      ensembleTotal: 4,
      targetChainLength: 4,
      delaySearchCategory: 'canon',
      canonDelayMinBeats: 1,
      canonDelayMaxBeats: 1,
      subjectVoiceIndex: 1,
      truncationMode: 'None',
      truncationTargetBeats: 1,
      inversionMode: 'None',
      useChromaticInversion: false,
      thirdSixthMode: 'None',
      pivotMidi: 60,
      requireConsonantEnd: false,
      disallowComplexExceptions: true,
      maxPairwiseDissonance: 0.5,
      maxSearchTimeMs: 5000,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  }
];

for (const fixture of fixtures) {
  const singlePass = await runMode(fixture, false);
  const legacyTwoPass = await runMode(fixture, true);

  assert.equal(
    singlePass.harmonicallyValidTriples,
    legacyTwoPass.harmonicallyValidTriples,
    `${fixture.name}: harmonicallyValidTriples mismatch between single-pass and legacy-two-pass modes`
  );
  assert.equal(
    singlePass.tripletDistinctShapesAccepted,
    legacyTwoPass.tripletDistinctShapesAccepted,
    `${fixture.name}: tripletDistinctShapesAccepted mismatch between single-pass and legacy-two-pass modes`
  );
  assert.deepEqual(
    singlePass.chainIdentity,
    legacyTwoPass.chainIdentity,
    `${fixture.name}: accepted chain identity mismatch between single-pass and legacy-two-pass modes`
  );

  console.log(JSON.stringify({
    fixture: fixture.name,
    minDurationMsPerMode: fixture.minDurationMsPerMode,
    singlePass,
    legacyTwoPass
  }, null, 2));
}

delete process.env.STRETTO_LEGACY_TRIPLET_RECORD_INDEX_PASS;
console.log('triplet-record refactor comparison complete');
