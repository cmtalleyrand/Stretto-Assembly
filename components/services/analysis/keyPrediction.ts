
import { TrackAnalysisData } from '../../../types';
import { NOTE_NAMES } from '../midiCore';

const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const STANDARD_MODES = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Locrian': [0, 1, 3, 5, 6, 8, 10],
};

const EXOTIC_MODES = {
    'Lydian Dominant': [0, 2, 4, 6, 7, 9, 10], // Lydian b7
    'Phrygian Dominant': [0, 1, 4, 5, 7, 8, 10], // Phrygian #3
    'Major Pentatonic': [0, 2, 4, 7, 9],
    'Minor Pentatonic': [0, 3, 5, 7, 10],
    'Blues': [0, 3, 5, 6, 7, 10],
    'Whole Tone': [0, 2, 4, 6, 8, 10],
    'Octatonic (W-H)': [0, 2, 3, 5, 6, 8, 9, 11],
    'Octatonic (H-W)': [0, 1, 3, 4, 6, 7, 9, 10],
    'Harmonic Major': [0, 2, 4, 5, 7, 8, 11],
    'Double Harmonic': [0, 1, 4, 5, 7, 8, 11],
    'Hungarian Minor': [0, 2, 3, 6, 7, 8, 11],
    'Neapolitan Minor': [0, 1, 3, 5, 7, 8, 11],
    'Enigmatic': [0, 1, 4, 6, 8, 10, 11]
};

export interface KeyPredictionResult {
    winner: {
        root: number;
        mode: string;
        score: number;
        diatonic: number;
        triad: number;
        tonic: number;
    };
    relatives: string[];
}

const getTriadIntervals = (modeIntervals: number[]) => {
    let third = -1;
    if (modeIntervals.includes(4)) third = 4;
    else if (modeIntervals.includes(3)) third = 3;

    let fifth = -1;
    if (modeIntervals.includes(7)) fifth = 7;
    else if (modeIntervals.includes(6)) fifth = 6;
    else if (modeIntervals.includes(8)) fifth = 8;

    const triad = [0]; 
    if (third !== -1) triad.push(third);
    if (fifth !== -1) triad.push(fifth);
    
    return triad;
};

export function predictKey(histogram: Record<number, number>, totalNotes: number, includeExotic: boolean = false): KeyPredictionResult[] {
    if (totalNotes === 0) return [];
    
    const activeModes = includeExotic ? { ...STANDARD_MODES, ...EXOTIC_MODES } : STANDARD_MODES;
    
    interface RawPrediction {
        root: number;
        mode: string;
        score: number;
        diatonic: number;
        triad: number;
        tonic: number;
        pcSetKey: string;
    }
    
    const allPredictions: RawPrediction[] = [];
    const modesList = Object.keys(activeModes);

    for (let r = 0; r < 12; r++) {
        for (const m of modesList) {
            const intervals = activeModes[m as keyof typeof activeModes];
            const scalePCsArray = intervals.map(i => (r + i) % 12).sort((a,b) => a-b);
            const pcSetKey = scalePCsArray.join(',');
            
            const scalePCs = new Set(scalePCsArray);
            const triadIntervals = getTriadIntervals(intervals);
            const triadPCs = new Set(triadIntervals.map(i => (r + i) % 12));
            const tonicPC = r;

            let diatonicCount = 0;
            let triadCount = 0;
            let tonicCount = 0;

            for(let i=0; i<12; i++) {
                const count = histogram[i] || 0;
                if(scalePCs.has(i)) diatonicCount += count;
                if(triadPCs.has(i)) triadCount += count;
                if(i === tonicPC) tonicCount += count;
            }
            
            const diatonic = diatonicCount / totalNotes;
            const triad = triadCount / totalNotes;
            const tonic = tonicCount / totalNotes;

            const score = (diatonic * 0.5) + (triad * 0.3) + (tonic * 0.2);

            allPredictions.push({ root: r, mode: m, score, diatonic, triad, tonic, pcSetKey });
        }
    }

    // Group by PC Set (Relative Modes)
    const groups: Record<string, RawPrediction[]> = {};
    allPredictions.forEach(p => {
        if (!groups[p.pcSetKey]) groups[p.pcSetKey] = [];
        groups[p.pcSetKey].push(p);
    });

    const groupResults = Object.values(groups).map(groupPreds => {
        groupPreds.sort((a,b) => b.score - a.score);
        const winner = groupPreds[0];
        const relatives = groupPreds.slice(1).map(p => `${KEYS[p.root]} ${p.mode}`);
        return { winner, relatives };
    });

    groupResults.sort((a,b) => b.winner.score - a.winner.score);
    return groupResults;
}
