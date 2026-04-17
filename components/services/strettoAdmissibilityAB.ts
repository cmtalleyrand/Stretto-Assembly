import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

type Fixture = {
  name: string;
  subject: RawNote[];
  options: StrettoSearchOptions;
};

type Mode = {
  name: 'full-domain-default' | 'admissibility-enabled';
  env: Record<string, string | undefined>;
};

type RunMetrics = {
  elapsedMs: number;
  nodesVisited: number;
  pairwiseTotal: number;
  pairwiseCompatible: number;
  tripletCandidates: number;
  harmonicallyValidTriples: number;
  stopReason: string;
  resultCount: number;
};

const PPQ = 480;
const RUNS_PER_FIXTURE = 3;

const FIXTURES: Fixture[] = [
  {
    name: 'target4_scale6',
    subject: [
      { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
      { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
      { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
      { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
      { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
      { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' }
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
      maxSearchTimeMs: 5000,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  },
  {
    name: 'target8_scale8',
    subject: [
      { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
      { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
      { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
      { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
      { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
      { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' },
      { midi: 71, ticks: 2880, durationTicks: 480, velocity: 90, name: 'B4' },
      { midi: 72, ticks: 3360, durationTicks: 480, velocity: 90, name: 'C5' }
    ],
    options: {
      ensembleTotal: 8,
      targetChainLength: 8,
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
  },
  {
    name: 'target8_scale10',
    subject: [
      { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
      { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
      { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
      { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
      { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
      { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' },
      { midi: 71, ticks: 2880, durationTicks: 480, velocity: 90, name: 'B4' },
      { midi: 72, ticks: 3360, durationTicks: 480, velocity: 90, name: 'C5' },
      { midi: 74, ticks: 3840, durationTicks: 480, velocity: 90, name: 'D5' },
      { midi: 76, ticks: 4320, durationTicks: 480, velocity: 90, name: 'E5' }
    ],
    options: {
      ensembleTotal: 8,
      targetChainLength: 8,
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

const MODES: Mode[] = [
  {
    name: 'full-domain-default',
    env: {
      STRETTO_ENABLE_ADMISSIBILITY: '0',
      STRETTO_DIAGNOSTIC_FULL_PAIRWISE: '0'
    }
  },
  {
    name: 'admissibility-enabled',
    env: {
      STRETTO_ENABLE_ADMISSIBILITY: '1',
      STRETTO_DIAGNOSTIC_FULL_PAIRWISE: '0'
    }
  }
];

function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function applyModeEnv(mode: Mode): void {
  for (const [key, value] of Object.entries(mode.env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function printFixtureSummary(fixtureName: string, modeName: Mode['name'], runs: RunMetrics[]): void {
  const elapsed = runs.map((run) => run.elapsedMs);
  const nodesVisited = runs.map((run) => run.nodesVisited);
  console.log(
    [
      `[stretto-admissibility-ab] fixture=${fixtureName}`,
      `mode=${modeName}`,
      `runs=${runs.length}`,
      `timeMs(mean/median/p95)=${mean(elapsed).toFixed(1)}/${quantile(elapsed, 0.5)}/${quantile(elapsed, 0.95)}`,
      `nodesVisited(mean)=${mean(nodesVisited).toFixed(1)}`
    ].join(' ')
  );
}

function relativeDeltaPercent(reference: number, candidate: number): number {
  if (reference === 0) return 0;
  return ((candidate - reference) / reference) * 100;
}

async function runModeFixture(mode: Mode, fixture: Fixture): Promise<RunMetrics[]> {
  applyModeEnv(mode);

  // JIT/cache warmup (excluded from measured sample).
  await searchStrettoChains(fixture.subject, fixture.options, PPQ);

  const runs: RunMetrics[] = [];
  for (let i = 0; i < RUNS_PER_FIXTURE; i++) {
    const start = Date.now();
    const report = await searchStrettoChains(fixture.subject, fixture.options, PPQ);
    const elapsedMs = Date.now() - start;
    const stageStats = report.stats.stageStats;

    assert.ok(stageStats, `${fixture.name}:${mode.name}: expected stageStats payload.`);

    runs.push({
      elapsedMs,
      nodesVisited: report.stats.nodesVisited,
      pairwiseTotal: stageStats.pairwiseTotal,
      pairwiseCompatible: stageStats.pairwiseCompatible,
      tripletCandidates: stageStats.tripleCandidates,
      harmonicallyValidTriples: stageStats.harmonicallyValidTriples,
      stopReason: report.stats.stopReason,
      resultCount: report.results.length
    });
  }

  printFixtureSummary(fixture.name, mode.name, runs);
  return runs;
}

async function main(): Promise<void> {
  const envSnapshot = {
    STRETTO_ENABLE_ADMISSIBILITY: process.env.STRETTO_ENABLE_ADMISSIBILITY,
    STRETTO_DIAGNOSTIC_FULL_PAIRWISE: process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE
  };

  try {
    for (const fixture of FIXTURES) {
      const perModeRuns = new Map<Mode['name'], RunMetrics[]>();
      for (const mode of MODES) {
        const runs = await runModeFixture(mode, fixture);
        perModeRuns.set(mode.name, runs);
      }

      const fullRuns = perModeRuns.get('full-domain-default')!;
      const prunedRuns = perModeRuns.get('admissibility-enabled')!;

      const fullReference = fullRuns[0];
      const prunedReference = prunedRuns[0];

      assert.ok(
        prunedReference.pairwiseTotal <= fullReference.pairwiseTotal,
        `${fixture.name}: admissibility-enabled pairwiseTotal must not exceed full-domain baseline.`
      );
      assert.ok(
        prunedReference.tripletCandidates <= fullReference.tripletCandidates,
        `${fixture.name}: admissibility-enabled triplet candidate count must not exceed full-domain baseline.`
      );
      const fullMedian = quantile(fullRuns.map((run) => run.elapsedMs), 0.5);
      const prunedMedian = quantile(prunedRuns.map((run) => run.elapsedMs), 0.5);
      const delta = relativeDeltaPercent(fullMedian, prunedMedian);
      const fullNodesMean = mean(fullRuns.map((run) => run.nodesVisited));
      const prunedNodesMean = mean(prunedRuns.map((run) => run.nodesVisited));
      const fullResultsMean = mean(fullRuns.map((run) => run.resultCount));
      const prunedResultsMean = mean(prunedRuns.map((run) => run.resultCount));

      console.log(
        [
          `[stretto-admissibility-ab] fixture=${fixture.name}`,
          `medianTimeMs(full/pruned)=${fullMedian}/${prunedMedian}`,
          `delta=${delta.toFixed(2)}%`,
          `nodesVisitedMean(full/pruned)=${fullNodesMean.toFixed(1)}/${prunedNodesMean.toFixed(1)}`,
          `resultsMean(full/pruned)=${fullResultsMean.toFixed(1)}/${prunedResultsMean.toFixed(1)}`,
          `stopReasons(full)=${Array.from(new Set(fullRuns.map((run) => run.stopReason))).join(',')}`,
          `stopReasons(pruned)=${Array.from(new Set(prunedRuns.map((run) => run.stopReason))).join(',')}`
        ].join(' ')
      );
    }
  } finally {
    if (envSnapshot.STRETTO_ENABLE_ADMISSIBILITY === undefined) {
      delete process.env.STRETTO_ENABLE_ADMISSIBILITY;
    } else {
      process.env.STRETTO_ENABLE_ADMISSIBILITY = envSnapshot.STRETTO_ENABLE_ADMISSIBILITY;
    }

    if (envSnapshot.STRETTO_DIAGNOSTIC_FULL_PAIRWISE === undefined) {
      delete process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE;
    } else {
      process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE = envSnapshot.STRETTO_DIAGNOSTIC_FULL_PAIRWISE;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
