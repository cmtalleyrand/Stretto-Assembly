import {
    checkCounterpointStructureWithBassRole,
    isPerfectBehaviorSensitiveIntervalClass,
    shouldReuseCanonicalPairwiseScan
} from './strettoGenerator';
import type { SubjectVariant } from './strettoScoring';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const maxPairwiseDissonance = 1;
const delays = [240, 480, 720, 960, 1200];
const canonicalTranspositions = [-12, -9, -7, -5, -3, 0, 3, 5, 7, 9, 12];

const consonantFixture: SubjectVariant = {
    type: 'N',
    truncationBeats: 0,
    lengthTicks: 8 * 480,
    notes: [
        { relTick: 0, durationTicks: 480, pitch: 60 },
        { relTick: 480, durationTicks: 480, pitch: 62 },
        { relTick: 960, durationTicks: 480, pitch: 64 },
        { relTick: 1440, durationTicks: 480, pitch: 65 },
        { relTick: 1920, durationTicks: 480, pitch: 67 },
        { relTick: 2400, durationTicks: 480, pitch: 69 },
        { relTick: 2880, durationTicks: 480, pitch: 71 },
        { relTick: 3360, durationTicks: 480, pitch: 72 }
    ]
};

const perfectSensitiveFixture: SubjectVariant = {
    type: 'N',
    truncationBeats: 0,
    lengthTicks: 8 * 480,
    notes: [
        { relTick: 0, durationTicks: 480, pitch: 60 },
        { relTick: 480, durationTicks: 480, pitch: 67 },
        { relTick: 960, durationTicks: 480, pitch: 62 },
        { relTick: 1440, durationTicks: 480, pitch: 69 },
        { relTick: 1920, durationTicks: 480, pitch: 64 },
        { relTick: 2400, durationTicks: 480, pitch: 71 },
        { relTick: 2880, durationTicks: 480, pitch: 65 },
        { relTick: 3360, durationTicks: 480, pitch: 72 }
    ]
};

function assertOctaveParityWhenNoPerfectBehavior(subject: SubjectVariant): void {
    let evaluated = 0;
    for (const delay of delays) {
        for (const t of canonicalTranspositions) {
            const octaveT = t + 12;
            const intervalClass = ((t % 12) + 12) % 12;
            if (isPerfectBehaviorSensitiveIntervalClass(intervalClass)) continue;
            const neutral = checkCounterpointStructureWithBassRole(subject, subject, delay, t, maxPairwiseDissonance, 'none');
            if (neutral.hasFourth || neutral.hasParallelPerfect58) continue;

            const neutralOctave = checkCounterpointStructureWithBassRole(subject, subject, delay, octaveT, maxPairwiseDissonance, 'none');

            assert(neutral.compatible === neutralOctave.compatible, `neutral compatibility mismatch at d=${delay}, t=${t}`);
            assert(neutral.maxDissonanceRunEvents === neutralOctave.maxDissonanceRunEvents, `neutral run mismatch at d=${delay}, t=${t}`);
            assert(Math.abs(neutral.dissonanceRatio - neutralOctave.dissonanceRatio) < 1e-9, `neutral ratio mismatch at d=${delay}, t=${t}`);
            evaluated++;
        }
    }
    assert(evaluated > 0, 'No non-perfect octave-parity cases were evaluated.');
}

function assertPerfectGuardPolicy(subject: SubjectVariant): void {
    let guardCases = 0;
    for (const delay of delays) {
        for (const t of canonicalTranspositions) {
            const neutral = checkCounterpointStructureWithBassRole(subject, subject, delay, t, maxPairwiseDissonance, 'none');
            const intervalClass = ((t % 12) + 12) % 12;
            if (!isPerfectBehaviorSensitiveIntervalClass(intervalClass)) continue;
            if (!neutral.hasFourth && !neutral.hasParallelPerfect58) continue;

            assert(
                shouldReuseCanonicalPairwiseScan(intervalClass, {
                    hasFourth: neutral.hasFourth,
                    hasParallelPerfect58: neutral.hasParallelPerfect58
                }) === false,
                `Guard must block canonical reuse for sensitive class=${intervalClass}, d=${delay}, t=${t}`
            );
            assert(
                shouldReuseCanonicalPairwiseScan(3, {
                    hasFourth: neutral.hasFourth,
                    hasParallelPerfect58: neutral.hasParallelPerfect58
                }) === true,
                `Non-sensitive class should still allow canonical reuse at d=${delay}, t=${t}`
            );
            guardCases++;
        }
    }
    assert(guardCases > 0, 'No perfect-sensitive guard cases were observed in the fixture.');
}

assertOctaveParityWhenNoPerfectBehavior(consonantFixture);
assertPerfectGuardPolicy(perfectSensitiveFixture);

console.log('Pairwise logic check passed for octave-equivalence parity and perfect-interval guard behavior.');
