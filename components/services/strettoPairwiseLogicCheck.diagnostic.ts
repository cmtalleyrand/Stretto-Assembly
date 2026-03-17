import { checkCounterpointStructureWithBassRole } from './strettoGenerator';
import type { SubjectVariant } from './strettoScoring';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const baseVariant: SubjectVariant = {
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

const delays = [240, 480, 720, 960, 1200];
const transpositions = [-12, -9, -7, -5, -3, 0, 3, 5, 7, 9, 12];
const maxPairwiseDissonance = 1;

let evaluated = 0;
let noFourthCases = 0;

for (const delay of delays) {
    for (const transposition of transpositions) {
        const neutral = checkCounterpointStructureWithBassRole(baseVariant, baseVariant, delay, transposition, maxPairwiseDissonance, 'none');
        const bassA = checkCounterpointStructureWithBassRole(baseVariant, baseVariant, delay, transposition, maxPairwiseDissonance, 'a');
        const bassB = checkCounterpointStructureWithBassRole(baseVariant, baseVariant, delay, transposition, maxPairwiseDissonance, 'b');
        evaluated++;

        if (!neutral.hasFourth) {
            noFourthCases++;
            assert(neutral.compatible === bassA.compatible, `compatibility mismatch (a) at d=${delay}, t=${transposition}`);
            assert(neutral.compatible === bassB.compatible, `compatibility mismatch (b) at d=${delay}, t=${transposition}`);
            assert(neutral.maxDissonanceRunEvents === bassA.maxDissonanceRunEvents, `run mismatch (a) at d=${delay}, t=${transposition}`);
            assert(neutral.maxDissonanceRunEvents === bassB.maxDissonanceRunEvents, `run mismatch (b) at d=${delay}, t=${transposition}`);
            assert(Math.abs(neutral.dissonanceRatio - bassA.dissonanceRatio) < 1e-9, `ratio mismatch (a) at d=${delay}, t=${transposition}`);
            assert(Math.abs(neutral.dissonanceRatio - bassB.dissonanceRatio) < 1e-9, `ratio mismatch (b) at d=${delay}, t=${transposition}`);
        }
    }
}

console.log(`Pairwise logic check passed. Evaluated ${evaluated} configurations; no-P4 configurations=${noFourthCases}.`);
