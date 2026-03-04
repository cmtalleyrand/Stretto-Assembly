import { ChordMatch, ChordEvent, RawNote } from '../../types';
import { NOTE_NAMES } from './midiConstants';

export const CHORD_SHAPES = [
    { name: '13', intervals: [0, 4, 7, 10, 2, 5, 9], optional5th: true },
    { name: '11', intervals: [0, 4, 7, 10, 2, 5], optional5th: true },
    { name: 'Maj9', intervals: [0, 4, 7, 11, 2], optional5th: true },
    { name: 'm9', intervals: [0, 3, 7, 10, 2], optional5th: true },
    { name: '9', intervals: [0, 4, 7, 10, 2], optional5th: true },
    { name: 'add9', intervals: [0, 4, 7, 2], optional5th: true },
    { name: 'Maj7', intervals: [0, 4, 7, 11], optional5th: true },
    { name: 'm7', intervals: [0, 3, 7, 10], optional5th: true },
    { name: '7', intervals: [0, 4, 7, 10], optional5th: true },
    { name: '6', intervals: [0, 4, 7, 9], optional5th: true },
    { name: 'm6', intervals: [0, 3, 7, 9], optional5th: true },
    { name: 'mM7', intervals: [0, 3, 7, 11], optional5th: true },
    { name: 'm7b5', intervals: [0, 3, 6, 10], optional5th: false },
    { name: 'aug7', intervals: [0, 4, 8, 10], optional5th: false },
    { name: 'Dim7', intervals: [0, 3, 6, 9], optional5th: false }, 
    { name: 'Aug', intervals: [0, 4, 8], optional5th: false },     
    { name: 'Dim', intervals: [0, 3, 6], optional5th: false },
    { name: 'sus4', intervals: [0, 5, 7], optional5th: true },
    { name: 'sus2', intervals: [0, 2, 7], optional5th: true },
    { name: '5', intervals: [0, 7], optional5th: false },
    { name: 'Maj', intervals: [0, 4, 7], optional5th: true },
    { name: 'Min', intervals: [0, 3, 7], optional5th: true },
];

export function identifyChord(pitches: number[]): { match: ChordMatch, alternatives: ChordMatch[] } | null {
    if (pitches.length < 2) return null;
    const sortedPitches = [...pitches].sort((a,b) => a - b);
    const bassPC = sortedPitches[0] % 12;
    const uniquePCs = Array.from(new Set(pitches.map(p => p % 12))).sort((a,b) => a-b);
    const candidates: ChordMatch[] = [];

    for (const root of uniquePCs) {
        const inputIntervals = uniquePCs.map(p => (p - root + 12) % 12);
        for (const shape of CHORD_SHAPES) {
            const req = shape.intervals;
            const missing = req.filter(i => !inputIntervals.includes(i));
            const isOmitted5th = missing.length === 1 && missing[0] === 7 && shape.optional5th;

            if (missing.length === 0 || isOmitted5th) {
                let score = (req.length - missing.length) * 10;
                const extraNotes = inputIntervals.filter(i => !req.includes(i)).length;
                score -= extraNotes * 20;
                score -= missing.length * 5;

                let inversionStr: string | undefined = undefined;
                if (root !== bassPC) {
                    inversionStr = `/${NOTE_NAMES[bassPC]}`;
                } else { score += 1; }

                candidates.push({
                    name: `${NOTE_NAMES[root]} ${shape.name}${inversionStr || ''}`,
                    root: NOTE_NAMES[root],
                    quality: shape.name,
                    bass: inversionStr ? NOTE_NAMES[bassPC] : undefined,
                    inversion: inversionStr,
                    score,
                    missingNotes: missing.map(interval => NOTE_NAMES[(root + interval) % 12])
                });
            }
        }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a,b) => b.score - a.score);
    return { match: candidates[0], alternatives: candidates.slice(1, 6) };
}

export function getFormattedTime(ticks: number, ppq: number, tsNum: number, tsDenom: number): string {
    const ticksPerQuarter = ppq;
    const ticksPerMeasure = (ticksPerQuarter * 4 * tsNum) / tsDenom;
    
    // Prevent division by zero or negative
    if (ticksPerMeasure <= 0) return "0:0";

    const measureIndex = Math.floor(ticks / ticksPerMeasure);
    const measure = measureIndex + 1;
    const ticksInMeasure = ticks % ticksPerMeasure;

    let beat = 0;
    let sub = 0;
    let fracStr = "";

    // Compound Meter Check: Denom 8 and Num multiple of 3 (6, 9, 12)
    // In these meters, the BEAT is a Dotted Quarter (3 Eighths)
    const isCompound = tsDenom === 8 && (tsNum % 3 === 0);

    if (isCompound) {
        // Beat Unit = Dotted Quarter = 1.5 * Quarter
        const ticksPerBeat = ticksPerQuarter * 1.5;
        const beatIndex = Math.floor(ticksInMeasure / ticksPerBeat);
        beat = beatIndex + 1;

        const ticksInBeat = ticksInMeasure % ticksPerBeat;
        
        // Subdivision Unit = Eighth Note = 0.5 * Quarter
        // There are 3 subdivisions per beat
        const ticksPerSub = ticksPerQuarter * 0.5;
        const subIndex = Math.floor(ticksInBeat / ticksPerSub);
        sub = subIndex + 1;

        const ticksInSub = ticksInBeat % ticksPerSub;
        const frac = ticksInSub / ticksPerSub;
        
        if (frac > 0.001) {
            fracStr = parseFloat(frac.toFixed(2)).toString();
            if (fracStr.startsWith('0')) fracStr = fracStr.substring(1); 
            if (!fracStr.startsWith('.')) fracStr = '.' + fracStr;
        }
    } else {
        // Simple Meters (e.g. 4/4, 3/4, 2/4)
        // Beat Unit = Based on Denominator (Usually Quarter for /4)
        const ticksPerBeat = (ticksPerQuarter * 4) / tsDenom;
        const beatIndex = Math.floor(ticksInMeasure / ticksPerBeat);
        beat = beatIndex + 1;
        
        const ticksInBeat = ticksInMeasure % ticksPerBeat;
        
        // Main Subdivision = Half of a Beat (e.g. Eighth for 4/4)
        const ticksPerSub = ticksPerBeat / 2;
        const subIndex = Math.floor(ticksInBeat / ticksPerSub);
        sub = subIndex + 1;
        
        const ticksInSub = ticksInBeat % ticksPerSub;
        const frac = ticksInSub / ticksPerSub;

        if (frac > 0.001) {
            fracStr = parseFloat(frac.toFixed(2)).toString();
            if (fracStr.startsWith('0')) fracStr = fracStr.substring(1); 
            if (!fracStr.startsWith('.')) fracStr = '.' + fracStr;
        }
    }

    // Format: M{measure} B{beat}.{sub}{fraction}
    return `M${measure} B${beat}.${sub}${fracStr}`;
}

function prepareNotesForChordDetection(notes: (any | RawNote)[]): (any | RawNote)[] {
    return notes.map(n => {
        const principalTick = (n as any)._principalTick;
        if (principalTick !== undefined) {
            return { ...n, ticks: principalTick };
        }
        return n;
    });
}

function filterPassingTones(notes: any[], ppq: number, tsDenom: number): any[] {
    const ticksPerBeat = ppq * (4 / tsDenom);
    const voiceMap: Record<number, any[]> = {};
    notes.forEach(n => {
        const v = n.voiceIndex || 0;
        if (!voiceMap[v]) voiceMap[v] = [];
        voiceMap[v].push(n);
    });

    const getEffectiveDuration = (note: any) => note.durationTicks; 
    const notesToKeep: any[] = [];
    const maxDur = Math.max(...notes.map(n => getEffectiveDuration(n)));

    notes.forEach(note => {
        const duration = getEffectiveDuration(note);
        const isShort = duration < (maxDur * 0.5);
        const beatOffset = note.ticks % ticksPerBeat;
        const isOnBeat = beatOffset < (ppq / 32) || beatOffset > (ticksPerBeat - (ppq/32));

        if (isShort && !isOnBeat) {
            return; 
        }
        
        notesToKeep.push(note);
    });

    return notesToKeep.length >= 2 ? notesToKeep : notes;
}

export function detectChordsSustain(notes: any[] | RawNote[], ppq: number, tsNum: number, tsDenom: number, minDurationTicks: number = 0, ignorePassing: boolean = false): ChordEvent[] {
    const prepared = prepareNotesForChordDetection(notes);
    const validNotes = prepared.filter(n => (n.durationTicks || 0) >= minDurationTicks);
    const points = new Set<number>();
    validNotes.forEach(n => { points.add(n.ticks); points.add(n.ticks + n.durationTicks); });
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    const chords: ChordEvent[] = [];
    const ticksPerMeasure = ppq * tsNum * (4 / tsDenom);

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const t = sortedPoints[i];
        let activeNotes = validNotes.filter(n => n.ticks <= t && (n.ticks + n.durationTicks) > t);
        
        if (ignorePassing && activeNotes.length > 2) {
            activeNotes = filterPassingTones(activeNotes, ppq, tsDenom);
        }

        if (activeNotes.length >= 2) {
            const result = identifyChord(activeNotes.map(n => n.midi));
            if (result) {
                const { match, alternatives } = result;
                const measure = Math.floor(t / ticksPerMeasure) + 1;
                const constituentNotes = Array.from(new Set(activeNotes.map((n: any) => n.name)));
                const lastChord = chords[chords.length - 1];
                if (!lastChord || lastChord.name !== match.name || lastChord.measure !== measure) {
                     chords.push({
                        timestamp: t / ppq,
                        measure,
                        formattedTime: getFormattedTime(t, ppq, tsNum, tsDenom),
                        name: match.name,
                        root: match.root,
                        quality: match.quality,
                        bass: match.bass,
                        inversion: match.inversion,
                        ticks: t,
                        constituentNotes,
                        missingNotes: match.missingNotes,
                        alternatives: alternatives
                    });
                }
            }
        }
    }
    return chords;
}

export function detectChordsAttack(notes: any[] | RawNote[], ppq: number, tsNum: number, tsDenom: number, toleranceTicks: number = 0, minDurationTicks: number = 0, ignorePassing: boolean = false): ChordEvent[] {
    const prepared = prepareNotesForChordDetection(notes);
    const validNotes = prepared.filter(n => (n.durationTicks || 0) >= minDurationTicks);
    const sorted = [...validNotes].sort((a, b) => a.ticks - b.ticks);
    const chords: ChordEvent[] = [];
    const ticksPerMeasure = ppq * tsNum * (4 / tsDenom);
    const window = Math.max(1, toleranceTicks > 0 ? toleranceTicks : ppq / 3); 

    let i = 0;
    while (i < sorted.length) {
        const startTick = sorted[i].ticks;
        let group = [sorted[i]];
        let j = i + 1;
        while (j < sorted.length && (sorted[j].ticks - startTick) < window) {
            group.push(sorted[j]);
            j++;
        }
        
        if (ignorePassing && group.length > 2) {
            group = filterPassingTones(group, ppq, tsDenom);
        }

        const uniqueNotes = Array.from(new Map(group.map(n => [n.midi, n])).values());
        if (uniqueNotes.length >= 2) {
            const result = identifyChord(uniqueNotes.map(n => n.midi));
            if (result) {
                const { match, alternatives } = result;
                const measure = Math.floor(startTick / ticksPerMeasure) + 1;
                const constituentNotes = Array.from(new Set(uniqueNotes.map(n => n.name)));
                const lastChord = chords[chords.length - 1];
                if (!lastChord || lastChord.name !== match.name || lastChord.measure !== measure) {
                    chords.push({
                        timestamp: startTick / ppq,
                        measure,
                        formattedTime: getFormattedTime(startTick, ppq, tsNum, tsDenom),
                        name: match.name,
                        root: match.root,
                        quality: match.quality,
                        bass: match.bass,
                        inversion: match.inversion,
                        ticks: startTick,
                        constituentNotes,
                        missingNotes: match.missingNotes,
                        alternatives: alternatives
                    });
                }
            }
        }
        i = j;
    }
    return chords;
}

export function detectChordsHybrid(notes: RawNote[], ppq: number, tsNum: number, tsDenom: number, minDurationTicks: number, voiceConfigs: Record<number, string>, arpeggioMode: 'count' | 'beat' | '2beat', arpeggioValue: number): ChordEvent[] {
    // Legacy stub - main logic moved to midiArpeggio.ts, which is called directly by scoreGenerator
    return detectChordsSustain(notes, ppq, tsNum, tsDenom, 0, false);
}

export function detectChordsBucketed(notes: RawNote[] | any[], ppq: number, tsNum: number, tsDenom: number, beatSubdivision: number = 1): ChordEvent[] {
    const ticksPerBeat = ppq * (4 / tsDenom);
    const bucketSize = ticksPerBeat / beatSubdivision;
    const ticksPerMeasure = ticksPerBeat * tsNum;

    // Group notes by bucket
    const buckets = new Map<number, any[]>();
    notes.forEach(n => {
        const bucketIdx = Math.floor(n.ticks / bucketSize);
        if (!buckets.has(bucketIdx)) buckets.set(bucketIdx, []);
        buckets.get(bucketIdx)!.push(n);
    });

    const chords: ChordEvent[] = [];
    const sortedKeys = Array.from(buckets.keys()).sort((a,b) => a-b);

    sortedKeys.forEach(key => {
        const bucketNotes = buckets.get(key)!;
        const startTick = key * bucketSize;
        const uniqueMidis = Array.from(new Set(bucketNotes.map(n => n.midi)));
        
        // Simple heuristic: at least 3 notes to form a bucket chord
        if (uniqueMidis.length >= 3) { 
             const result = identifyChord(uniqueMidis);
             if (result) {
                 const { match, alternatives } = result;
                 const measure = Math.floor(startTick / ticksPerMeasure) + 1;
                 const constituentNotes = Array.from(new Set(bucketNotes.map(n => n.name)));
                 
                 // Debounce/Dedup
                 const lastChord = chords[chords.length - 1];
                 // If different name, or significantly later time (e.g. next bucket)
                 if (!lastChord || lastChord.name !== match.name || Math.abs(lastChord.ticks - startTick) >= bucketSize) {
                      chords.push({
                        timestamp: startTick / ppq,
                        measure,
                        formattedTime: getFormattedTime(startTick, ppq, tsNum, tsDenom),
                        name: match.name,
                        root: match.root,
                        quality: match.quality,
                        bass: match.bass,
                        inversion: match.inversion,
                        ticks: startTick,
                        constituentNotes,
                        missingNotes: match.missingNotes,
                        alternatives
                    });
                 }
             }
        }
    });
    return chords;
}