import type { RawNote, StrettoSearchOptions } from '../../../types';
import type { searchStrettoChains } from '../strettoGenerator';

export const ppq = 480;
export const delayStep = ppq / 2;

export const baseSubject: RawNote[] = [
  { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
  { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
  { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
  { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' }
];

export const baseOptions: StrettoSearchOptions = {
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

export interface TraversalFixture {
  name: string;
  subject: RawNote[];
  options: StrettoSearchOptions;
}

export const fixtureEntry7Regime: TraversalFixture = {
  name: 'entry-7-regime',
  subject: [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
    { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' }
  ],
  options: {
    ...baseOptions,
    maxSearchTimeMs: 90000,
    targetChainLength: 7,
    thirdSixthMode: 'None',
    maxPairwiseDissonance: 0.5
  }
};

export const fixtureBeyondEntry7: TraversalFixture = {
  name: 'beyond-entry-7',
  subject: [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
    { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
    { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' }
  ],
  options: {
    ...baseOptions,
    maxSearchTimeMs: 90000,
    targetChainLength: 8,
    thirdSixthMode: 'None',
    inversionMode: 'None',
    truncationMode: 'None',
    maxPairwiseDissonance: 0.5
  }
};

export const fixtureStressNearLimits: TraversalFixture = {
  name: 'stress-near-limits',
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
    ...baseOptions,
    maxSearchTimeMs: 90000,
    ensembleTotal: 5,
    targetChainLength: 9,
    thirdSixthMode: 'Unlimited',
    inversionMode: 'None',
    truncationMode: 'None',
    maxPairwiseDissonance: 0.9
  }
};

export const traversalFixtures: TraversalFixture[] = [
  fixtureEntry7Regime,
  fixtureBeyondEntry7,
  fixtureStressNearLimits
];

export const tradTranspositions = new Set([0, 12, -12, 24, -24, 7, -5, 19, -17, 31, -29, 5, -7, 17, -19, 29, -31]);

export const thirdSixthTranspositions = new Set([3, 4, 8, 9, -3, -4, -8, -9, 15, 16, 20, 21, -15, -16, -20, -21]);

export const structureSignature = (entries: Array<{ startBeat: number; transposition: number; type: string; voiceIndex: number }>): string => entries
  .map((e) => `${Math.round(e.startBeat * ppq)}:${e.transposition}:${e.type}:${e.voiceIndex}`)
  .join('|');

export const normalizeChainSignatureSet = (report: Awaited<ReturnType<typeof searchStrettoChains>>): Set<string> => {
  const signatures = new Set<string>();
  for (const result of report.results) {
    const chainSig = result.entries
      .map((entry) => `${Math.round(entry.startBeat * ppq)}:${((entry.transposition % 12) + 12) % 12}:${entry.type}:${entry.voiceIndex}`)
      .join('|');
    signatures.add(chainSig);
  }
  return signatures;
};
