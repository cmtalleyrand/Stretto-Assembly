import { RawNote } from '../../../types';
import { extractKeyFromAbc } from '../abcBridge';
import { predictKey } from '../analysis/keyPrediction';

export function deriveInitialPivotSettings(subjectNotes: RawNote[], mode: 'midi' | 'abc', abcInput: string): { pivotMidi: number; scaleRoot: number; scaleMode: string } | null {
    if (!subjectNotes || subjectNotes.length === 0) return null;

    let derivedRoot = 0;
    let derivedMode = 'Major';

    if (mode === 'abc') {
        const abcKey = extractKeyFromAbc(abcInput);
        if (abcKey) {
            derivedRoot = abcKey.root;
            derivedMode = abcKey.mode;
        } else {
            const prediction = predictFromNotes(subjectNotes);
            if (prediction) {
                derivedRoot = prediction.root;
                derivedMode = prediction.mode;
            }
        }
    } else {
        const prediction = predictFromNotes(subjectNotes);
        if (prediction) {
            derivedRoot = prediction.root;
            derivedMode = prediction.mode;
        }
    }

    const sumMidi = subjectNotes.reduce((sum, n) => sum + n.midi, 0);
    const avgMidi = sumMidi / subjectNotes.length;
    const baseOctave = Math.floor(avgMidi / 12);
    const candidates = [
        derivedRoot + (baseOctave - 1) * 12,
        derivedRoot + baseOctave * 12,
        derivedRoot + (baseOctave + 1) * 12,
    ];

    let closest = candidates[0];
    let minDiff = Math.abs(candidates[0] - avgMidi);
    for (let i = 1; i < candidates.length; i++) {
        const diff = Math.abs(candidates[i] - avgMidi);
        if (diff < minDiff) {
            minDiff = diff;
            closest = candidates[i];
        }
    }

    const pivotMidi = Math.max(0, Math.min(127, closest));
    return { pivotMidi, scaleRoot: derivedRoot, scaleMode: derivedMode };
}

function predictFromNotes(notes: RawNote[]): { root: number; mode: string } | null {
    const histogram: Record<number, number> = {};
    for (let i = 0; i < 12; i++) histogram[i] = 0;
    notes.forEach((n) => {
        histogram[n.midi % 12] = (histogram[n.midi % 12] ?? 0) + 1;
    });
    const prediction = predictKey(histogram, notes.length);
    if (prediction.length === 0) return null;
    return prediction[0].winner;
}
