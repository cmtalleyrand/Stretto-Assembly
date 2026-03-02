

import { Midi } from '@tonejs/midi';
import { TrackAnalysisData, NoteValueStat, ConversionOptions, RawNote } from './types';
import { detectAndTagOrnaments, NOTE_NAMES } from './components/services/midiCore';
import { distributeToVoices } from './components/services/midiVoices';
import { detectChordsSustain, detectChordsAttack, detectChordsBucketed } from './components/services/midiHarmony';
import { copyAndTransformTrackEvents } from './components/services/midiPipeline';
import { calculateTransformationStats } from './components/services/analysis/transformationAnalysis';

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

function analyzeVoiceLeading(notes: RawNote[]): Record<number, number> {
    const stats: Record<number, number> = {};
    const voices: Record<number, RawNote[]> = {};
    notes.forEach(n => { const v = n.voiceIndex ?? 0; if (!voices[v]) voices[v] = []; voices[v].push(n); });
    Object.values(voices).forEach(vNotes => {
        vNotes.sort((a,b) => a.ticks - b.ticks);
        for(let i=0; i < vNotes.length - 1; i++) {
            const diff = vNotes[i+1].midi - vNotes[i].midi;
            stats[diff] = (stats[diff] || 0) + 1;
        }
    });
    return stats;
}

export function generateAnalysisReport(data: TrackAnalysisData): string {
    const { trackName, chordsSustain, chordsAttack, chordsHybrid, chordsBucketed, topNoteValues, detectedGridType, bestKeyPrediction, voiceIntervals, transformationStats } = data;
    let r = `HARMONIC ANALYSIS REPORT\nGenerated on: ${new Date().toLocaleDateString()}\nTrack: ${trackName}\n--------------------------------------------------\n\n`;
    
    if (transformationStats) {
        const t = transformationStats;
        r += `0. PROCESSING IMPACT SUMMARY (Based on current settings)\n`;
        r += `   Input Notes: ${t.totalNotesInput} -> Output Notes: ${t.totalNotesOutput}\n`;
        r += `   - Quantization: ${t.notesQuantized} notes shifted (Avg Error: ${Math.round(t.avgShiftTicks)} ticks)\n`;
        r += `   - Duration Filtering: ${t.notesRemovedDuration} notes removed (too short)\n`;
        r += `   - Overlap Pruning: ${t.notesRemovedOverlap} notes removed, ${t.notesTruncatedOverlap} shortened\n\n`;
    }

    r += `1. RHYTHMIC ANALYSIS\nDetected Grid: ${detectedGridType}\nNote Breakdown:\n`;
    topNoteValues.forEach((s, i) => { r += `  ${i+1}. ${s.name} (${Math.round(s.percentage)}%) - ${s.count} notes\n`; });
    
    r += `\n2. KEY & HARMONY\nPredicted Key: ${bestKeyPrediction ? `${NOTE_NAMES[bestKeyPrediction.root]} ${bestKeyPrediction.mode} (${Math.round(bestKeyPrediction.score * 100)}%)` : 'Undetermined'}\n\n`;
    
    const print = (title: string, list: any[]) => {
        let out = `3. ${title}\n`;
        if (!list || list.length === 0) out += `No chords detected.\n`;
        else list.forEach(c => out += `${c.formattedTime.padEnd(20)}: ${c.name.padEnd(20)} [${c.constituentNotes.join(', ')}]${c.missingNotes.length ? ` (Missing: ${c.missingNotes.join(', ')})` : ''}\n`);
        return out;
    };
    
    r += print("CHORD PROGRESSION (Sustain)", chordsSustain);
    r += `\n` + print("CHORD PROGRESSION (Attacks)", chordsAttack);
    if (chordsHybrid?.length) r += `\n` + print("CHORD PROGRESSION (Hybrid / Arpeggio)", chordsHybrid);
    if (chordsBucketed?.length) r += `\n` + print("CHORD PROGRESSION (Harmonic Rhythm Normalized)", chordsBucketed);
    
    r += `\n4. VOICE LEADING\n`;
    Object.keys(voiceIntervals).map(Number).sort((a,b) => a-b).forEach(i => r += `  ${(i === 0 ? "Unison" : i > 0 ? `+${i}` : `${i}`).padEnd(8)}: ${voiceIntervals[i]}\n`);
    return r;
}

/**
 * Shared core logic for analysis after notes have been prepared and voices assigned.
 */
function analyzePreparedNotes(notes: any[], trackName: string, ppq: number, ts: number[], bpm: number, voiceCount: number, transformStats?: any): TrackAnalysisData {
    const notesRaw: RawNote[] = notes.map(n => ({ 
        midi: n.midi, 
        ticks: n.ticks, 
        durationTicks: n.durationTicks, 
        velocity: n.velocity, 
        name: n.name, 
        time: n.time, 
        duration: n.duration, 
        voiceIndex: (n as any).voiceIndex ?? 0, 
        isOrnament: (n as any).isOrnament 
    }));

    if (notes.length === 0) return { trackName, topNoteValues: [], gridAlignmentScore: 0, durationConsistencyScore: 0, averageOffsetTicks: 0, totalNotes: 0, detectedGridType: "None", pitchClassHistogram: {}, chordsSustain: [], chordsAttack: [], notesRaw: [], ppq, timeSignature: { numerator: ts[0], denominator: ts[1] }, tempo: bpm, voiceCount, voiceIntervals: {} };

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
    
    let gridTicks = ts[1] === 8 ? ppq / 2 : ppq / 4, gridLabel = ts[1] === 8 ? "1/8 Compound" : "1/16 Standard";
    if (durStats.length > 0) {
        const top = durStats[0];
        if (top.name.includes('Triplet')) { gridTicks = top.standardMultiplier < 0.2 ? ppq/6 : ppq/3; gridLabel = top.standardMultiplier < 0.2 ? "1/16 Triplet" : "1/8 Triplet"; }
        else if (top.name.includes('Quintuplet')) { gridTicks = ppq/5; gridLabel = "1/16 Quintuplet"; }
    }
    
    let totalAlign = 0, totalOff = 0;
    notes.forEach(n => { const off = n.ticks % gridTicks; const dist = Math.min(off, gridTicks - off); totalOff += dist; totalAlign += (1 - dist / (gridTicks / 2)); });
    
    const histogram: Record<number, number> = {};
    for (let i = 0; i < 12; i++) histogram[i] = 0;
    notes.forEach(n => histogram[n.midi % 12]++);

    const chordsBucketed = detectChordsBucketed(notesRaw, ppq, ts[0], ts[1], 1);

    return {
        trackName, 
        topNoteValues: durStats, 
        gridAlignmentScore: totalAlign / notes.length, 
        durationConsistencyScore: totalDurConsist / notes.length, 
        averageOffsetTicks: totalOff / notes.length, 
        totalNotes: notes.length, 
        detectedGridType: gridLabel, 
        pitchClassHistogram: histogram, 
        chordsSustain: detectChordsSustain(notesRaw, ppq, ts[0], ts[1]), 
        chordsAttack: detectChordsAttack(notesRaw, ppq, ts[0], ts[1]), 
        chordsBucketed,
        transformationStats: transformStats,
        notesRaw, 
        ppq, 
        timeSignature: { numerator: ts[0], denominator: ts[1] }, 
        tempo: bpm, 
        voiceCount, 
        voiceIntervals: analyzeVoiceLeading(notesRaw)
    };
}

export function analyzeTrack(midi: Midi, trackId: number, options?: ConversionOptions): TrackAnalysisData {
    const track = midi.tracks[trackId];
    const ppq = midi.header.ppq || 480;
    let notes: any[] = track.notes.map(n => ({...n} as any));
    const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
    
    if (options?.detectOrnaments) notes = detectAndTagOrnaments(notes, ppq);
    
    const transformStats = options ? calculateTransformationStats(track, options, ppq) : undefined;
    const voices = distributeToVoices(notes, options) as any[][];
    
    // Assign voice index
    const noteVoiceMap = new Map<any, number>();
    voices.forEach((vNotes, vIdx) => vNotes.forEach(n => noteVoiceMap.set(n, vIdx)));
    notes.forEach(n => n.voiceIndex = noteVoiceMap.get(n));
    
    return analyzePreparedNotes(
        notes, 
        track.name, 
        ppq, 
        ts, 
        midi.header.tempos[0]?.bpm || 120, 
        voices.length, 
        transformStats
    );
}

export function analyzeTrackSelection(midi: Midi, trackIds: number[], options?: ConversionOptions): TrackAnalysisData {
    const ppq = midi.header.ppq || 480;
    const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
    const bpm = midi.header.tempos[0]?.bpm || 120;
    
    // Create a virtual combined track
    const newMidi = midi.clone();
    newMidi.tracks = [];
    newMidi.header.setTempo(options?.tempo || bpm);
    newMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [ts[0], ts[1]] }];

    let aggregatedNotes: any[] = [];
    
    trackIds.forEach((id, voiceIndex) => {
        const originalTrack = midi.tracks[id];
        if (!originalTrack) return;
        
        // Use a temporary track to apply transformations (quantization, etc.)
        const tempTrack = newMidi.addTrack(); 
        if (options) {
             copyAndTransformTrackEvents(originalTrack, tempTrack, options, new Set(), midi.header);
        } else {
             // Basic copy if no options
             originalTrack.notes.forEach(n => tempTrack.addNote(n));
        }

        // Assign voice index strictly based on track selection order
        // This fulfills "each one treated as a separate voice"
        tempTrack.notes.forEach(n => {
            (n as any).voiceIndex = voiceIndex;
            aggregatedNotes.push(n);
        });
    });
    
    // We do not run distributeToVoices on the aggregate because we manually assigned voices.
    // However, we still need to tag ornaments if requested, though usually copyAndTransform handles that.
    
    const combinedName = `Selection (${trackIds.length} tracks)`;
    
    return analyzePreparedNotes(
        aggregatedNotes,
        combinedName,
        ppq,
        ts,
        bpm,
        trackIds.length,
        undefined // Stats are complex to aggregate, skipping for multi-track analysis
    );
}
