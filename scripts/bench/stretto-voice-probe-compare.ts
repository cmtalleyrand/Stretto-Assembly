import assert from 'node:assert/strict';
import { searchStrettoChains } from '../../components/services/strettoGenerator';
import {
  fixtureBeyondEntry7,
  fixtureStressNearLimits,
  normalizeChainSignatureSet,
  ppq
} from '../../components/services/testFixtures/strettoTraversalFixtures';
import { computeU1, computeU2 } from '../../components/services/strettoTestUtils';
import type { RawNote, StrettoSearchOptions } from '../../types';

interface FixturePlan {
  name: string;
  subject: RawNote[];
  options: StrettoSearchOptions;
  minSecondsPerMode: number;
}

interface ModeRunSummary {
  elapsedMs: number;
  iterations: number;
  avgSearchMs: number;
  avgVoiceProbeCount: number;
  avgVoiceProbeBaselineCount: number;
  avgChains: number;
  avgMaxDepth: number;
  avgU1: number;
  avgU2: number;
  signatureUnion: Set<string>;
}

interface FixtureSummary {
  fixture: string;
  optimized: ModeRunSummary;
  legacy: ModeRunSummary;
}

const wtc21Subject: RawNote[] = [
  { midi: 72, ticks: 240, durationTicks: 240, velocity: 80, name: 'C5' },
  { midi: 70, ticks: 480, durationTicks: 240, velocity: 80, name: 'Bb4' },
  { midi: 69, ticks: 720, durationTicks: 240, velocity: 80, name: 'A4' },
  { midi: 70, ticks: 960, durationTicks: 240, velocity: 80, name: 'Bb4' },
  { midi: 65, ticks: 1200, durationTicks: 240, velocity: 80, name: 'F4' },
  { midi: 62, ticks: 1440, durationTicks: 240, velocity: 80, name: 'D4' },
  { midi: 67, ticks: 1680, durationTicks: 240, velocity: 80, name: 'G4' },
  { midi: 65, ticks: 1920, durationTicks: 240, velocity: 80, name: 'F4' },
  { midi: 63, ticks: 2160, durationTicks: 240, velocity: 80, name: 'Eb4' },
  { midi: 65, ticks: 2400, durationTicks: 240, velocity: 80, name: 'F4' },
  { midi: 62, ticks: 2640, durationTicks: 240, velocity: 80, name: 'D4' },
  { midi: 58, ticks: 2880, durationTicks: 240, velocity: 80, name: 'Bb3' },
  { midi: 63, ticks: 3120, durationTicks: 240, velocity: 80, name: 'Eb4' },
  { midi: 63, ticks: 3360, durationTicks: 240, velocity: 80, name: 'Eb4' },
  { midi: 62, ticks: 3600, durationTicks: 240, velocity: 80, name: 'D4' },
  { midi: 62, ticks: 3840, durationTicks: 240, velocity: 80, name: 'D4' },
  { midi: 60, ticks: 4080, durationTicks: 240, velocity: 80, name: 'C4' },
  { midi: 60, ticks: 4320, durationTicks: 240, velocity: 80, name: 'C4' },
  { midi: 65, ticks: 4560, durationTicks: 240, velocity: 80, name: 'F4' },
  { midi: 65, ticks: 4800, durationTicks: 240, velocity: 80, name: 'F4' },
  { midi: 63, ticks: 5040, durationTicks: 240, velocity: 80, name: 'Eb4' },
  { midi: 63, ticks: 5280, durationTicks: 240, velocity: 80, name: 'Eb4' },
  { midi: 62, ticks: 5520, durationTicks: 240, velocity: 80, name: 'D4' }
];

const wtc21Options: StrettoSearchOptions = {
  ensembleTotal: 4,
  targetChainLength: 5,
  subjectVoiceIndex: 1,
  truncationMode: 'None',
  truncationTargetBeats: 1,
  inversionMode: 'None',
  useChromaticInversion: false,
  thirdSixthMode: 1,
  pivotMidi: 62,
  requireConsonantEnd: false,
  disallowComplexExceptions: true,
  maxPairwiseDissonance: 0.5,
  scaleRoot: 10,
  scaleMode: 'Major',
  maxSearchTimeMs: 5000
};

const fixturePlans: FixturePlan[] = [
  {
    name: 'wtc1_f21_bbmaj',
    subject: wtc21Subject,
    options: wtc21Options,
    minSecondsPerMode: 15
  },
  {
    name: fixtureBeyondEntry7.name,
    subject: fixtureBeyondEntry7.subject,
    options: fixtureBeyondEntry7.options,
    minSecondsPerMode: 15
  },
  {
    name: fixtureStressNearLimits.name,
    subject: fixtureStressNearLimits.subject,
    options: fixtureStressNearLimits.options,
    minSecondsPerMode: 40
  }
];

async function runMode(fixture: FixturePlan, disableOptimization: boolean): Promise<ModeRunSummary> {
  if (disableOptimization) process.env.STRETTO_DISABLE_VOICE_TRANSITION_PRECOMPUTE = '1';
  else delete process.env.STRETTO_DISABLE_VOICE_TRANSITION_PRECOMPUTE;

  const minElapsedMs = fixture.minSecondsPerMode * 1000;
  const startedAt = Date.now();
  let elapsedMs = 0;
  let iterations = 0;
  let aggregateSearchMs = 0;
  let aggregateVoiceProbes = 0;
  let aggregateVoiceProbeBaseline = 0;
  let aggregateChains = 0;
  let aggregateMaxDepth = 0;
  let aggregateU1 = 0;
  let aggregateU2 = 0;
  const signatureUnion = new Set<string>();

  do {
    const report = await searchStrettoChains(fixture.subject, fixture.options, ppq);
    const stageStats = report.stats.stageStats;
    assert.ok(stageStats, `${fixture.name}: stageStats must be defined for benchmark runs.`);
    aggregateSearchMs += report.stats.timeMs;
    aggregateVoiceProbes += stageStats?.voiceTransitionProbeCount ?? 0;
    aggregateVoiceProbeBaseline += stageStats?.voiceTransitionProbeBaselineCount ?? 0;
    aggregateChains += report.results.length;
    aggregateMaxDepth += report.stats.maxDepthReached;
    const subjectSpan = Math.max(0, Math.max(...fixture.subject.map((n) => n.midi)) - Math.min(...fixture.subject.map((n) => n.midi)));
    aggregateU1 += computeU1(report.results, fixture.options.targetChainLength, subjectSpan);
    aggregateU2 += computeU2(report.results, fixture.options.targetChainLength, subjectSpan);
    iterations += 1;
    const sigSet = normalizeChainSignatureSet(report);
    for (const sig of sigSet) signatureUnion.add(sig);
    elapsedMs = Date.now() - startedAt;
  } while (elapsedMs < minElapsedMs);

  return {
    elapsedMs,
    iterations,
    avgSearchMs: aggregateSearchMs / Math.max(1, iterations),
    avgVoiceProbeCount: aggregateVoiceProbes / Math.max(1, iterations),
    avgVoiceProbeBaselineCount: aggregateVoiceProbeBaseline / Math.max(1, iterations),
    avgChains: aggregateChains / Math.max(1, iterations),
    avgMaxDepth: aggregateMaxDepth / Math.max(1, iterations),
    avgU1: aggregateU1 / Math.max(1, iterations),
    avgU2: aggregateU2 / Math.max(1, iterations),
    signatureUnion
  };
}

function percentGain(legacy: number, optimized: number): number {
  if (legacy <= 0) return 0;
  return ((legacy - optimized) / legacy) * 100;
}

const summaries: FixtureSummary[] = [];
for (const fixture of fixturePlans) {
  const optimized = await runMode(fixture, false);
  const legacy = await runMode(fixture, true);

  assert.deepEqual(
    [...optimized.signatureUnion].sort(),
    [...legacy.signatureUnion].sort(),
    `${fixture.name}: optimized and legacy modes must preserve accepted chain signatures.`
  );

  summaries.push({ fixture: fixture.name, optimized, legacy });
}

delete process.env.STRETTO_DISABLE_VOICE_TRANSITION_PRECOMPUTE;

console.log('voice-probe benchmark comparison (optimized vs legacy):');
for (const summary of summaries) {
  const timeGain = percentGain(summary.legacy.avgSearchMs, summary.optimized.avgSearchMs);
  const probeGain = percentGain(summary.legacy.avgVoiceProbeCount, summary.optimized.avgVoiceProbeCount);
  console.log(
    JSON.stringify(
      {
        fixture: summary.fixture,
        optimized: {
          elapsedMs: summary.optimized.elapsedMs,
          iterations: summary.optimized.iterations,
          avgSearchMs: Number(summary.optimized.avgSearchMs.toFixed(2)),
          avgVoiceProbeCount: Number(summary.optimized.avgVoiceProbeCount.toFixed(2)),
          avgVoiceProbeBaselineCount: Number(summary.optimized.avgVoiceProbeBaselineCount.toFixed(2)),
          avgChains: Number(summary.optimized.avgChains.toFixed(2)),
          avgMaxDepth: Number(summary.optimized.avgMaxDepth.toFixed(2)),
          avgU1: Number(summary.optimized.avgU1.toFixed(2)),
          avgU2: Number(summary.optimized.avgU2.toFixed(2))
        },
        legacy: {
          elapsedMs: summary.legacy.elapsedMs,
          iterations: summary.legacy.iterations,
          avgSearchMs: Number(summary.legacy.avgSearchMs.toFixed(2)),
          avgVoiceProbeCount: Number(summary.legacy.avgVoiceProbeCount.toFixed(2)),
          avgVoiceProbeBaselineCount: Number(summary.legacy.avgVoiceProbeBaselineCount.toFixed(2)),
          avgChains: Number(summary.legacy.avgChains.toFixed(2)),
          avgMaxDepth: Number(summary.legacy.avgMaxDepth.toFixed(2)),
          avgU1: Number(summary.legacy.avgU1.toFixed(2)),
          avgU2: Number(summary.legacy.avgU2.toFixed(2))
        },
        estimatedEfficiencyGainPct: {
          wallClockAvgSearchMs: Number(timeGain.toFixed(2)),
          voiceProbeCount: Number(probeGain.toFixed(2))
        }
      },
      null,
      2
    )
  );
}
