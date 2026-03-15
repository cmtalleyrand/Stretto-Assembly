import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

const ppq = 480;
const delayStep = ppq / 2;

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
    disallowComplexExceptions: false,
    maxPairwiseDissonance: 0.75,
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
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
    disallowComplexExceptions: false,
    maxPairwiseDissonance: 0.05,
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
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
// With a maxSearchTimeMs of 1ms on a complex 8-note subject, the search must
// always terminate with stopReason === 'Timeout'. Any partial results that
// were emitted before the cutoff must still satisfy structural invariants.
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
    disallowComplexExceptions: false,
    maxPairwiseDissonance: 0.75,
    maxSearchTimeMs: 1,
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
  assert.equal(
    report.stats.stopReason,
    'Timeout',
    'fixture-C: 1ms time limit must always produce stopReason === Timeout'
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
    disallowComplexExceptions: false,
    maxPairwiseDissonance: 0.75,
    scaleRoot: 0,
    scaleMode: 'Major'
  };
  const report = await searchStrettoChains(subject, options, ppq);
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

console.log('stretto integration tests passed');
