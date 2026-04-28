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
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 0.5,
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
    assert(event.telemetry.maxDepthReached >= 0, `Stage ${event.stage} reported invalid maxDepthReached.`);
    assert(event.telemetry.targetChainLength === OPTIONS.targetChainLength, 'Target chain length telemetry mismatch.');
    assert(event.telemetry.pairwiseOperationsProcessed >= 0, 'pairwiseOperationsProcessed must be non-negative.');
    assert(event.telemetry.tripletOperationsProcessed >= 0, 'tripletOperationsProcessed must be non-negative.');
    assert(event.telemetry.dagNodesExpanded >= 0, 'dagNodesExpanded must be non-negative.');
    assert(event.telemetry.dagEdgesEvaluated >= 0, 'dagEdgesEvaluated must be non-negative.');
    if (event.stage === 'dag' && event.telemetry.dagDepthHistogram) {
        const depths = Object.entries(event.telemetry.dagDepthHistogram);
        for (const [depth, explored] of depths) {
            const avgBranches = event.telemetry.dagAverageBranchesByDepth?.[depth] ?? 0;
            const validRatio = event.telemetry.dagValidChainsRatioByDepth?.[depth] ?? 0;
            assert(Number(explored) >= 0, `DAG depth histogram has negative explored count at depth ${depth}.`);
            assert(Number(avgBranches) >= 0, `Average branches by depth must be non-negative at depth ${depth}.`);
            assert(Number(validRatio) >= 0, `Valid/explored ratio must be non-negative at depth ${depth}.`);
        }
    }
    if (event.stage === 'dag' && event.completedUnits === event.totalUnits) {
        assert(
            event.terminal,
            'DAG should only report 100% when traversal is terminal.'
        );
    }
}

const dagEvents = progressEvents.filter((event) => event.stage === 'dag');
assert(dagEvents.length > 0, 'Expected DAG progress emissions.');
const nonTerminalDagAtHundred = dagEvents.find((event) =>
    event.completedUnits === event.totalUnits && !event.terminal
);
assert(!nonTerminalDagAtHundred, 'Observed non-terminal DAG event reported as 100%.');
const terminalDagEvents = dagEvents.filter((event) => event.terminal);
assert(terminalDagEvents.length >= 1, 'Expected at least one terminal DAG progress emission.');

console.log(`Stretto progress callback test passed (${progressEvents.length} events).`);
