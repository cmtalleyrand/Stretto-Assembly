import { RawNote } from '../../../../types';
import { HIANote, NoteLinks, CONSONANT_INTERVALS, DISSONANT_INTERVALS } from './hiaDefs';

export function getPhysicalBass(notes: RawNote[], time: number): number | null {
    let minMidi = Infinity;
    let found = false;
    for (const n of notes) {
        if (n.ticks <= time && (n.ticks + n.durationTicks) > time) {
            if (n.midi < minMidi) { minMidi = n.midi; found = true; }
        }
    }
    return found ? minMidi : null;
}

// Build linked list for voice leading checks
export function buildVoiceLinks(notes: RawNote[]): Map<RawNote, NoteLinks> {
    const links = new Map<RawNote, NoteLinks>();
    const byVoice: Record<number, RawNote[]> = {};
    
    // Group by voice
    notes.forEach(n => {
        const v = n.voiceIndex ?? -1;
        if (!byVoice[v]) byVoice[v] = [];
        byVoice[v].push(n);
    });

    // Link
    Object.values(byVoice).forEach(voiceNotes => {
        voiceNotes.sort((a,b) => a.ticks - b.ticks);
        for(let i=0; i<voiceNotes.length; i++) {
            const curr = voiceNotes[i];
            const prev = i > 0 ? voiceNotes[i-1] : null;
            const next = i < voiceNotes.length - 1 ? voiceNotes[i+1] : null;
            links.set(curr, { prev, next });
        }
    });
    return links;
}

/**
 * Strict Suspension Check
 */
export function isSuspension(
    note: HIANote, 
    beatStart: number, 
    beatEnd: number,
    prevBassMidi: number | null,
    currBassMidi: number | null,
    links: NoteLinks
): boolean {
    if (prevBassMidi === null || currBassMidi === null) return false;

    // RULE 0: Bass must move to create the dissonance against the held note
    // If bass is static, any dissonance is a passing tone or neighbor, not a suspension
    if (prevBassMidi === currBassMidi) return false;

    // --- 1. Preparation Check ---
    let prepMidi = -1;
    
    // Case A: Tied/Held Note (Started before beat)
    if (note.ticks < beatStart) {
        prepMidi = note.midi;
    }
    // Case B: Repeated Note (Started exactly on beat, check previous note)
    else if (note.ticks === beatStart) {
        // Must be a true legato repetition
        if (links.prev && links.prev.midi === note.midi && (links.prev.ticks + links.prev.durationTicks) >= beatStart) {
            prepMidi = links.prev.midi;
        } else {
            return false; // Not prepared
        }
    } else {
        return false; // Started late in the beat, not a suspension
    }

    // Verify Prep Consonance (against PREVIOUS bass)
    const prepInterval = (prepMidi - prevBassMidi + 1200) % 12;
    if (!CONSONANT_INTERVALS.includes(prepInterval)) return false;

    // --- 2. Dissonance Check ---
    // The current note must be dissonant against the NEW bass
    const currentInterval = (note.midi - currBassMidi + 1200) % 12;
    if (!DISSONANT_INTERVALS.includes(currentInterval)) return false;

    // --- 3. Resolution Check ---
    const resolutionNote = links.next;
    if (!resolutionNote) return false;

    // Verify Resolution Consonance against the CURRENT Bass
    // Resolution implies the bass stays static while the voice moves down
    const resInterval = (resolutionNote.midi - currBassMidi + 1200) % 12;
    if (!CONSONANT_INTERVALS.includes(resInterval)) return false;

    // Resolution: Must be a move, but stepwise constraint removed per user request.
    const move = resolutionNote.midi - note.midi;
    if (move === 0) return false; 

    return true;
}