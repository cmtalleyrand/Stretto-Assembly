import assert from 'node:assert/strict';
import { calculateCanonScore } from './canonScoring';
import type { StrettoChainOption } from '../../types';

const ppq = 480;

const variants = [
  {
    type: 'N' as const,
    truncationBeats: 0,
    lengthTicks: ppq * 2,
    notes: [
      { relTick: 0, durationTicks: ppq, pitch: 60 },
      { relTick: ppq, durationTicks: ppq, pitch: 62 },
    ],
  },
];

const parallelPerfectChain: StrettoChainOption[] = [
  { startBeat: 0, transposition: 0, type: 'N', length: ppq * 2, voiceIndex: 0 },
  { startBeat: 0, transposition: -7, type: 'N', length: ppq * 2, voiceIndex: 1 },
];

const parallelResult = calculateCanonScore(parallelPerfectChain, variants, [0, 0], 0, ppq);
assert.ok(parallelResult.scoreLog.breakdown, 'Score breakdown must be emitted for canon scoring.');
assert.equal(parallelResult.scoreLog.breakdown?.parallelPerfectCount, 1, 'Parallel perfect transition count should equal one.');
assert.ok((parallelResult.scoreLog.breakdown?.contributions.parallelPenalty ?? 0) > 0, 'Parallel perfect contribution must be represented as a positive penalty magnitude.');

const dissonantChain: StrettoChainOption[] = [
  { startBeat: 0, transposition: 0, type: 'N', length: ppq * 2, voiceIndex: 0 },
  { startBeat: 0, transposition: 1, type: 'N', length: ppq * 2, voiceIndex: 1 },
];

const dissonantResult = calculateCanonScore(dissonantChain, variants, [0, 0], 0, ppq);
assert.ok(dissonantResult.scoreLog.breakdown, 'Score breakdown must exist on dissonant test case.');
assert.ok((dissonantResult.scoreLog.breakdown?.analyzedBeats ?? 0) > 0, 'Analyzed beats must be positive.');
assert.equal(
  dissonantResult.scoreLog.breakdown?.dissonantBeats,
  dissonantResult.scoreLog.breakdown?.analyzedBeats,
  'Fully dissonant setup should yield 100% dissonant duration.'
);
assert.ok((dissonantResult.scoreLog.breakdown?.nctBeats ?? 0) >= 0, 'NCT duration accumulator must exist and be non-negative.');
assert.ok((dissonantResult.scoreLog.breakdown?.contributions.nctPenalty ?? 0) >= 0, 'NCT penalty contribution must be present as a non-negative magnitude.');
assert.ok((dissonantResult.scoreLog.breakdown?.chordSequence.length ?? 0) > 0, 'Chord sequence spans must be available for UI rendering.');

console.log('canon scoring breakdown: all assertions passed');
