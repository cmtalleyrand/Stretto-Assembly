import assert from 'node:assert/strict';
import { searchStrettoChains } from '../components/services/strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../types';

function makeArpeggiatedSubject(ppq: number): RawNote[] {
  const pitches = [60, 64, 67, 72, 67, 64, 60, 64, 67, 72, 67, 64];
  return pitches.map((midi, i) => ({
    midi,
    ticks: i * ppq,
    durationTicks: ppq,
    velocity: 96,
    name: `Arp${i + 1}`,
  }));
}

function makeOptions(): StrettoSearchOptions {
  return {
    ensembleTotal: 4,
    targetChainLength: 4,
    subjectVoiceIndex: 2,
    truncationMode: 'None',
    truncationTargetBeats: 4,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: false,
    maxPairwiseDissonance: 1,
    delaySpacingBeats: 0.5,
    scaleRoot: 0,
    scaleMode: 'Major',
  };
}

async function run(): Promise<void> {
  const ppq = 24;
  const subject = makeArpeggiatedSubject(ppq);
  const options = makeOptions();

  const report = await searchStrettoChains(subject, options, ppq);

  assert.equal(report.stats.stopReason, 'Success', `Expected full-chain success, got ${report.stats.stopReason}`);
  assert.ok(report.results.length > 0, 'Expected at least one guaranteed arpeggio chain result');
  assert.ok(
    report.results.some((result) => result.entries.length === options.targetChainLength),
    `Expected at least one chain of length ${options.targetChainLength}`,
  );

  console.log('stretto.arpeggio-guaranteed.test passed', {
    targetChainLength: options.targetChainLength,
    stopReason: report.stats.stopReason,
    resultCount: report.results.length,
    maxDepthReached: report.stats.maxDepthReached,
    nodesVisited: report.stats.nodesVisited,
  });
}

run().catch((error) => {
  console.error('stretto.arpeggio-guaranteed.test failed');
  console.error(error);
  process.exit(1);
});
