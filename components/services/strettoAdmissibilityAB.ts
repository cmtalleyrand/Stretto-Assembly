import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
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

type StageEvent = {
  stage: 'pairwise' | 'triplet' | 'dag';
  atMs: number;
};

type RunMetrics = {
  wallMs: number;
  pairwiseStageMs: number;
  tripletStageMs: number;
  dagStageMs: number;
  pairwiseTotal: number;
  pairwiseCompatible: number;
  tripleCandidates: number;
  harmonicallyValidTriples: number;
  nodesVisited: number;
  stopReason: string;
  resultsCount: number;
  maxDepthReached: number;
  scoringValidChainsFound: number;
  structurallyCompleteChainsFound: number;
  bestScore: number;
};

const PPQ = 480;
const RUNS_PER_MODE = 7;

const FIXTURES: Fixture[] = [
  {
    name: 'non_timeout_target4_scale6',
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
      maxSearchTimeMs: 20000,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  },
  {
    name: 'non_timeout_target5_scale8',
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
      ensembleTotal: 5,
      targetChainLength: 5,
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
      maxSearchTimeMs: 20000,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  }
];

const BUDGETED_FIXTURES: Fixture[] = [
  {
    name: 'budgeted_target8_scale8',
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

function setModeEnv(mode: Mode): void {
  for (const [key, value] of Object.entries(mode.env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function pctDelta(reference: number, candidate: number): number {
  if (reference === 0) {
    if (candidate === 0) return 0;
    return Number.POSITIVE_INFINITY;
  }
  return ((candidate - reference) / reference) * 100;
}

function stageBoundaryMs(events: StageEvent[], stage: StageEvent['stage']): number {
  const first = events.find((event) => event.stage === stage);
  assert.ok(first, `Missing ${stage} stage progress event.`);
  return first.atMs;
}

async function runSingle(fixture: Fixture): Promise<RunMetrics> {
  const events: StageEvent[] = [];
  const wallStart = performance.now();
  const report = await searchStrettoChains(
    fixture.subject,
    fixture.options,
    PPQ,
    (progress) => {
      events.push({ stage: progress.stage, atMs: performance.now() });
    }
  );
  const wallEnd = performance.now();
  const stageStats = report.stats.stageStats;
  assert.ok(stageStats, `${fixture.name}: expected stageStats.`);

  const pairwiseStart = stageBoundaryMs(events, 'pairwise');
  const tripletStart = stageBoundaryMs(events, 'triplet');
  const dagStart = stageBoundaryMs(events, 'dag');
  const pairwiseStageMs = Math.max(0, tripletStart - pairwiseStart);
  const tripletStageMs = Math.max(0, dagStart - tripletStart);
  const dagStageMs = Math.max(0, wallEnd - dagStart);

  return {
    wallMs: wallEnd - wallStart,
    pairwiseStageMs,
    tripletStageMs,
    dagStageMs,
    pairwiseTotal: stageStats.pairwiseTotal,
    pairwiseCompatible: stageStats.pairwiseCompatible,
    tripleCandidates: stageStats.tripleCandidates,
    harmonicallyValidTriples: stageStats.harmonicallyValidTriples,
    nodesVisited: report.stats.nodesVisited,
    stopReason: report.stats.stopReason,
    resultsCount: report.results.length,
    maxDepthReached: report.stats.maxDepthReached,
    scoringValidChainsFound: report.stats.completionDiagnostics?.scoringValidChainsFound ?? 0,
    structurallyCompleteChainsFound: report.stats.completionDiagnostics?.structurallyCompleteChainsFound ?? 0,
    bestScore: report.results.length > 0 ? Math.max(...report.results.map((result) => result.score)) : Number.NEGATIVE_INFINITY
  };
}

async function runFixtureMode(fixture: Fixture, mode: Mode): Promise<RunMetrics[]> {
  setModeEnv(mode);
  await runSingle(fixture); // warmup, excluded

  const runs: RunMetrics[] = [];
  for (let i = 0; i < RUNS_PER_MODE; i++) {
    runs.push(await runSingle(fixture));
  }
  return runs;
}

function summarize(label: string, runs: RunMetrics[]): string {
  return [
    `label=${label}`,
    `runs=${runs.length}`,
    `wallMs(mean/median)=${mean(runs.map((r) => r.wallMs)).toFixed(2)}/${median(runs.map((r) => r.wallMs)).toFixed(2)}`,
    `pairwiseStageMs(mean/median)=${mean(runs.map((r) => r.pairwiseStageMs)).toFixed(2)}/${median(runs.map((r) => r.pairwiseStageMs)).toFixed(2)}`,
    `tripletStageMs(mean/median)=${mean(runs.map((r) => r.tripletStageMs)).toFixed(2)}/${median(runs.map((r) => r.tripletStageMs)).toFixed(2)}`,
    `dagStageMs(mean/median)=${mean(runs.map((r) => r.dagStageMs)).toFixed(2)}/${median(runs.map((r) => r.dagStageMs)).toFixed(2)}`,
    `nodesVisited(mean)=${mean(runs.map((r) => r.nodesVisited)).toFixed(2)}`,
    `resultsCount(mean)=${mean(runs.map((r) => r.resultsCount)).toFixed(2)}`,
    `maxDepth(mean)=${mean(runs.map((r) => r.maxDepthReached)).toFixed(2)}`,
    `scoringValidChainsFound(mean)=${mean(runs.map((r) => r.scoringValidChainsFound)).toFixed(2)}`,
    `structurallyCompleteChainsFound(mean)=${mean(runs.map((r) => r.structurallyCompleteChainsFound)).toFixed(2)}`,
    `stopReasons=${Array.from(new Set(runs.map((r) => r.stopReason))).join(',')}`
  ].join(' ');
}

async function main(): Promise<void> {
  const snapshot = {
    STRETTO_ENABLE_ADMISSIBILITY: process.env.STRETTO_ENABLE_ADMISSIBILITY,
    STRETTO_DIAGNOSTIC_FULL_PAIRWISE: process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE
  };

  try {
    for (const fixture of FIXTURES) {
      const fullRuns = await runFixtureMode(fixture, MODES[0]);
      const prunedRuns = await runFixtureMode(fixture, MODES[1]);

      const full = fullRuns[0];
      const pruned = prunedRuns[0];

      assert.ok(
        pruned.pairwiseTotal <= full.pairwiseTotal,
        `${fixture.name}: admissibility must not increase pairwiseTotal.`
      );
      assert.ok(
        pruned.tripleCandidates <= full.tripleCandidates,
        `${fixture.name}: admissibility must not increase tripleCandidates.`
      );
      assert.ok(
        pruned.pairwiseCompatible <= full.pairwiseCompatible,
        `${fixture.name}: admissibility must not increase pairwiseCompatible.`
      );
      assert.ok(
        pruned.harmonicallyValidTriples <= full.harmonicallyValidTriples,
        `${fixture.name}: admissibility must not increase harmonicallyValidTriples.`
      );

      console.log(`[stretto-admissibility-ab] fixture=${fixture.name}`);
      console.log(`[stretto-admissibility-ab] ${summarize('full-domain-default', fullRuns)}`);
      console.log(`[stretto-admissibility-ab] ${summarize('admissibility-enabled', prunedRuns)}`);
      console.log(
        [
          `[stretto-admissibility-ab] fixture=${fixture.name}`,
          `delta.pairwiseStageMedianPct=${pctDelta(median(fullRuns.map((r) => r.pairwiseStageMs)), median(prunedRuns.map((r) => r.pairwiseStageMs))).toFixed(2)}%`,
          `delta.tripletStageMedianPct=${pctDelta(median(fullRuns.map((r) => r.tripletStageMs)), median(prunedRuns.map((r) => r.tripletStageMs))).toFixed(2)}%`,
          `delta.wallMedianPct=${pctDelta(median(fullRuns.map((r) => r.wallMs)), median(prunedRuns.map((r) => r.wallMs))).toFixed(2)}%`
        ].join(' ')
      );
    }

    for (const fixture of BUDGETED_FIXTURES) {
      const fullRuns = await runFixtureMode(fixture, MODES[0]);
      const prunedRuns = await runFixtureMode(fixture, MODES[1]);
      const fullWallMedian = median(fullRuns.map((r) => r.wallMs));
      const prunedWallMedian = median(prunedRuns.map((r) => r.wallMs));
      const fullQualityPerSecond = mean(fullRuns.map((r) => r.scoringValidChainsFound / (r.wallMs / 1000)));
      const prunedQualityPerSecond = mean(prunedRuns.map((r) => r.scoringValidChainsFound / (r.wallMs / 1000)));
      const qualityDelta = pctDelta(fullQualityPerSecond, prunedQualityPerSecond);

      console.log(`[stretto-admissibility-ab][budgeted] fixture=${fixture.name}`);
      console.log(`[stretto-admissibility-ab][budgeted] ${summarize('full-domain-default', fullRuns)}`);
      console.log(`[stretto-admissibility-ab][budgeted] ${summarize('admissibility-enabled', prunedRuns)}`);
      console.log(
        [
          `[stretto-admissibility-ab][budgeted] fixture=${fixture.name}`,
          `delta.wallMedianPct=${pctDelta(fullWallMedian, prunedWallMedian).toFixed(2)}%`,
          `delta.qualityPerSecondPct=${Number.isFinite(qualityDelta) ? `${qualityDelta.toFixed(2)}%` : '+Inf'}`
        ].join(' ')
      );
    }
  } finally {
    if (snapshot.STRETTO_ENABLE_ADMISSIBILITY === undefined) {
      delete process.env.STRETTO_ENABLE_ADMISSIBILITY;
    } else {
      process.env.STRETTO_ENABLE_ADMISSIBILITY = snapshot.STRETTO_ENABLE_ADMISSIBILITY;
    }
    if (snapshot.STRETTO_DIAGNOSTIC_FULL_PAIRWISE === undefined) {
      delete process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE;
    } else {
      process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE = snapshot.STRETTO_DIAGNOSTIC_FULL_PAIRWISE;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
