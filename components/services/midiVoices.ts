
import { RawNote, ConversionOptions } from '../../types';

const getMidi = (n: any | RawNote) => 'midi' in n ? n.midi : (n as any).midi;
const getTicks = (n: any | RawNote) => 'ticks' in n ? n.ticks : (n as any).ticks;
const getDuration = (n: any | RawNote) => 'durationTicks' in n ? n.durationTicks : (n as any).durationTicks;
const getEnd = (n: any | RawNote) => getTicks(n) + getDuration(n);

/**
 * Returns the standard voice label based on total voice count.
 * Logic:
 * - <= 4 Voices: Use standard SATB names.
 * - > 4 Voices: Divide into SATB buckets, then number them (e.g., S1, S2).
 */
export function getVoiceLabel(index: number, total: number): string {
    if (index < 0) return 'Orphan';
    if (total <= 1) return 'Melody';
    
    // Standard SATB for small ensembles
    if (total <= 4) {
        const standard = ["Soprano", "Alto", "Tenor", "Bass"];
        // 2 Voices: S, B
        if (total === 2) return index === 0 ? "Soprano" : "Bass";
        // 3 Voices: S, A, B (or S, T, B? Standard is usually S, A, B for trios)
        if (total === 3) return index === 2 ? "Bass" : standard[index];
        return standard[index] || `Voice ${index + 1}`;
    }

    // Larger ensembles: Split into registers
    // We want to distribute indices 0..N across S, A, T, B
    // Priority for splits: S then A then T then B?
    // 5 Voices: S1, S2, A, T, B
    // 6 Voices: S1, S2, A1, A2, T, B
    // 8 Voices: S1, S2, A1, A2, T1, T2, B1, B2
    
    if (total === 5) {
        return ["Soprano 1", "Soprano 2", "Alto", "Tenor", "Bass"][index] || `Voice ${index+1}`;
    }
    if (total === 6) {
        return ["Soprano 1", "Soprano 2", "Alto 1", "Alto 2", "Tenor", "Bass"][index] || `Voice ${index+1}`;
    }
    if (total === 8) {
        return ["Soprano 1", "Soprano 2", "Alto 1", "Alto 2", "Tenor 1", "Tenor 2", "Bass 1", "Bass 2"][index] || `Voice ${index+1}`;
    }

    // Generic Algorithm for N > 4 (distribute evenly)
    const baseNames = ["Soprano", "Alto", "Tenor", "Bass"];
    const bucketSize = total / 4; // e.g. 1.25 for 5 voices
    const bucketIndex = Math.min(3, Math.floor(index / bucketSize));
    
    // Count how many are in this bucket
    // Note: This is an approximation for non-standard sizes like 7 or 9
    const voicesInBucket = Math.ceil(bucketSize); 
    const posInBucket = (index % Math.ceil(bucketSize)) + 1;
    
    // If strict division puts 2 in a bucket, append number. If 1, just name.
    const name = baseNames[bucketIndex];
    
    // Check if this specific bucket effectively has multiple voices mapped to it
    // Simple heuristic: if total > 4, always number them to be safe/clear
    return `${name} ${posInBucket}`;
}

/**
 * Returns compact role code for a voice (e.g. S, A, T, B, S1, A2).
 * If a user-defined label exists, it remains highest priority.
 */
export function getVoiceCode(index: number, total: number, voiceNames?: Record<number, string>): string {
    const customLabel = voiceNames?.[index];
    if (customLabel) return customLabel;

    const label = getVoiceLabel(index, total);
    const voiceMatch = label.match(/^([A-Za-z]+)(?:\s+(\d+))?$/);
    if (!voiceMatch) return label;

    const [, roleName, roleNumber] = voiceMatch;
    const roleCode = roleName.charAt(0).toUpperCase();
    return roleNumber ? `${roleCode}${roleNumber}` : roleCode;
}

interface DensityArea {
    startTick: number;
    endTick: number;
    density: number;
    slices: any[];
}

/**
 * Structural Analysis based on Density and Sustain criteria.
 */
export function distributeToVoices(notes: any[] | RawNote[], options?: ConversionOptions, ppq: number = 480): (any | RawNote)[][] {
    if (notes.length === 0) return [];

    const TS_NUM = options?.timeSignature?.numerator || 4;
    const TS_DEN = options?.timeSignature?.denominator || 4;
    const TICKS_PER_MEASURE = ppq * TS_NUM * (4 / TS_DEN);
    const EIGHTH_GAP = ppq / 2;

    const sortedNotes = [...notes].sort((a, b) => getTicks(a) - getTicks(b));
    const allEvents = new Set<number>();
    sortedNotes.forEach(n => { 
        allEvents.add(getTicks(n)); 
        allEvents.add(getEnd(n)); 
    });
    const sortedTimeline = Array.from(allEvents).sort((a,b) => a - b);
    
    // Create slices of the timeline
    const slices: { start: number, end: number, activeNotes: (any | RawNote)[] }[] = [];
    let maxGlobalDensity = 0;
    
    for (let i = 0; i < sortedTimeline.length - 1; i++) {
        const start = sortedTimeline[i];
        const end = sortedTimeline[i+1];
        const mid = (start + end) / 2;
        const active = sortedNotes.filter(n => getTicks(n) <= mid && getEnd(n) > mid);
        if (active.length > maxGlobalDensity) maxGlobalDensity = active.length;
        slices.push({ start, end, activeNotes: active });
    }

    if (maxGlobalDensity === 0) return [sortedNotes];

    const totalTicks = sortedTimeline[sortedTimeline.length - 1] - sortedTimeline[0];

    /**
     * Finds contiguous areas of specific density with gap tolerance.
     */
    const findAreasAtDensity = (targetDensity: number) => {
        const areas: DensityArea[] = [];
        let currentArea: DensityArea | null = null;

        slices.forEach((slice) => {
            if (slice.activeNotes.length >= targetDensity) {
                if (!currentArea) {
                    currentArea = { startTick: slice.start, endTick: slice.end, density: targetDensity, slices: [slice] };
                } else {
                    const gap = slice.start - currentArea.endTick;
                    if (gap <= EIGHTH_GAP) {
                        currentArea.endTick = slice.end;
                        currentArea.slices.push(slice);
                    } else {
                        areas.push(currentArea);
                        currentArea = { startTick: slice.start, endTick: slice.end, density: targetDensity, slices: [slice] };
                    }
                }
            }
        });
        if (currentArea) areas.push(currentArea);
        return areas;
    };

    /**
     * Checks if an area meets sustain criteria (1 measure or 1/5 total length).
     */
    const checkSustain = (area: DensityArea) => {
        const len = area.endTick - area.startTick;
        return len >= TICKS_PER_MEASURE || len >= totalTicks / 5;
    };

    // Determine final polyphony target based on structural sustain
    let d = maxGlobalDensity;
    let sustainedAreas: DensityArea[] = [];
    while (d >= 1) {
        const areas = findAreasAtDensity(d);
        sustainedAreas = areas.filter(checkSustain);
        if (sustainedAreas.length > 0) break;
        d--;
    }

    // Fallback logic: if no sustained areas found at max, use max-1 if possible.
    let finalPolyphony = d;
    if (finalPolyphony === 0) finalPolyphony = Math.max(1, maxGlobalDensity - 1);

    const voiceTracks: (any | RawNote)[][] = Array.from({ length: finalPolyphony }, () => []);
    const assignedNotes = new Set<any | RawNote>();

    // 1. Assign notes in structural sustained areas first (Top-Down)
    sustainedAreas.forEach(area => {
        area.slices.forEach(slice => {
            const unassigned = slice.activeNotes
                .filter(n => !assignedNotes.has(n))
                .sort((a, b) => getMidi(b) - getMidi(a)); // Pitch descending
            
            for (let v = 0; v < finalPolyphony && unassigned.length > 0; v++) {
                const note = unassigned.shift()!;
                voiceTracks[v].push(note);
                assignedNotes.add(note);
                (note as any).voiceIndex = v;
            }
        });
    });

    // 2. Iteratively solve gaps and connect start/ends
    // This is a simplified iterative solver that fills unassigned notes 
    // into existing voice streams based on proximity and pitch continuity.
    const remainingNotes = sortedNotes.filter(n => !assignedNotes.has(n));
    remainingNotes.forEach(note => {
        // Find logical voice index: 
        // 1. If it overlaps with a voice, it can't go there unless chords allowed.
        // 2. Otherwise, find voice with nearest pitch at this time.
        let bestV = 0;
        let minPitchDiff = Infinity;
        const nPitch = getMidi(note);

        for (let v = 0; v < finalPolyphony; v++) {
            const track = voiceTracks[v];
            const prev = track.filter(n => getTicks(n) < getTicks(note)).sort((a,b) => getTicks(b) - getTicks(a))[0];
            const next = track.filter(n => getTicks(n) > getTicks(note)).sort((a,b) => getTicks(a) - getTicks(b))[0];
            
            const overlap = track.some(n => getTicks(n) < getEnd(note) && getEnd(n) > getTicks(note));
            if (overlap) continue;

            let diff = 0;
            if (prev) diff += Math.abs(getMidi(prev) - nPitch);
            if (next) diff += Math.abs(getMidi(next) - nPitch);
            if (!prev && !next) diff = Math.abs(60 - nPitch); // Default to middle C distance

            if (diff < minPitchDiff) {
                minPitchDiff = diff;
                bestV = v;
            }
        }
        
        voiceTracks[bestV].push(note);
        assignedNotes.add(note);
        (note as any).voiceIndex = bestV;
    });

    voiceTracks.forEach(t => t.sort((a,b) => getTicks(a) - getTicks(b)));
    return voiceTracks;
}
