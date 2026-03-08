import { RawNote, StrettoSearchOptions } from '../../types';
import { searchStrettoChains } from './strettoGenerator';

export async function runStrettoTests() {
    console.log("=== STARTING STRETTO ALGORITHM TESTS ===");

    const defaultOptions: StrettoSearchOptions = {
        ensembleTotal: 4,
        subjectVoiceIndex: 0,
        targetChainLength: 3,
        inversionMode: 'None',
        truncationMode: 'None',
        truncationTargetBeats: 4,
        thirdSixthMode: 'None',
        maxPairwiseDissonance: 0.3,
        requireConsonantEnd: false,
        disallowComplexExceptions: true,
        scaleRoot: 0,
        scaleMode: 'Major',
        pivotMidi: 60,
        useChromaticInversion: false
    };

    // Test 1: Simple Arpeggiated 1-Measure Subject (Chain of 3)
    console.log("\n--- TEST 1: Simple Arpeggio (Chain of 3) ---");
    const mkNote = (midi: number, ticks: number, durationTicks: number): RawNote => ({
        midi, ticks, durationTicks, velocity: 0.8, name: `m${midi}`
    });

    const test1Notes: RawNote[] = [
        mkNote(60, 0, 480),
        mkNote(64, 480, 480),
        mkNote(67, 960, 480),
        mkNote(72, 1440, 480)
    ];
    const test1Options = { ...defaultOptions, targetChainLength: 3 };
    const test1Result = await searchStrettoChains(test1Notes, test1Options, 480);
    console.log(`Test 1 Finished. Found ${test1Result.results.length} chains. Stop Reason: ${test1Result.stats.stopReason}`);

    // Test 2: Complex 16-note 4-measure subject in 6/8 with accidentals (Chain of 8)
    console.log("\n--- TEST 2: Complex 6/8 Subject (Chain of 8) ---");
    const test2Notes: RawNote[] = [];
    // 4 measures of 6/8 = 24 eighth notes. Let's make 16 notes.
    // 1 eighth note = 240 ticks (if ppq is 480, quarter is 480, eighth is 240)
    const pitches = [60, 62, 63, 65, 67, 68, 70, 72, 71, 69, 67, 66, 65, 63, 62, 60];
    let currentTick = 0;
    for (let i = 0; i < 16; i++) {
        const dur = (i % 3 === 0) ? 480 : 240; // Mix of quarters and eighths
        test2Notes.push(mkNote(pitches[i], currentTick, dur));
        currentTick += dur;
    }
    const test2Options = { ...defaultOptions, targetChainLength: 8, ensembleTotal: 8, subjectVoiceIndex: 0 };
    const test2Result = await searchStrettoChains(test2Notes, test2Options, 480);
    console.log(`Test 2 Finished. Found ${test2Result.results.length} chains. Stop Reason: ${test2Result.stats.stopReason}`);

    // Test 3: Something in between (Chain of 5)
    console.log("\n--- TEST 3: Medium Subject (Chain of 5) ---");
    const test3Notes: RawNote[] = [
        mkNote(62, 0, 480),
        mkNote(65, 480, 240),
        mkNote(67, 720, 240),
        mkNote(69, 960, 960),
        mkNote(65, 1920, 480),
        mkNote(62, 2400, 480)
    ];
    const test3Options = { ...defaultOptions, targetChainLength: 5, ensembleTotal: 5 };
    const test3Result = await searchStrettoChains(test3Notes, test3Options, 480);
    console.log(`Test 3 Finished. Found ${test3Result.results.length} chains. Stop Reason: ${test3Result.stats.stopReason}`);

    console.log("\n=== TESTS COMPLETE ===");
}
