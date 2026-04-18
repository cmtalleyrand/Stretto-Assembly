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
  meanWallMs: number;
  meanTripletMs: number;
  meanTotalMs: number;
  meanResults: number;
  harmonicallyValidTriples: number;
  tripletDistinctShapesAccepted: number;
  chainIdentity: string[];
}

function canonicalChainIdentities(
  report: Awaited<ReturnType<typeof searchStrettoChains>>
): string[] {
  return report.results.map((result) => result.entries
    .map((entry) => `${entry.startBeat.toFixed(6)}|${entry.transposition}|${entry.type}|${entry.length}|${entry.voiceIndex}`)
    .join('||')).sort();
}

async function runMode(
  fixture: Fixture,
  useLegacyIndexingPass: boolean
): Promise<ModeAggregate> {
  process.env.STRETTO_LEGACY_TRIPLET_RECORD_INDEX_PASS = useLegacyIndexingPass ? '1' : '0';

  let elapsedMs = 0;
  let runs = 0;
  let wallMsSum = 0;
  let tripletMsSum = 0;
  let totalMsSum = 0;
  let resultsSum = 0;
  let harmonicallyValidTriples = -1;
  let tripletDistinctShapesAccepted = -1;
  let chainIdentity: string[] = [];

  while (elapsedMs < fixture.minDurationMsPerMode) {
    const t0 = Date.now();
    const report = await searchStrettoChains(fixture.subject, fixture.options, ppq);
    const dt = Date.now() - t0;
    elapsedMs += dt;
    runs++;
    wallMsSum += dt;
    tripletMsSum += report.stats.stageTiming.tripletMs;
    totalMsSum += report.stats.timeMs;
    resultsSum += report.results.length;

    if (runs === 1) {
      harmonicallyValidTriples = report.stats.stageStats?.harmonicallyValidTriples ?? -1;
      tripletDistinctShapesAccepted = report.stats.stageStats?.tripletDistinctShapesAccepted ?? -1;
      chainIdentity = canonicalChainIdentities(report);
    }
  }

  return {
    elapsedMs,
    runs,
    meanWallMs: wallMsSum / runs,
    meanTripletMs: tripletMsSum / runs,
    meanTotalMs: totalMsSum / runs,
    meanResults: resultsSum / runs,
    harmonicallyValidTriples,
    tripletDistinctShapesAccepted,
    chainIdentity
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
    minDurationMsPerMode: 15000,
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
    minDurationMsPerMode: 40000,
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

  const wallGainPct = ((legacyTwoPass.meanWallMs - singlePass.meanWallMs) / legacyTwoPass.meanWallMs) * 100;
  const tripletGainPct = ((legacyTwoPass.meanTripletMs - singlePass.meanTripletMs) / legacyTwoPass.meanTripletMs) * 100;
  const utilityGainPct = ((legacyTwoPass.meanTotalMs - singlePass.meanTotalMs) / legacyTwoPass.meanTotalMs) * 100;

  console.log(JSON.stringify({
    fixture: fixture.name,
    minDurationMsPerMode: fixture.minDurationMsPerMode,
    singlePass,
    legacyTwoPass,
    estimates: {
      wallGainPct,
      tripletStageGainPct: tripletGainPct,
      totalUtilityGainPct: utilityGainPct
    }
  }, null, 2));
}

delete process.env.STRETTO_LEGACY_TRIPLET_RECORD_INDEX_PASS;
console.log('triplet-record refactor comparison complete');
