
import { Midi } from '@tonejs/midi';
import { ConversionOptions, MidiEventType } from '../../types';
import { getQuantizationTickValue } from './midiTransform';
import { copyAndTransformTrackEvents } from './midiPipeline';
import { distributeToVoices, getVoiceLabel } from './midiVoices';
import { NOTE_NAMES } from './midiCore';

const SPELLING_MAPS: { [keyRoot: number]: string[] } = {
    0: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
    1: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    2: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    3: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    4: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    5: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    6: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    7: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
    8: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    9: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    10: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    11: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
};

const KEY_ACCIDENTALS: { [keyRoot: number]: Record<string, string> } = {
    0: {}, 1: { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b' }, 2: { F: '#', C: '#' },
    3: { B: 'b', E: 'b', A: 'b' }, 4: { F: '#', C: '#', G: '#', D: '#' }, 5: { B: 'b' },
    6: { F: '#', C: '#', G: '#', D: '#', A: '#' }, 7: { F: '#' },
    8: { B: 'b', E: 'b', A: 'b', D: 'b' }, 9: { F: '#', C: '#', G: '#' }, 10: { B: 'b', E: 'b' },
    11: { F: '#', C: '#', G: '#', D: '#', A: '#' },
};

function getSpellingContext(root: number, mode: string): number {
    const r = (root % 12 + 12) % 12;
    if (mode.includes('Minor')) return (r + 3) % 12;
    if (mode.includes('Dorian')) return (r + 10) % 12;
    if (mode.includes('Phrygian')) return (r + 8) % 12;
    if (mode.includes('Lydian')) return (r + 7) % 12;
    if (mode.includes('Mixolydian')) return (r + 5) % 12;
    return r;
}

function getAbcPitch(midi: number, contextRoot: number): string {
    const spellingMap = SPELLING_MAPS[contextRoot] || SPELLING_MAPS[0];
    const keyNativeAccs = KEY_ACCIDENTALS[contextRoot] || {};
    const midiIndex = midi % 12;
    const noteNameFull = spellingMap[midiIndex]; 
    const noteLetter = noteNameFull.charAt(0);
    const noteAcc = noteNameFull.length > 1 ? noteNameFull.charAt(1) : ''; 
    const octave = Math.floor(midi / 12) - 1;
    const nativeAcc = keyNativeAccs[noteLetter] || '';
    let abcAcc = '';
    if (noteAcc !== nativeAcc) {
        if (noteAcc === '#') abcAcc = '^';
        else if (noteAcc === 'b') abcAcc = '_';
        else if (noteAcc === '') abcAcc = '=';
    }
    let pitchChar = noteLetter;
    if (octave >= 5) { pitchChar = pitchChar.toLowerCase(); if (octave > 5) pitchChar += "'".repeat(octave - 5); }
    else { if (octave < 4) pitchChar += ",".repeat(4 - octave); }
    return abcAcc + pitchChar;
}

function formatFraction(num: number, den: number): string {
    if (num === 0 || num === den) return '';
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const common = gcd(num, den);
    const n = num / common; const d = den / common;
    if (d === 1) return n.toString();
    if (n === 1) return `/${d}`;
    return `${n}/${d}`;
}

interface AbcEvent { type: 'note' | 'rest'; midis?: number[]; ticks: number; durationTicks: number; tied?: boolean; }

function segmentNotesByMeasure(notes: any[], ticksPerMeasure: number): Map<number, AbcEvent[]> {
    const measureMap = new Map<number, AbcEvent[]>();
    const groupedByTime = new Map<string, any[]>();
    for (const note of notes) {
        const key = `${note.ticks}_${note.durationTicks}`;
        if (!groupedByTime.has(key)) groupedByTime.set(key, []);
        groupedByTime.get(key)!.push(note);
    }
    const sortedKeys = Array.from(groupedByTime.keys()).sort((a,b) => {
        const [tA] = a.split('_').map(Number);
        const [tB] = b.split('_').map(Number);
        return tA - tB;
    });
    for (const key of sortedKeys) {
        const chordNotes = groupedByTime.get(key)!;
        const note = chordNotes[0];
        const midis = chordNotes.map(n => n.midi);
        let currentTick = note.ticks;
        const noteEnd = note.ticks + note.durationTicks;
        while (currentTick < noteEnd) {
            const measureIndex = Math.floor(currentTick / ticksPerMeasure);
            const measureStart = measureIndex * ticksPerMeasure;
            const measureEnd = (measureIndex + 1) * ticksPerMeasure;
            const effectiveEnd = Math.min(noteEnd, measureEnd);
            const duration = effectiveEnd - currentTick;
            if (!measureMap.has(measureIndex)) measureMap.set(measureIndex, []);
            measureMap.get(measureIndex)!.push({ 
                type: 'note', 
                midis: midis, 
                ticks: currentTick - measureStart, 
                durationTicks: duration, 
                tied: effectiveEnd < noteEnd 
            });
            currentTick = effectiveEnd;
        }
    }
    return measureMap;
}

const CANDIDATE_L_RATIOS = [
    { num: 1, den: 1 }, { num: 1, den: 2 }, { num: 1, den: 3 }, { num: 1, den: 4 },
    { num: 1, den: 6 }, { num: 1, den: 8 }, { num: 1, den: 12 }, { num: 1, den: 16 }, { num: 1, den: 24 },
];

function determineBestLUnit(notes: any[], ppq: number): { str: string, ticks: number } {
    const counts = new Map<number, number>();
    notes.forEach(n => counts.set(n.durationTicks, (counts.get(n.durationTicks) || 0) + 1));
    let dominantTicks = 0; let maxCount = 0;
    counts.forEach((c, t) => { if (c > maxCount) { maxCount = c; dominantTicks = t; } });
    const whole = ppq * 4;
    let bestL = CANDIDATE_L_RATIOS[5];
    let bestScore = -Infinity;
    for (const ratio of CANDIDATE_L_RATIOS) {
        const lTicks = Math.round(whole * (ratio.num / ratio.den));
        if (lTicks <= 0) continue;
        let score = 0;
        if (dominantTicks % lTicks === 0) {
            const mult = dominantTicks / lTicks;
            if (mult === 1) score += 3000; else if (mult === 2) score += 1500; else if (mult === 4) score += 800; else score -= mult * 20;
        } else { score -= 2000; }
        let fractionCount = 0;
        notes.forEach(n => { if (n.durationTicks % lTicks !== 0) fractionCount++; });
        score -= (fractionCount / notes.length * 1500);
        if (ratio.den === 4 || ratio.den === 8) score += 50;
        if (score > bestScore) { bestScore = score; bestL = ratio; }
    }
    return { str: bestL.num === 1 ? `1/${bestL.den}` : `${bestL.num}/${bestL.den}`, ticks: Math.round(whole * (bestL.num / bestL.den)) };
}

function convertMidiToAbc(midi: Midi, fileName: string, options: ConversionOptions, forcedGridTick: number = 0): string {
    const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
    const ppq = midi.header.ppq;
    let quantGrid = forcedGridTick;
    if (quantGrid <= 0) {
        const all = midi.tracks.flatMap(t => t.notes);
        let tErr = 0, sErr = 0;
        const tT = ppq/3, sT = ppq/4;
        all.forEach(n => { tErr += Math.min(n.ticks % tT, tT - (n.ticks % tT)); sErr += Math.min(n.ticks % sT, sT - (n.ticks % sT)); });
        quantGrid = tErr < sErr ? Math.round(ppq/12) : Math.round(ppq/4);
        if (quantGrid === 0) quantGrid = 1;
    }
    midi.tracks.forEach(t => t.notes.forEach(n => { n.ticks = Math.round(n.ticks/quantGrid)*quantGrid; n.durationTicks = Math.max(quantGrid, Math.round(n.durationTicks/quantGrid)*quantGrid); }));
    const allNotes = midi.tracks.flatMap(t => t.notes);
    const maxSongTick = allNotes.reduce((max, n) => Math.max(max, n.ticks + n.durationTicks), 0);
    const lUnit = determineBestLUnit(allNotes, ppq);
    const keyRootName = NOTE_NAMES[options.modalConversion.root];
    const keyMode = options.modalConversion.modeName;
    let abcMode = keyMode === 'Major' ? 'Maj' : keyMode === 'Natural Minor' ? 'Min' : keyMode;
    let keyString = `K:${keyRootName}${abcMode}`;
    const spellRoot = getSpellingContext(options.modalConversion.root, keyMode);
    let abc = `X:1\nT:${fileName.replace(/\.abc$/i, '')}\nM:${ts[0]}/${ts[1]}\nL:${lUnit.str}\nQ:1/4=${Math.round(midi.header.tempos[0]?.bpm || 120)}\n`;
    if (options.modalConversion.root === 0 && options.modalConversion.modeName === 'Major') {
        abc += `% NOTE: Key signature is set to C Major by default.\n`;
    }
    abc += `${keyString}\n`;
    const ticksPerM = Math.round(ppq * 4 * (ts[0] / ts[1]));
    const totalMeasures = Math.ceil(maxSongTick / ticksPerM);
    midi.tracks.forEach((track, trackIndex) => {
        if (track.notes.length === 0) return;
        const voices = distributeToVoices(track.notes, options) as any[][];
        voices.forEach((vNotes, vIdx) => {
            const voiceName = voices.length > 1 ? getVoiceLabel(vIdx, voices.length) : track.name;
            abc += `V:${trackIndex + 1}_${vIdx + 1} name="${voiceName}"\n`;
            const measures = segmentNotesByMeasure(vNotes, ticksPerM);
            let abcBody = '';
            let lineMeasureCount = 0;
            for (let m = 0; m < totalMeasures; m++) {
                if (lineMeasureCount === 0) abcBody += `% Measure ${m + 1}\n`;
                const events = (measures.get(m) || []).sort((a,b) => a.ticks - b.ticks);
                if (events.length === 0) {
                    abcBody += `z${formatFraction(ticksPerM, lUnit.ticks)} | `;
                } else {
                    let currentT = 0; 
                    let mStr = '';
                    events.forEach(e => {
                        if (e.ticks > currentT) { 
                            mStr += `z${formatFraction(e.ticks - currentT, lUnit.ticks)} `; 
                            currentT = e.ticks; 
                        }
                        if (e.midis && e.midis.length > 1) {
                            const chordStr = e.midis.map(m => getAbcPitch(m, spellRoot)).join('');
                            mStr += `[${chordStr}]${formatFraction(e.durationTicks, lUnit.ticks)}${e.tied ? '-' : ''} `;
                        } else if (e.midis && e.midis.length > 0) {
                             mStr += `${getAbcPitch(e.midis[0], spellRoot)}${formatFraction(e.durationTicks, lUnit.ticks)}${e.tied ? '-' : ''} `;
                        }
                        currentT += e.durationTicks;
                    });
                    if (currentT < ticksPerM) mStr += `z${formatFraction(ticksPerM - currentT, lUnit.ticks)} `;
                    abcBody += mStr.trim() + " | ";
                }
                if (++lineMeasureCount >= 4) { 
                    abcBody += "\n"; 
                    lineMeasureCount = 0; 
                }
            }
            abc += abcBody.trim() + " |]\n\n";
        });
    });
    return abc;
}

export async function exportTracksToAbc(originalMidi: Midi, trackIds: number[], newFileName: string, eventsToDelete: Set<MidiEventType>, options: ConversionOptions): Promise<void> {
    const newMidi = originalMidi.clone(); newMidi.tracks = []; 
    newMidi.header.setTempo(options.tempo); newMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [options.timeSignature.numerator, options.timeSignature.denominator] }];
    trackIds.forEach(id => { const t = originalMidi.tracks[id]; if (t) { const target = newMidi.addTrack(); target.name = t.name; target.instrument = t.instrument; copyAndTransformTrackEvents(t, target, options, eventsToDelete, newMidi.header); } });
    const abcStr = convertMidiToAbc(newMidi, newFileName, options, getQuantizationTickValue(options.quantizationValue, newMidi.header.ppq));
    const blob = new Blob([abcStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = newFileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
