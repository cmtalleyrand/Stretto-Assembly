import assert from 'node:assert/strict';
import { searchStrettoChains } from '../components/services/strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../types';

function makeTwelveBeatSubject(ppq: number): RawNote[] {
  const pitches = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65];
  return pitches.map((midi, i) => ({
    midi,
    ticks: i * ppq,
    durationTicks: ppq,
    velocity: 96,
    name: `N${i + 1}`,
  }));
}

function makeOptions(): StrettoSearchOptions {
  return {
    ensembleTotal: 4,
    targetChainLength: 8,
    subjectVoiceIndex: 2,
    truncationMode: 'Max 1',
    truncationTargetBeats: 8,
    inversionMode: 'Max 1',
    useChromaticInversion: false,
    thirdSixthMode: 'Max 1',
    pivotMidi: 60,
    requireConsonantEnd: true,
    disallowComplexExceptions: false,
    maxPairwiseDissonance: 1,
    scaleRoot: 0,
    scaleMode: 'Major',
  };
}

async function run(): Promise<void> {
  const ppq = 12;
  const subject = makeTwelveBeatSubject(ppq);
  const options = makeOptions();

  const report = await searchStrettoChains(subject, options, ppq);

  assert.equal(subject.length, 12, 'Expected exactly 12 notes in the 12-beat subject');
  assert.equal(subject[11].ticks + subject[11].durationTicks, 12 * ppq, 'Expected subject span to be 12 beats');
  assert.equal(options.targetChainLength, 8, 'Expected chain size target to be 8');
  assert.ok(report.stats.nodesVisited > 0, 'Expected assembly to visit at least one search node');
  assert.ok(report.stats.maxDepthReached >= 2, `Expected search to progress beyond seed entry, got ${report.stats.maxDepthReached}`);
  assert.ok(
    ['Timeout', 'Partial', 'NodeLimit', 'Exhausted', 'Success'].includes(report.stats.stopReason),
    `Unexpected stopReason: ${report.stats.stopReason}`,
  );
  assert.ok(report.results.length > 0, 'Expected algorithmic chain search to return at least one chain');

  const leader = report.results[0];
  assert.ok(leader.entries.length >= 3, 'Expected non-trivial chain entries in top chain');
  assert.equal(leader.entries[0].startBeat, 0, 'Expected chain to start at beat 0');

  console.log('stretto.chain8.test passed', {
    subjectBeats: 12,
    subjectNotes: subject.length,
    targetChainLength: options.targetChainLength,
    maxDepthReached: report.stats.maxDepthReached,
    stopReason: report.stats.stopReason,
    resultCount: report.results.length,
  });
}

run().catch((error) => {
  console.error('stretto.chain8.test failed');
  console.error(error);
  process.exit(1);
});
