import { RawNote, StrettoSearchOptions } from '../../types';
import { searchStrettoChains, StrettoSearchProgressUpdate } from './strettoGenerator';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const SUBJECT: RawNote[] = [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4', voiceIndex: 0 },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4', voiceIndex: 0 },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4', voiceIndex: 0 },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4', voiceIndex: 0 },
    { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4', voiceIndex: 0 }
];

const OPTIONS: StrettoSearchOptions = {
    ensembleTotal: 4,
    targetChainLength: 4,
    subjectVoiceIndex: 2,
    truncationMode: 'None',
    truncationTargetBeats: 2,
    inversionMode: 1,
    useChromaticInversion: false,
    thirdSixthMode: 1,
    pivotMidi: 60,
    requireConsonantEnd: true,
    disallowComplexExceptions: false,
    maxPairwiseDissonance: 1.0,
    scaleRoot: 0,
    scaleMode: 'Major',
    maxSearchTimeMs: 2000
};

const progressEvents: StrettoSearchProgressUpdate[] = [];

await searchStrettoChains(SUBJECT, OPTIONS, 480, (progress) => {
    progressEvents.push(progress);
});

assert(progressEvents.length > 0, 'Expected at least one progress callback invocation.');
const stageSet = new Set(progressEvents.map((event) => event.stage));
assert(stageSet.has('pairwise'), 'Expected pairwise stage progress.');
assert(stageSet.has('triplet'), 'Expected triplet stage progress.');
assert(stageSet.has('dag'), 'Expected DAG stage progress.');

for (const event of progressEvents) {
    assert(event.totalUnits >= 1, `Stage ${event.stage} reported invalid totalUnits=${event.totalUnits}.`);
    assert(event.completedUnits >= 0, `Stage ${event.stage} reported invalid completedUnits=${event.completedUnits}.`);
    assert(event.completedUnits <= event.totalUnits, `Stage ${event.stage} exceeded totalUnits.`);
}

console.log(`Stretto progress callback test passed (${progressEvents.length} events).`);
