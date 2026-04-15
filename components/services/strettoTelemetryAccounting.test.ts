import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

const FIXTURE_SUBJECT: RawNote[] = [
  { midi: 60, ticks: 0, durationTicks: 480, velocity: 0.9, name: 'C4' },
  { midi: 62, ticks: 480, durationTicks: 480, velocity: 0.9, name: 'D4' },
  { midi: 64, ticks: 960, durationTicks: 480, velocity: 0.9, name: 'E4' },
  { midi: 65, ticks: 1440, durationTicks: 480, velocity: 0.9, name: 'F4' }
];

const FIXTURE_OPTIONS: StrettoSearchOptions = {
  ensembleTotal: 4,
  targetChainLength: 4,
  subjectVoiceIndex: 2,
  truncationMode: 'None',
  truncationTargetBeats: 4,
  inversionMode: 1,
  useChromaticInversion: false,
  thirdSixthMode: 1,
  pivotMidi: 60,
  requireConsonantEnd: true,
  disallowComplexExceptions: false,
  maxPairwiseDissonance: 1,
  scaleRoot: 0,
  scaleMode: 'Major'
};

async function run() {
  const report = await searchStrettoChains(FIXTURE_SUBJECT, FIXTURE_OPTIONS, 480);
  const stageStats = report.stats.stageStats;
  assert.ok(stageStats, 'Telemetry accounting fixture must produce stage statistics.');

  const rejected = stageStats.tripletRejectedTotal ?? 0;
  const acceptedCandidates = stageStats.tripletCandidatesAccepted ?? stageStats.tripletAcceptedTotal ?? 0;
  const distinctShapes = stageStats.tripletDistinctShapesAccepted ?? stageStats.harmonicallyValidTriples;

  assert.equal(
    stageStats.tripleCandidates,
    acceptedCandidates + rejected,
    'Invariant violation: candidates total must equal accepted candidates plus rejected candidates.'
  );
  assert.equal(
    acceptedCandidates,
    stageStats.tripletAcceptedTotal ?? acceptedCandidates,
    'Accepted-candidate aliases must remain numerically identical.'
  );
  assert.equal(
    distinctShapes,
    stageStats.harmonicallyValidTriples,
    'Distinct accepted-shape metric must remain aligned with harmonicallyValidTriples alias.'
  );
  assert.ok(
    distinctShapes <= acceptedCandidates,
    'Distinct accepted shapes cannot exceed accepted candidate instances.'
  );

  console.log('strettoTelemetryAccounting.test passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
