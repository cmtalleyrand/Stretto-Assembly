import { Midi } from '@tonejs/midi';
import { TrackAnalysisData, NoteValueStat, ConversionOptions, RawNote, PitchAnalysisMode, PitchStats } from '../../types';
import { detectAndTagOrnaments, NOTE_NAMES } from './midiCore';
import { distributeToVoices } from './midiVoices';
import { detectChordsSustain, detectChordsAttack } from './midiHarmony';
import { copyAndTransformTrackEvents } from './midiPipeline';
import { calculateTransformationStats } from './analysis/transformationAnalysis';
import { predictKey } from './analysis/keyPrediction';
import { analyzeRhythm } from './analysis/rhythmAnalysis';
import { getTransformedNotes } from './midiTransform';
import { getStrictPitchName, getIntervalLabel } from './midiSpelling';

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

function analyzeVoiceLeadingPerVoice(notes: RawNote[]): Record<number, Record<number, number>> {
    const statsByVoice: Record<number, Record<number, number>> = {};
    const voices: Record<number, RawNote[]> = {};
    notes.forEach(n => { const v = n.voiceIndex ?? 0; if (!voices[v]) voices[v] = []; voices[v].push(n); });
    
    Object.keys(voices).forEach(vKey => {
        const v = parseInt(vKey);
        statsByVoice[v] = {};
        const vNotes = voices[v].sort((a,b) => a.ticks - b.ticks);
        for(let i=0; i < vNotes.length - 1; i++) {
            const diff = vNotes[i+1].midi - vNotes[i].midi;
            statsByVoice[v][diff] = (statsByVoice[v][diff] || 0) + 1;
        }
    });
    return statsByVoice;
}

function calculatePitchStats(notes: RawNote[]): Record<number, PitchStats> {
    const stats: Record<number, PitchStats> = {};
    for (let i=0; i<12; i++) stats[i] = { count: 0, durationTicks: 0 };
    
    notes.forEach(n => {
        const pc = n.midi % 12;
        stats[pc].count++;
        stats[pc].durationTicks += n.durationTicks;
    });
    return stats;
}

function calculatePitchStatsByVoice(notes: RawNote[], voiceCount: number): Record<number, Record<number, PitchStats>> {
    const stats: Record<number, Record<number, PitchStats>> = {};
    for (let v=0; v<voiceCount; v++) {
        stats[v] = {};
        for (let i=0; i<12; i++) stats[v][i] = { count: 0, durationTicks: 0 };
    }
    
    notes.forEach(n => {
        const v = n.voiceIndex ?? 0;
        const pc = n.midi % 12;
        if (stats[v]) {
            stats[v][pc].count++;
            stats[v][pc].durationTicks += n.durationTicks;
        }
    });
    return stats;
}

export function generateAnalysisReport(data: TrackAnalysisData, mode: PitchAnalysisMode = 'modal'): string {
    const { trackName, voiceCount, notesRaw, bestKeyPrediction, transformationStats } = data;
    
    let r = `HARMONIC ANALYSIS REPORT\nGenerated on: ${new Date().toLocaleDateString()}\nTrack: ${trackName}\n--------------------------------------------------\n\n`;

    if (transformationStats) {
        const t = transformationStats;
        r += `### PROCESSING IMPACT\n`;
        r += `* Input Notes: ${t.totalNotesInput} -> Output Notes: ${t.totalNotesOutput}\n`;
        r += `* Quantization: ${t.notesQuantized} shifted (Avg: ${Math.round(t.avgShiftTicks)} ticks)\n`;
        r += `* Filtering: ${t.notesRemovedDuration} removed (duration), ${t.notesRemovedOverlap} removed (overlap)\n\n`;
    }

    if (bestKeyPrediction) {
        r += `### KEY PREDICTION\n`;
        r += `* Predicted: ${NOTE_NAMES[bestKeyPrediction.root]} ${bestKeyPrediction.mode} (Score: ${Math.round(bestKeyPrediction.score * 100)}%)\n\n`;
    }

    // --- PER VOICE DETAILED TABLES ---
    r += `### VOICE ANALYSIS (Detailed)\n`;

    for (let v = 0; v < voiceCount; v++) {
        const vNotes = notesRaw.filter(n => n.voiceIndex === v);
        const count = vNotes.length;
        
        // Skip voice if not present
        if (count === 0) continue;

        r += `\n#### Voice ${v + 1} (${count} notes)\n`;

        // 1. Pitch Frequency Table (Aggregated by Pitch Class)
        const pitchClassStats: Record<string, {count: number, ticks: number}> = {};
        let totalTicks = 0;
        
        vNotes.forEach(n => {
             const pcName = NOTE_NAMES[n.midi % 12];
             if (!pitchClassStats[pcName]) pitchClassStats[pcName] = { count: 0, ticks: 0 };
             pitchClassStats[pcName].count++;
             pitchClassStats[pcName].ticks += n.durationTicks;
             totalTicks += n.durationTicks;
        });
        
        const sortedPitches = Object.keys(pitchClassStats).sort((a,b) => {
            return pitchClassStats[b].ticks - pitchClassStats[a].ticks; 
        });

        r += `**Pitch Class Frequency**\n`;
        r += `| Pitch Class | Count | Duration % |\n`;
        r += `| :--- | :--- | :--- |\n`;
        sortedPitches.forEach(pcName => {
            const s = pitchClassStats[pcName];
            const pct = totalTicks > 0 ? (s.ticks / totalTicks) * 100 : 0;
            r += `| ${pcName} | ${s.count} | ${pct.toFixed(1)}% |\n`;
        });
        r += `\n`;

        // 2. Melodic Interval Table (Every point data)
        const intervals: Record<number, number> = {};
        let intervalCount = 0;
        const sortedNotes = [...vNotes].sort((a,b) => a.ticks - b.ticks);
        
        for(let i=0; i<sortedNotes.length-1; i++) {
            const diff = sortedNotes[i+1].midi - sortedNotes[i].midi;
            intervals[diff] = (intervals[diff] || 0) + 1;
            intervalCount++;
        }

        r += `**Melodic Intervals**\n`;
        r += `| Interval | Label | Count | Percentage |\n`;
        r += `| :--- | :--- | :--- | :--- |\n`;
        
        if (intervalCount === 0) {
             r += `| N/A | - | 0 | 0% |\n`;
        } else {
             const sortedDiffs = Object.keys(intervals).map(Number).sort((a,b) => intervals[b] - intervals[a]);
             sortedDiffs.forEach(diff => {
                 const c = intervals[diff];
                 const pct = (c / intervalCount) * 100;
                 const label = getIntervalLabel(diff);
                 const sign = diff > 0 ? '+' : ''; 
                 r += `| ${sign}${diff} | ${label} | ${c} | ${pct.toFixed(1)}% |\n`;
             });
        }
        r += `\n`;

        // 3. Rhythm Table
        r += `**Rhythm Distribution**\n`;
        r += `| Note Value | Count | Percentage |\n`;
        r += `| :--- | :--- | :--- |\n`;
        
        if (data.voiceRhythmStats && data.voiceRhythmStats[v]) {
            data.voiceRhythmStats[v].forEach(stat => {
                 r += `| ${stat.name} | ${stat.count} | ${stat.percentage.toFixed(1)}% |\n`;
            });
        } else {
             r += `| (No Data) | - | - |\n`;
        }
    }
    r += `\n`;

    // --- CHORDS ---
    const printChords = (title: string, list: any[]) => {
        let out = `### ${title}\n`;
        if (!list || list.length === 0) {
            out += `(No chords detected)\n\n`;
        } else {
            // Compact table for chords
            out += `| Time | Chord | Notes | Context |\n`;
            out += `| :--- | :--- | :--- | :--- |\n`;
            
            // Deduplicate consecutive chords for display cleaner reading
            // HIA returns every beat, but standard reports usually just want changes.
            // We'll keep the full data in the underlying object for audit, but clean up the print here.
            let lastChordName = "";
            let lastMeasure = -1;

            list.forEach(c => {
                 const isSameAsLast = c.name === lastChordName;
                 const isNewMeasure = c.measure !== lastMeasure;
                 
                 // Show if chord changed OR if it's the start of a new measure (optional, helps readabilty)
                 if (!isSameAsLast || isNewMeasure) {
                     const missing = c.missingNotes.length ? `(Miss: ${c.missingNotes.join(',')})` : '';
                     out += `| ${c.formattedTime} | **${c.name}** | ${c.constituentNotes.join(', ')} | ${missing} |\n`;
                     lastChordName = c.name;
                     lastMeasure = c.measure;
                 }
            });
            out += `\n`;
        }
        return out;
    };
    
    r += printChords("CHORD PROGRESSION (Sustain)", data.chordsSustain);
    if (data.chordsAttack.length > 0) r += printChords("CHORD PROGRESSION (Attacks)", data.chordsAttack);
    if (data.chordsHybrid && data.chordsHybrid.length > 0) r += printChords("CHORD PROGRESSION (Hybrid)", data.chordsHybrid);
    if (data.chordsArpeggioWindow && data.chordsArpeggioWindow.length > 0) r += printChords("CHORD PROGRESSION (Arpeggio Time Window)", data.chordsArpeggioWindow);
    
    return r;
}

/**
 * Shared core logic for analysis after notes have been prepared and voices assigned.
 * EXPORTED for use in section-specific analysis.
 */
export function analyzePreparedNotes(notes: any[], trackName: string, ppq: number, ts: number[], bpm: number, voiceCount: number, transformStats?: any, outputNoteValues?: NoteValueStat[]): TrackAnalysisData {
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

    // If no notes, return empty structure
    if (notes.length === 0) return { trackName, topNoteValues: [], outputNoteValues: [], gridAlignmentScore: 0, durationConsistencyScore: 0, averageOffsetTicks: 0, totalNotes: 0, detectedGridType: "None", pitchClassHistogram: {}, chordsSustain: [], chordsAttack: [], notesRaw: [], ppq, timeSignature: { numerator: ts[0], denominator: ts[1] }, tempo: bpm, voiceCount, voiceIntervals: {} };

    // Global Rhythm Stats
    const rhythmStats = analyzeRhythm(notes, ppq, ts);
    
    // Per-Voice Rhythm Stats
    const voiceRhythmStats: Record<number, NoteValueStat[]> = {};
    for (let v = 0; v < voiceCount; v++) {
        const vNotes = notesRaw.filter(n => n.voiceIndex === v);
        if (vNotes.length > 0) {
            voiceRhythmStats[v] = analyzeRhythm(vNotes, ppq, ts).topNoteValues;
        } else {
            voiceRhythmStats[v] = [];
        }
    }

    const histogram: Record<number, number> = {};
    for (let i = 0; i < 12; i++) histogram[i] = 0;
    notes.forEach(n => histogram[n.midi % 12]++);

    return {
        trackName, 
        topNoteValues: rhythmStats.topNoteValues, 
        outputNoteValues: outputNoteValues,
        voiceRhythmStats, 
        gridAlignmentScore: rhythmStats.gridAlignmentScore, 
        durationConsistencyScore: rhythmStats.durationConsistencyScore, 
        averageOffsetTicks: rhythmStats.averageOffsetTicks, 
        totalNotes: notes.length, 
        detectedGridType: rhythmStats.detectedGridType, 
        pitchClassHistogram: histogram, 
        chordsSustain: detectChordsSustain(notesRaw, ppq, ts[0], ts[1]), 
        chordsAttack: detectChordsAttack(notesRaw, ppq, ts[0], ts[1]), 
        chordsArpeggioWindow: [], // Calculated in scoreGenerator for sections
        transformationStats: transformStats,
        notesRaw, 
        ppq, 
        timeSignature: { numerator: ts[0], denominator: ts[1] }, 
        tempo: bpm, 
        voiceCount, 
        voiceIntervals: analyzeVoiceLeading(notesRaw),
        voiceIntervalsByVoice: analyzeVoiceLeadingPerVoice(notesRaw), 
        pitchStatsGlobal: calculatePitchStats(notesRaw), 
        pitchStatsByVoice: calculatePitchStatsByVoice(notesRaw, voiceCount),
        bestKeyPrediction: predictKey(histogram, notes.length, false)[0]?.winner
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
    
    let outputNoteValues: NoteValueStat[] | undefined = undefined;
    if (options) {
        const transformedNotes = getTransformedNotes(track.notes.map(n => ({...n})), options, ppq);
        const outRhythm = analyzeRhythm(transformedNotes, ppq, options.timeSignature ? [options.timeSignature.numerator, options.timeSignature.denominator] : ts);
        outputNoteValues = outRhythm.topNoteValues;
    }

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
        transformStats,
        outputNoteValues
    );
}

export function analyzeTrackSelection(midi: Midi, trackIds: number[], options?: ConversionOptions): TrackAnalysisData {
    const ppq = midi.header.ppq || 480;
    const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
    const bpm = midi.header.tempos[0]?.bpm || 120;
    
    const newMidi = midi.clone();
    newMidi.tracks = [];
    newMidi.header.setTempo(options?.tempo || bpm);
    newMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [ts[0], ts[1]] }];

    let aggregatedNotes: any[] = [];
    
    trackIds.forEach((id, voiceIndex) => {
        const originalTrack = midi.tracks[id];
        if (!originalTrack) return;
        
        const tempTrack = newMidi.addTrack(); 
        if (options) {
             copyAndTransformTrackEvents(originalTrack, tempTrack, options, new Set(), midi.header);
        } else {
             originalTrack.notes.forEach(n => tempTrack.addNote(n));
        }

        tempTrack.notes.forEach(n => {
            (n as any).voiceIndex = voiceIndex;
            aggregatedNotes.push(n);
        });
    });
    
    const combinedName = `Selection (${trackIds.length} tracks)`;

    let outputNoteValues: NoteValueStat[] | undefined = undefined;
    if (options) {
        const outRhythm = analyzeRhythm(aggregatedNotes, ppq, options.timeSignature ? [options.timeSignature.numerator, options.timeSignature.denominator] : ts);
        outputNoteValues = outRhythm.topNoteValues;
    }
    
    return analyzePreparedNotes(
        aggregatedNotes,
        combinedName,
        ppq,
        ts,
        bpm,
        trackIds.length,
        undefined, 
        outputNoteValues
    );
}