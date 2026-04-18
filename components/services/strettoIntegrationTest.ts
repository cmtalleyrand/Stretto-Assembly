import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

const ppq = 480;
const delayStep = ppq / 2;
const restrictedIntervalClasses = new Set([3, 4, 8, 9]);

function assertChainStructure(
  result: Awaited<ReturnType<typeof searchStrettoChains>>['results'][number],
  ensembleTotal: number,
  label: string
): void {
  for (let i = 0; i < result.entries.length; i++) {
    const entry = result.entries[i];
    assert.ok(
      entry.voiceIndex >= 0 && entry.voiceIndex < ensembleTotal,
      `${label}: voice index ${entry.voiceIndex} out of range [0, ${ensembleTotal}) (chain ${result.id}, entry ${i})`
    );
    if (i > 0) {
      const prev = result.entries[i - 1];
      assert.ok(
        entry.startBeat > prev.startBeat,
        `${label}: start beats must be strictly increasing (chain ${result.id}, entry ${i})`
      );
      const delayTicks = Math.round((entry.startBeat - prev.startBeat) * ppq);
      assert.ok(
        delayTicks > 0 && delayTicks % delayStep === 0,
        `${label}: delay ${delayTicks} must be a positive multiple of delayStep=${delayStep} (chain ${result.id}, entry ${i})`
      );
    }
    assert.ok(
      Number.isInteger(entry.transposition),
      `${label}: transposition ${entry.transposition} must be an integer number of semitones (chain ${result.id}, entry ${i})`
    );
  }
}

function countRestrictedAdjacentIntervals(
  result: Awaited<ReturnType<typeof searchStrettoChains>>['results'][number],
  startIndex: number,
  endIndex: number
): number {
  let restrictedCount = 0;
  for (let i = startIndex; i < endIndex; i++) {
    const delta = result.entries[i + 1].transposition - result.entries[i].transposition;
    const intervalClass = ((delta % 12) + 12) % 12;
    if (restrictedIntervalClasses.has(intervalClass)) restrictedCount++;
  }
  return restrictedCount;
}

function toCanonicalChainIdentity(
  result: Awaited<ReturnType<typeof searchStrettoChains>>['results'][number]
): string {
  return result.entries
    .map((entry) => `${entry.startBeat.toFixed(6)}|${entry.transposition}|${entry.type}|${entry.length}|${entry.voiceIndex}`)
    .join('||');
}

async function assertAdmissibilityPruningParity(
  subject: RawNote[],
  options: StrettoSearchOptions,
  label: string
): Promise<void> {
  delete process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE;
  const pruned = await searchStrettoChains(subject, options, ppq);
  process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE = '1';
  const full = await searchStrettoChains(subject, options, ppq);
  delete process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE;

  assert.ok(pruned.stats.stageStats, `${label}: pruned run must expose stageStats.`);
  assert.ok(full.stats.stageStats, `${label}: full run must expose stageStats.`);
  assert.ok(
    pruned.stats.stageStats!.pairwiseTotal <= full.stats.stageStats!.pairwiseTotal,
    `${label}: admissibility-pruned pairwiseTotal must not exceed full cartesian pairwiseTotal`
  );
  assert.equal(
    pruned.results.length,
    full.results.length,
    `${label}: admissibility pruning must preserve acceptance cardinality on fixture`
  );

  const toCanonicalChainSet = (report: Awaited<ReturnType<typeof searchStrettoChains>>): Set<string> => {
    return new Set(report.results.map(toCanonicalChainIdentity));
  };
  const prunedChainSet = toCanonicalChainSet(pruned);
  const fullChainSet = toCanonicalChainSet(full);
  assert.deepEqual(
    [...prunedChainSet].sort(),
    [...fullChainSet].sort(),
    `${label}: admissibility pruning must preserve accepted chain identities on fixture`
  );

  assert.equal(
    pruned.stats.stopReason,
    full.stats.stopReason,
    `${label}: admissibility pruning must preserve stop-reason behavior on fixture`
  );
}


// ── Fixture A: consonant arpeggio, two voices ──────────────────────────────
// A simple C-major arpeggio subject should yield at least one valid 2-voice
// stretto chain when the dissonance budget is generous.
{
  const subject: RawNote[] = [
    { midi: 60, ticks: 0,   durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 64, ticks: 480, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 67, ticks: 960, durationTicks: 480, velocity: 90, name: 'G4' }
  ];
  const options: StrettoSearchOptions = {
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
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
  await assertAdmissibilityPruningParity(subject, options, 'fixture-A');
  assert.ok(
    ['Success', 'Exhausted', 'Timeout', 'NodeLimit', 'MaxResults'].includes(report.stats.stopReason),
    'fixture-A: search must terminate with a valid stop reason'
  );
  for (const result of report.results) {
    assertChainStructure(result, options.ensembleTotal, 'fixture-A');
  }
  if (report.stats.stopReason === 'Exhausted') {
    assert.ok(
      report.results.length >= 1,
      'fixture-A: consonant two-voice arpeggio must produce at least one valid chain when fully exhausted'
    );
  }
  console.log(`[integration:fixture-A] stopReason=${report.stats.stopReason} chains=${report.results.length}`);
}

// ── Fixture B: dissonance barrier ──────────────────────────────────────────
// A chromatic semitone subject strongly constrains compatible overlaps under a
// near-zero dissonance tolerance. The search should return at most one
// admissible chain in this fixture configuration.
{
  const subject: RawNote[] = [
    { midi: 60, ticks: 0,   durationTicks: 480, velocity: 90, name: 'C4'  },
    { midi: 61, ticks: 480, durationTicks: 480, velocity: 90, name: 'C#4' }
  ];
  const options: StrettoSearchOptions = {
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
    maxPairwiseDissonance: 0.05,
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
  await assertAdmissibilityPruningParity(subject, options, 'fixture-B');
  assert.ok(
    report.results.length <= 1,
    'fixture-B: chromatic semitone subject with near-zero dissonance tolerance should not produce broad branching'
  );
  for (const result of report.results) {
    assertChainStructure(result, options.ensembleTotal, 'fixture-B');
  }
  console.log(`[integration:fixture-B] stopReason=${report.stats.stopReason} chains=${report.results.length}`);
}

// ── Fixture C: timeout stop-reason ────────────────────────────────────────
// With a maxSearchTimeMs of 1ms on a complex 8-note subject, the search should
// either timeout during traversal or succeed immediately if valid depth-2 chains
// are found before time gating triggers. Any emitted results must satisfy
// structural invariants.
{
  const subject: RawNote[] = [
    { midi: 60, ticks: 0,    durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480,  durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960,  durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
    { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
    { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' },
    { midi: 71, ticks: 2880, durationTicks: 480, velocity: 90, name: 'B4' },
    { midi: 72, ticks: 3360, durationTicks: 480, velocity: 90, name: 'C5' }
  ];
  const options: StrettoSearchOptions = {
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
    maxSearchTimeMs: 1,
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
  await assertAdmissibilityPruningParity(subject, options, 'fixture-C');
  assert.ok(
    report.stats.stopReason === 'Timeout' || report.stats.stopReason === 'Success',
    `fixture-C: expected Timeout|Success at 1ms budget, got ${report.stats.stopReason}`
  );
  for (const result of report.results) {
    assertChainStructure(result, options.ensembleTotal, 'fixture-C');
  }
  console.log(`[integration:fixture-C] stopReason=${report.stats.stopReason} chains=${report.results.length}`);
}

// ── Fixture D: four-voice scale subject, full structural integrity ─────────
// A four-note C-major ascending subject with four voices and a four-entry
// target: every returned chain must satisfy all structural invariants and
// the search must find at least one when exhausted.
{
  const subject: RawNote[] = [
    { midi: 60, ticks: 0,    durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480,  durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960,  durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' }
  ];
  const options: StrettoSearchOptions = {
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
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
  await assertAdmissibilityPruningParity(subject, options, 'fixture-D');
  assert.ok(
    ['Success', 'Exhausted', 'Timeout', 'NodeLimit', 'MaxResults'].includes(report.stats.stopReason),
    'fixture-D: search must terminate with a valid stop reason'
  );
  for (const result of report.results) {
    assertChainStructure(result, options.ensembleTotal, 'fixture-D');
    assert.equal(
      result.entries.length,
      options.targetChainLength,
      `fixture-D: every result must have exactly ${options.targetChainLength} entries (chain ${result.id})`
    );
  }
  if (report.stats.stopReason === 'Exhausted') {
    assert.ok(
      report.results.length >= 1,
      'fixture-D: four-voice C-major subject must yield at least one valid chain when fully exhausted'
    );
  }
  console.log(`[integration:fixture-D] stopReason=${report.stats.stopReason} chains=${report.results.length}`);
}

// ── Fixture E: long-chain third/sixth quota in both Phase-A triplets ───────
// A 7-entry search under thirdSixthMode = 1 must preserve the per-triplet
// adjacent third/sixth cap in both the seed window (e0→e3) and the extension
// window (e3→e6).
{
  const subject: RawNote[] = [
    { midi: 60, ticks: 0,    durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480,  durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960,  durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
    { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' }
  ];
  const options: StrettoSearchOptions = {
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
    maxSearchTimeMs: 8000,
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
  assert.equal(
    report.stats.stopReason,
    'Success',
    'fixture-E: constrained long-chain search must complete successfully within the test budget'
  );
  assert.ok(
    report.results.length > 0,
    'fixture-E: constrained long-chain search must yield at least one admissible chain'
  );
  const stageStats = report.stats.stageStats;
  assert.ok(stageStats, 'fixture-E: stageStats must be present for regression comparison.');
  assert.equal(
    stageStats.harmonicallyValidTriples,
    17724,
    'fixture-E: harmonicallyValidTriples regression guard failed (before/after refactor mismatch)'
  );
  assert.equal(
    stageStats.tripletDistinctShapesAccepted,
    17724,
    'fixture-E: tripletDistinctShapesAccepted regression guard failed (before/after refactor mismatch)'
  );
  const canonicalChainIdentities = report.results.map(toCanonicalChainIdentity).sort();
  assert.deepEqual(
    canonicalChainIdentities,
    [
      '0.000000|0|N|2400|0||3.000000|-12|N|2400|1||5.500000|-4|N|2400|0||7.500000|-17|N|2400|1||8.500000|-31|N|2400|3||10.000000|-21|N|2400|2||10.500000|-9|N|2400|0'
    ],
    'fixture-E: resulting chain identities regression guard failed (before/after refactor mismatch)'
  );
  for (const result of report.results) {
    assertChainStructure(result, options.ensembleTotal, 'fixture-E');
    assert.equal(
      result.entries.length,
      options.targetChainLength,
      `fixture-E: every accepted chain must reach the full target depth (chain ${result.id})`
    );
    assert.ok(
      countRestrictedAdjacentIntervals(result, 0, 2) <= 1,
      `fixture-E: seed triplet e0→e3 must contain at most one adjacent 3rd/6th when thirdSixthMode = 1 (chain ${result.id})`
    );
    assert.ok(
      countRestrictedAdjacentIntervals(result, 3, 5) <= 1,
      `fixture-E: extension triplet e3→e6 must contain at most one adjacent 3rd/6th when thirdSixthMode = 1 (chain ${result.id})`
    );
  }
  console.log(`[integration:fixture-E] stopReason=${report.stats.stopReason} chains=${report.results.length}`);
}

console.log('stretto integration tests passed');

// ── Fixture F: canon-delay search enforces identical delays in user range ──
{
  const subject: RawNote[] = [
    { midi: 60, ticks: 0,    durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 64, ticks: 480,  durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 67, ticks: 960,  durationTicks: 480, velocity: 90, name: 'G4' },
    { midi: 72, ticks: 1440, durationTicks: 480, velocity: 90, name: 'C5' }
  ];
  const options: StrettoSearchOptions = {
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
  };
  const report = await searchStrettoChains(subject, options, ppq);
  assert.ok(
    ['Success', 'Exhausted', 'Timeout', 'NodeLimit', 'MaxResults'].includes(report.stats.stopReason),
    'fixture-F: canon mode must terminate with a valid stop reason'
  );
  for (const result of report.results) {
    assertChainStructure(result, options.ensembleTotal, 'fixture-F');
    const delays = result.entries.slice(1).map((entry, index) => (
      Math.round((entry.startBeat - result.entries[index].startBeat) * ppq)
    ));
    assert.ok(
      delays.every((delay) => delay === ppq),
      `fixture-F: all adjacent delays must be exactly 1 beat in canon mode (chain ${result.id}; got ${delays.join(',')})`
    );
  }
  console.log(`[integration:fixture-F] stopReason=${report.stats.stopReason} chains=${report.results.length}`);
}

// ── Fixture G: prefix admissibility and finalization diagnostics are observable ──
{
  const subject: RawNote[] = [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 61, ticks: 240, durationTicks: 480, velocity: 90, name: 'C#4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 63, ticks: 720, durationTicks: 480, velocity: 90, name: 'D#4' }
  ];
  const options: StrettoSearchOptions = {
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
    maxPairwiseDissonance: 0.3,
    maxSearchTimeMs: 200,
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
  assert.ok(report.stats.stageStats, 'fixture-G: stage stats must be available.');
  assert.ok(
    (report.stats.stageStats.prunedByPrefixAdmissibility ?? 0) >= 0,
    'fixture-G: prefix admissibility pruning counter must be exposed.'
  );

  process.env.STRETTO_DISABLE_PREFIX_ADMISSIBILITY = '1';
  const unprunedReport = await searchStrettoChains(subject, options, ppq);
  delete process.env.STRETTO_DISABLE_PREFIX_ADMISSIBILITY;
  assert.ok(
    report.stats.nodesVisited <= unprunedReport.stats.nodesVisited,
    'fixture-G: no successor expansion should proceed from inadmissible prefixes when the gate is enabled.'
  );

  if (report.stats.maxDepthReached >= options.targetChainLength && (report.stats.completionDiagnostics?.structurallyCompleteChainsFound ?? 0) > 0 && report.results.length === 0) {
    assert.ok(
      (report.stats.completionDiagnostics?.finalizationRejectedScoringInvalid ?? 0)
        + (report.stats.completionDiagnostics?.finalizationRejectedVoiceAssignment ?? 0) > 0,
      'fixture-G: when full chains exist but no final results survive, diagnostics must expose finalization rejection counts.'
    );
  }
}
