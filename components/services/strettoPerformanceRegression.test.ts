import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

type BaselineFixture = {
  multiplier: number;
  depthLowerBound: number;
  stats: {
    timeMs: number;
    nodesVisited: number;
    stageStats: Record<string, number>;
  };
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
  limit: number;
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

function checkUpperBound(fixture: string, metric: string, current: number, baselineValue: number, multiplier: number): void {
  const limit = Math.ceil(baselineValue * multiplier);
  rows.push({ fixture, metric, current, baseline: baselineValue, limit });
  assert.ok(
    current <= limit,
    `${fixture}.${metric} regression: current=${current}, baseline=${baselineValue}, limit=${limit} (multiplier=${multiplier})`
  );
}

function printComparisonTable(): void {
  const headers = ['fixture', 'metric', 'current', 'baseline', 'limit'];
  const table = [headers, ...rows.map((row) => [row.fixture, row.metric, String(row.current), String(row.baseline), String(row.limit)])];
  const widths = headers.map((_, col) => Math.max(...table.map((line) => line[col].length)));
  const fmt = (line: string[]): string => line.map((cell, i) => cell.padEnd(widths[i], ' ')).join(' | ');
  const divider = widths.map((w) => '-'.repeat(w)).join('-|-');

  console.log('[stretto-performance-regression] current vs baseline');
  console.log(fmt(headers));
  console.log(divider);
  for (const row of rows) {
    console.log(fmt([row.fixture, row.metric, String(row.current), String(row.baseline), String(row.limit)]));
  }
}

for (const [fixtureName, fixture] of Object.entries(FIXTURES)) {
  const fixtureBaseline = baseline.fixtures[fixtureName];
  assert.ok(fixtureBaseline, `Missing baseline fixture '${fixtureName}' in ${baselinePath}`);

  await searchStrettoChains(fixture.subject, fixture.options, ppq);
  const report = await searchStrettoChains(fixture.subject, fixture.options, ppq);

  assert.ok(report.stats.stageStats, `${fixtureName} must expose stageStats for performance regression checks.`);
  assert.equal(report.stats.stopReason, 'Exhausted', `${fixtureName} must fully exhaust to keep topology stable for regression analysis.`);
  assert.ok(
    report.stats.maxDepthReached >= fixtureBaseline.depthLowerBound,
    `${fixtureName}.maxDepthReached regression: current=${report.stats.maxDepthReached}, required>=${fixtureBaseline.depthLowerBound}`
  );

  checkUpperBound(fixtureName, 'timeMs', report.stats.timeMs, fixtureBaseline.stats.timeMs, fixtureBaseline.multiplier);
  checkUpperBound(fixtureName, 'nodesVisited', report.stats.nodesVisited, fixtureBaseline.stats.nodesVisited, fixtureBaseline.multiplier);

  for (const [counterName, baselineCounter] of Object.entries(fixtureBaseline.stats.stageStats)) {
    const currentCounter = (report.stats.stageStats as Record<string, number | undefined>)[counterName] ?? 0;
    checkUpperBound(fixtureName, `stageStats.${counterName}`, currentCounter, baselineCounter, fixtureBaseline.multiplier);
  }
}

printComparisonTable();
console.log('stretto performance regression test passed');
console.log('Baseline update guidance:', baseline.updateGuidance.join(' '));
