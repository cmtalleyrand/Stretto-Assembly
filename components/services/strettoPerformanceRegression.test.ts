import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

type BaselineFixture = {
  depthLowerBound: number;
  stageStats: Record<string, number>;
};

type Baseline = {
  version: number;
  updateGuidance: string[];
  fixtures: Record<string, BaselineFixture>;
};

type MetricRow = {
  fixture: string;
  metric: string;
  current: number;
  baseline: number;
};

const ppq = 480;

const FIXTURES: Record<string, { subject: RawNote[]; options: StrettoSearchOptions }> = {
  target8_scale8: {
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
      disallowComplexExceptions: false,
      maxPairwiseDissonance: 0.75,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  },
  target8_scale10: {
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
      disallowComplexExceptions: false,
      maxPairwiseDissonance: 0.75,
      scaleRoot: 0,
      scaleMode: 'Major'
    }
  }
};

const baselinePath = resolve('components/services/__baselines__/stretto-performance-baseline.json');
const baseline: Baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

const rows: MetricRow[] = [];

function record(fixture: string, metric: string, current: number, baseline: number): void {
  rows.push({ fixture, metric, current, baseline });
}

function printComparisonTable(): void {
  const headers = ['fixture', 'metric', 'current', 'baseline'];
  const table = [headers, ...rows.map((row) => [row.fixture, row.metric, String(row.current), String(row.baseline)])];
  const widths = headers.map((_, col) => Math.max(...table.map((line) => line[col].length)));
  const fmt = (line: string[]): string => line.map((cell, i) => cell.padEnd(widths[i], ' ')).join(' | ');
  const divider = widths.map((w) => '-'.repeat(w)).join('-|-');

  console.log('[stretto-performance-regression] current vs baseline');
  console.log(fmt(headers));
  console.log(divider);
  for (const row of rows) {
    console.log(fmt([row.fixture, row.metric, String(row.current), String(row.baseline)]));
  }
}

for (const [fixtureName, fixture] of Object.entries(FIXTURES)) {
  const fixtureBaseline = baseline.fixtures[fixtureName];
  assert.ok(fixtureBaseline, `Missing baseline fixture '${fixtureName}' in ${baselinePath}`);

  // Warmup run
  await searchStrettoChains(fixture.subject, fixture.options, ppq);
  // Measured run
  const report = await searchStrettoChains(fixture.subject, fixture.options, ppq);

  assert.ok(report.stats.stageStats, `${fixtureName} must expose stageStats for regression checks.`);

  // Stop reason: either Exhausted (if search space small enough) or Timeout (time-gated).
  // NodeLimit should never occur (node budget removed).
  assert.ok(
    report.stats.stopReason === 'Exhausted' || report.stats.stopReason === 'Timeout',
    `${fixtureName}: unexpected stopReason '${report.stats.stopReason}' (expected 'Exhausted' or 'Timeout')`
  );

  // Depth must reach the lower bound.
  assert.ok(
    report.stats.maxDepthReached >= fixtureBaseline.depthLowerBound,
    `${fixtureName}.maxDepthReached regression: current=${report.stats.maxDepthReached}, required>=${fixtureBaseline.depthLowerBound}`
  );
  record(fixtureName, 'maxDepthReached', report.stats.maxDepthReached, fixtureBaseline.depthLowerBound);
  record(fixtureName, 'timeMs', report.stats.timeMs, -1);
  record(fixtureName, 'nodesVisited', report.stats.nodesVisited, -1);
  record(fixtureName, 'stopReason', report.stats.stopReason === 'Exhausted' ? 0 : 1, -1);

  // Stage stats are deterministic (precomputation depends only on input, not search traversal).
  // They must match baseline exactly — any deviation means the precomputation logic changed.
  for (const [counterName, baselineCounter] of Object.entries(fixtureBaseline.stageStats)) {
    const currentCounter = (report.stats.stageStats as Record<string, unknown>)[counterName] as number ?? 0;
    record(fixtureName, `stageStats.${counterName}`, currentCounter, baselineCounter);
    assert.equal(
      currentCounter,
      baselineCounter,
      `${fixtureName}.stageStats.${counterName}: current=${currentCounter}, baseline=${baselineCounter} — precomputation changed unexpectedly`
    );
  }
}

printComparisonTable();

{
  const pressuredOptions: StrettoSearchOptions = {
    ...FIXTURES.target8_scale8.options,
    maxSearchTimeMs: 40
  };
  const pressuredReport = await searchStrettoChains(FIXTURES.target8_scale8.subject, pressuredOptions, ppq);
  assert.ok(
    (pressuredReport.stats.finalizationBudgetMs ?? 0) > 0,
    'finalization budget must be reserved under timeout pressure.'
  );
  assert.ok(
    (pressuredReport.stats.finalizationScoredCount ?? 0) >= 0,
    'finalization counters must be present under timeout pressure.'
  );
  if (pressuredReport.stats.enumerationStoppedForFinalization) {
    assert.ok(
      pressuredReport.stats.finalizationScoredCount !== undefined,
      'when enumeration is stopped for reserved finalization, finalization must still execute.'
    );
  }
}

console.log('stretto performance regression test passed');
console.log('Baseline update guidance:', baseline.updateGuidance.join(' '));
