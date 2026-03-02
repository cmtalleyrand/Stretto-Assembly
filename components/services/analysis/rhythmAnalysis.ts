
import { NoteValueStat } from '../../../types';

const STANDARD_DURATION_MULTIPLIERS = [
    { name: 'Whole Note', value: 4.0 }, { name: 'Dotted Half', value: 3.0 },
    { name: 'Half Note', value: 2.0 }, { name: 'Dotted Quarter', value: 1.5 },
    { name: 'Half Triplet', value: 1.3333 }, { name: 'Quarter Note', value: 1.0 },
    { name: 'Quarter Quintuplet', value: 0.8 }, { name: 'Dotted Eighth', value: 0.75 },
    { name: 'Quarter Triplet', value: 0.6666 }, { name: 'Eighth Note', value: 0.5 },
    { name: 'Eighth Quintuplet', value: 0.4 }, { name: 'Dotted 16th', value: 0.375 },
    { name: 'Eighth Triplet', value: 0.3333 }, { name: '16th Note', value: 0.25 },
    { name: '16th Quintuplet', value: 0.2 }, { name: '16th Triplet', value: 0.1666 },
    { name: '32nd Note', value: 0.125 },
];

export interface RhythmAnalysisResult {
    topNoteValues: NoteValueStat[];
    gridAlignmentScore: number;
    durationConsistencyScore: number;
    averageOffsetTicks: number;
    detectedGridType: string;
}

export function analyzeRhythm(notes: any[], ppq: number, ts: number[]): RhythmAnalysisResult {
    if (notes.length === 0) {
        return { topNoteValues: [], gridAlignmentScore: 0, durationConsistencyScore: 0, averageOffsetTicks: 0, detectedGridType: "None" };
    }

    const durCounts: Map<string, NoteValueStat> = new Map();
    let totalDurConsist = 0;

    notes.forEach(note => {
        const ratio = note.durationTicks / ppq;
        let best = STANDARD_DURATION_MULTIPLIERS[0], minD = Math.abs(ratio - best.value);
        for (let i = 1; i < STANDARD_DURATION_MULTIPLIERS.length; i++) {
            const d = Math.abs(ratio - STANDARD_DURATION_MULTIPLIERS[i].value);
            if (d < minD) { minD = d; best = STANDARD_DURATION_MULTIPLIERS[i]; }
        }
        if (!durCounts.has(best.name)) durCounts.set(best.name, { name: best.name, count: 0, percentage: 0, standardMultiplier: best.value });
        durCounts.get(best.name)!.count++;
        totalDurConsist += (1 - Math.min(minD / best.value, 1.0));
    });

    const durStats = Array.from(durCounts.values()).map(s => ({ ...s, percentage: s.count/notes.length*100 })).sort((a, b) => b.count - a.count);
    
    let gridTicks = ts[1] === 8 ? ppq / 2 : ppq / 4;
    let gridLabel = ts[1] === 8 ? "1/8 Compound" : "1/16 Standard";

    if (durStats.length > 0) {
        const top = durStats[0];
        if (top.name.includes('Triplet')) { 
            gridTicks = top.standardMultiplier < 0.2 ? ppq/6 : ppq/3; 
            gridLabel = top.standardMultiplier < 0.2 ? "1/16 Triplet" : "1/8 Triplet"; 
        }
        else if (top.name.includes('Quintuplet')) { 
            gridTicks = ppq/5; 
            gridLabel = "1/16 Quintuplet"; 
        }
    }
    
    let totalAlign = 0, totalOff = 0;
    notes.forEach(n => { 
        const off = n.ticks % gridTicks; 
        const dist = Math.min(off, gridTicks - off); 
        totalOff += dist; 
        totalAlign += (1 - dist / (gridTicks / 2)); 
    });

    return {
        topNoteValues: durStats,
        gridAlignmentScore: totalAlign / notes.length,
        durationConsistencyScore: totalDurConsist / notes.length,
        averageOffsetTicks: totalOff / notes.length,
        detectedGridType: gridLabel
    };
}
