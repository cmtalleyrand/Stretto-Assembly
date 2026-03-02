

// Spelling Maps adapted from standard theory
const SPELLING_MAPS: { [keyRoot: number]: string[] } = {
    0: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'], // C
    1: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'], // Db
    2: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], // D
    3: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], // Eb
    4: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], // E
    5: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], // F
    6: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], // F#
    7: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'], // G
    8: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'], // Ab
    9: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], // A
    10: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], // Bb
    11: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], // B
};

export function getPitchName(midi: number, root: number = 0, mode: string = 'Major'): string {
    const r = (root % 12 + 12) % 12;
    const spellingMap = SPELLING_MAPS[r] || SPELLING_MAPS[0];
    const midiInt = Math.round(midi);
    const noteIndex = (midiInt % 12 + 12) % 12; 
    const noteName = spellingMap[noteIndex];
    
    if (!noteName) return `N${midiInt}`; 

    const octave = Math.floor(midiInt / 12) - 1;
    return `${noteName}${octave}`;
}

export function getStrictPitchName(midi: number): string {
    return getPitchName(midi, 0); 
}

/**
 * Returns a standard musical interval label.
 * Fix: Cleaned up compound interval formatting (e.g., P12 instead of P5 + 1 8va)
 */
export function getIntervalLabel(semitones: number): string {
    const abs = Math.abs(semitones);
    const signStr = semitones < 0 ? '-' : semitones > 0 ? '+' : '';
    
    if (abs === 0) return 'P1';

    // Map for simple intervals (0-11)
    const map: Record<number, string> = {
        0: 'P8', 1: 'm2', 2: 'M2', 3: 'm3', 4: 'M3', 5: 'P4', 6: 'TT', 
        7: 'P5', 8: 'm6', 9: 'M6', 10: 'm7', 11: 'M7'
    };

    if (abs <= 12) {
        // Simple case: 0-11 mapped, 12 is P8
        return `${signStr}${map[abs % 12]}`;
    }

    // Compound Intervals
    const octaves = Math.floor(abs / 12);
    const simple = abs % 12;
    
    // Standard names for common compounds
    // P8 + P5 = 12 + 7 = 19 (P12)
    if (simple === 7 && octaves === 1) return `${signStr}P12`;
    // P8 + P8 = 24 (P15)
    if (simple === 0 && octaves === 2) return `${signStr}P15`;
    // P8 + P4 = 12 + 5 = 17 (P11)
    if (simple === 5 && octaves === 1) return `${signStr}P11`;
    // P8 + M3 = 12 + 4 = 16 (M10)
    if (simple === 4 && octaves === 1) return `${signStr}M10`;

    // Fallback: Base + Octave
    // Format: "+P5(+8va)"
    return `${signStr}${map[simple]}(+${octaves} 8va)`;
}

export function getRhythmAbbreviation(durationTicks: number, ppq: number): string {
    const quarter = ppq;
    const ratio = durationTicks / quarter;
    const closeTo = (val: number, target: number) => Math.abs(val - target) < 0.05;

    if (closeTo(ratio, 4.0)) return 'w'; 
    if (closeTo(ratio, 3.0)) return 'h.'; 
    if (closeTo(ratio, 2.0)) return 'h'; 
    if (closeTo(ratio, 1.5)) return 'q.'; 
    if (closeTo(ratio, 1.0)) return 'q'; 
    if (closeTo(ratio, 0.75)) return 'e.'; 
    if (closeTo(ratio, 0.5)) return 'e'; 
    if (closeTo(ratio, 0.375)) return 's.'; 
    if (closeTo(ratio, 0.25)) return 's'; 
    if (closeTo(ratio, 0.125)) return 't'; // 32nd
    if (closeTo(ratio, 0.333)) return 'et'; 
    if (closeTo(ratio, 0.166)) return 'st'; 
    if (closeTo(ratio, 0.666)) return 'qt'; 

    return '?'; 
}

export const SPELLING_PREAMBLE = `
**SPELLING NOTICE**
Pitch spelling follows the predicted key context. 
WARNING: Enharmonic equivalents (e.g. D# vs Eb) may be chosen for consistency. 
Focus on pitch content (intervals) over strict spelling.
`;

export const RHYTHM_KEY = `
**LEGEND**
*   **Bold Note**: New Attack (Note On)
*   **-** : Hold (Sustain from previous)
*   **z** : Rest
*   **=** : Chord Sustain (Harmony ditto)
*   Rhythm: w=Whole, h=Half, q=Quarter, e=Eighth, s=16th, t=32nd
*   Dotted: h., q., e., s.
`;
