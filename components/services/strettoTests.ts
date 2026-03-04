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
    const test1Notes: RawNote[] = [
        { midi: 60, ticks: 0, durationTicks: 480 },   // C4, 1 beat
        { midi: 64, ticks: 480, durationTicks: 480 }, // E4, 1 beat
        { midi: 67, ticks: 960, durationTicks: 480 }, // G4, 1 beat
        { midi: 72, ticks: 1440, durationTicks: 480 } // C5, 1 beat
    ];
    const test1Options = { ...defaultOptions, targetChainLength: 3 };
    const test1Result = await searchStrettoChains(test1Notes, test1Options, 480, 4, 4);
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
        test2Notes.push({ midi: pitches[i], ticks: currentTick, durationTicks: dur });
        currentTick += dur;
    }
    const test2Options = { ...defaultOptions, targetChainLength: 8, ensembleTotal: 8, subjectVoiceIndex: 0 };
    const test2Result = await searchStrettoChains(test2Notes, test2Options, 480, 6, 8);
    console.log(`Test 2 Finished. Found ${test2Result.results.length} chains. Stop Reason: ${test2Result.stats.stopReason}`);

    // Test 3: Something in between (Chain of 5)
    console.log("\n--- TEST 3: Medium Subject (Chain of 5) ---");
    const test3Notes: RawNote[] = [
        { midi: 62, ticks: 0, durationTicks: 480 },
        { midi: 65, ticks: 480, durationTicks: 240 },
        { midi: 67, ticks: 720, durationTicks: 240 },
        { midi: 69, ticks: 960, durationTicks: 960 },
        { midi: 65, ticks: 1920, durationTicks: 480 },
        { midi: 62, ticks: 2400, durationTicks: 480 }
    ];
    const test3Options = { ...defaultOptions, targetChainLength: 5, ensembleTotal: 5 };
    const test3Result = await searchStrettoChains(test3Notes, test3Options, 480, 4, 4);
    console.log(`Test 3 Finished. Found ${test3Result.results.length} chains. Stop Reason: ${test3Result.stats.stopReason}`);

    console.log("\n=== TESTS COMPLETE ===");
}
