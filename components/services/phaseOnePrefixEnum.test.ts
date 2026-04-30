// Validate Phase 1 enumerator against searchStrettoChains'
// structurallyCompleteChainsFound count at small H.

import { searchStrettoChains } from './strettoGenerator';
import { runPhaseOne } from './phaseOnePrefixEnum';
import type { RawNote, StrettoSearchOptions } from '../../types';

const ppq = 480;
const baseSubject: RawNote[] = [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' }
];
const baseOptions: StrettoSearchOptions = {
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
const tradTranspositions = [-31, -29, -19, -17, -7, -5, 0, 5, 7, 17, 19, 29, 31, -24, -12, 12, 24];

console.log('H  ExistingStructComplete  PhaseOneCount  delta  PhaseOneMs  ExistingMs');
for (const H of [3, 4, 5, 6]) {
    const oldR = await searchStrettoChains(baseSubject, { ...baseOptions, targetChainLength: H, maxSearchTimeMs: 60_000 }, ppq);
    const oldCount = oldR.stats.completionDiagnostics?.structurallyCompleteChainsFound ?? 0;
    const oldMs = oldR.stats.timeMs;

    const newR = await runPhaseOne({
        rawSubject: baseSubject, options: baseOptions, ppq, transpositionPool: tradTranspositions, H,
        maxPrefixes: 5_000_000
    });
    const delta = newR.count - oldCount;
    console.log(
        `${H}  ${String(oldCount).padStart(22)}  ${String(newR.count).padStart(13)}  ${String(delta).padStart(5)}  ${String(newR.timeMs).padStart(10)}  ${String(oldMs).padStart(10)}`
    );
}
