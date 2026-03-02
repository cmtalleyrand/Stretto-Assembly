
import { RawNote } from '../../types';

export interface AbcParseDiagnostics {
    normalizedKey: string | null;
    keyAccidentalCount: number;
    issues: string[];
}

export interface ParsedAbcData {
    notes: RawNote[];
    diagnostics: AbcParseDiagnostics;
}

// Standard ABC Pitch Mapping
// C = Middle C (MIDI 60)
// c = C5 (MIDI 72)
const BASE_PITCHES: Record<string, number> = {
    'C': 60, 'D': 62, 'E': 64, 'F': 65, 'G': 67, 'A': 69, 'B': 71,
    'c': 72, 'd': 74, 'e': 76, 'f': 77, 'g': 79, 'a': 81, 'b': 83
};

// Key Signature Definitions (Standard sharps/flats)
const KEY_SIGNATURES: Record<string, Record<string, number>> = {
    // Major Keys
    'C':  {},
    'G':  { 'f': 1,  'F': 1 },
    'D':  { 'f': 1,  'F': 1, 'c': 1, 'C': 1 },
    'A':  { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1 },
    'E':  { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1, 'd': 1, 'D': 1 },
    'B':  { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1, 'd': 1, 'D': 1, 'a': 1, 'A': 1 },
    'F#': { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1, 'd': 1, 'D': 1, 'a': 1, 'A': 1, 'e': 1, 'E': 1 },
    'C#': { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1, 'd': 1, 'D': 1, 'a': 1, 'A': 1, 'e': 1, 'E': 1, 'b': 1, 'B': 1 },
    'F':  { 'b': -1, 'B': -1 },
    'Bb': { 'b': -1, 'B': -1, 'e': -1, 'E': -1 },
    'Eb': { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1 },
    'Ab': { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1, 'd': -1, 'D': -1 },
    'Db': { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1, 'd': -1, 'D': -1, 'g': -1, 'G': -1 },
    'Gb': { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1, 'd': -1, 'D': -1, 'g': -1, 'G': -1, 'c': -1, 'C': -1 },
    'Cb': { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1, 'd': -1, 'D': -1, 'g': -1, 'G': -1, 'c': -1, 'C': -1, 'f': -1, 'F': -1 },
    
    // Minor Keys
    'Am':  {},
    'Em':  { 'f': 1,  'F': 1 },
    'Bm':  { 'f': 1,  'F': 1, 'c': 1, 'C': 1 },
    'F#m': { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1 },
    'C#m': { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1, 'd': 1, 'D': 1 },
    'G#m': { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1, 'd': 1, 'D': 1, 'a': 1, 'A': 1 },
    'D#m': { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1, 'd': 1, 'D': 1, 'a': 1, 'A': 1, 'e': 1, 'E': 1 },
    'A#m': { 'f': 1,  'F': 1, 'c': 1, 'C': 1, 'g': 1, 'G': 1, 'd': 1, 'D': 1, 'a': 1, 'A': 1, 'e': 1, 'E': 1, 'b': 1, 'B': 1 },
    'Dm':  { 'b': -1, 'B': -1 },
    'Gm':  { 'b': -1, 'B': -1, 'e': -1, 'E': -1 },
    'Cm':  { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1 },
    'Fm':  { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1, 'd': -1, 'D': -1 },
    'Bbm': { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1, 'd': -1, 'D': -1, 'g': -1, 'G': -1 },
    'Ebm': { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1, 'd': -1, 'D': -1, 'g': -1, 'G': -1, 'c': -1, 'C': -1 },
    'Abm': { 'b': -1, 'B': -1, 'e': -1, 'E': -1, 'a': -1, 'A': -1, 'd': -1, 'D': -1, 'g': -1, 'G': -1, 'c': -1, 'C': -1, 'f': -1, 'F': -1 },
};

function getBaseMidi(char: string): number {
    return BASE_PITCHES[char] || 60;
}

export function extractKeyFromAbc(abc: string): { root: number, mode: string } | null {
    const lines = abc.split(/\r?\n/);
    for (const line of lines) {
        const m = line.trim().match(/^K\s*:\s*(.*)/i);
        if (m) {
            const val = m[1].trim();
            // Regex to grab pitch (Letter + optional acc) + remainder (mode)
            const pMatch = val.match(/^([A-G][#b]?)(.*)/i);
            if (pMatch) {
                const pitchStr = pMatch[1];
                let modeStr = pMatch[2].trim().toLowerCase();
                
                // Determine Root
                const baseLetter = pitchStr.charAt(0).toUpperCase();
                let root = getBaseMidi(baseLetter) % 12;
                
                if (pitchStr.length > 1) {
                    const acc = pitchStr.charAt(1);
                    if (acc === '#') root = (root + 1) % 12;
                    if (acc === 'b') root = (root + 11) % 12;
                }
                
                // Determine Mode
                let mode = 'Major'; // Default
                if ((modeStr.startsWith('m') && !modeStr.startsWith('mix') && !modeStr.startsWith('maj')) || modeStr === 'min') {
                    mode = 'Natural Minor';
                }
                if (modeStr.includes('maj')) mode = 'Major';
                if (modeStr.includes('dor')) mode = 'Dorian';
                if (modeStr.includes('phr')) mode = 'Phrygian';
                if (modeStr.includes('lyd')) mode = 'Lydian';
                if (modeStr.includes('mix')) mode = 'Mixolydian';
                if (modeStr.includes('loc')) mode = 'Locrian';
                
                return { root, mode };
            }
        }
    }
    return null;
}

export function parseSimpleAbc(abcString: string, ppq: number = 480): RawNote[] {
    return parseAbcWithDiagnostics(abcString, ppq).notes;
}

export function parseAbcWithDiagnostics(abcString: string, ppq: number = 480): ParsedAbcData {
    const lines = abcString.split(/\r?\n/);
    
    // Default Context
    let keyAccidentals: Record<string, number> = {};
    let normalizedKey: string | null = null;
    let defaultNoteLength = 1/8; 
    let tempo = 120;
    const issues: string[] = [];
    
    const notes: RawNote[] = [];
    let currentTick = 0;

    // 1. Parse Headers
    // Initialize to lines.length so that if no body is found, we don't parse headers as body
    let bodyStartLine = lines.length; 

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) continue;
        
        // Relaxed regex: Allows space before colon (e.g., "K : F#")
        const headerMatch = line.match(/^([A-Za-z])\s*:\s*(.*)/);
        
        if (headerMatch) {
            const field = headerMatch[1].toUpperCase();
            const value = headerMatch[2].trim();
            
            if (field === 'K') {
                const pMatch = value.match(/^([A-G][#b]?)(.*)/i);
                if (pMatch) {
                    let pitchStr = pMatch[1].charAt(0).toUpperCase();
                    if (pMatch[1].length > 1) pitchStr += pMatch[1].charAt(1).toLowerCase();
                    
                    let modeStr = pMatch[2].trim().toLowerCase();
                    let isMinor = false;
                    if ((modeStr.startsWith('m') && !modeStr.startsWith('mix') && !modeStr.startsWith('maj')) || modeStr === 'min') {
                        isMinor = true;
                    }
                    
                    const normalized = pitchStr + (isMinor ? 'm' : '');
                    normalizedKey = normalized;
                    if (KEY_SIGNATURES[normalized]) {
                        keyAccidentals = { ...KEY_SIGNATURES[normalized] };
                    } else {
                        keyAccidentals = {};
                        issues.push(`K:${value} is not recognised; using C/Am accidentals (none).`);
                    }
                } else {
                    issues.push(`Could not parse key signature from K:${value}.`);
                }
            } else if (field === 'L') {
                const parts = value.split('/');
                if (parts.length === 2) {
                    const num = parseFloat(parts[0]);
                    const den = parseFloat(parts[1]);
                    if (!isNaN(num) && !isNaN(den) && den !== 0) defaultNoteLength = num / den;
                }
            } else if (field === 'Q') {
                if (value.includes('=')) tempo = parseFloat(value.split('=')[1]);
                else tempo = parseFloat(value);
            }
        } else {
            // Stop at first non-header line (likely notes or comment)
            if (!line.startsWith('%')) {
                bodyStartLine = i;
                break;
            }
        }
    }

    // 2. Parse Notes
    const bodyText = lines.slice(bodyStartLine).join(' ');
    // Match Accidental + Note + Octave + Duration
    const regex = /([\^=_]*)?([a-gA-GzZxX])([,']*)?([0-9]*\/?[0-9]*)?/g;
    
    let match;
    const wholeNoteTicks = ppq * 4;

    while ((match = regex.exec(bodyText)) !== null) {
        if (match[0] === '') continue;

        const accStr = match[1] || '';
        const letter = match[2];
        const octStr = match[3] || '';
        const lenStr = match[4] || '';

        if (!letter) continue;

        // Calculate Duration
        let durMult = 1.0;
        if (lenStr) {
            if (lenStr === '/') durMult = 0.5;
            else if (lenStr === '//') durMult = 0.25;
            else if (lenStr.startsWith('/')) {
                durMult = 1 / parseFloat(lenStr.substring(1));
            } else if (lenStr.includes('/')) {
                const [n, d] = lenStr.split('/');
                const num = n === '' ? 1 : parseFloat(n);
                const den = d === '' ? 1 : parseFloat(d); 
                durMult = num / den;
            } else {
                durMult = parseFloat(lenStr);
            }
        }

        const durationTicks = Math.round(wholeNoteTicks * defaultNoteLength * durMult);

        if (['z', 'Z', 'x', 'X'].includes(letter)) {
            currentTick += durationTicks;
            continue;
        }

        let midi = getBaseMidi(letter);
        let accidentalOffset = 0;
        
        // --- Accidental Logic ---
        
        if (accStr !== '') {
            if (accStr.includes('^^')) accidentalOffset = 2;
            else if (accStr.includes('^')) accidentalOffset = 1;
            else if (accStr.includes('__')) accidentalOffset = -2;
            else if (accStr.includes('_')) accidentalOffset = -1;
            else if (accStr.includes('=')) accidentalOffset = 0; 
        } 
        else if (keyAccidentals[letter] !== undefined) {
            accidentalOffset = keyAccidentals[letter];
        }

        midi += accidentalOffset;

        // Apply Octaves
        if (octStr) {
            const up = (octStr.match(/'/g) || []).length;
            const down = (octStr.match(/,/g) || []).length;
            midi += (up * 12) - (down * 12);
        }

        notes.push({
            midi,
            ticks: currentTick,
            durationTicks,
            velocity: 0.8,
            name: `${accStr}${letter}${octStr}`,
            isOrnament: false
        });

        currentTick += durationTicks;
    }

    if (!normalizedKey) {
        issues.push('No K: header found; defaulting to C/Am accidentals (none).');
    }

    if (notes.length === 0) {
        issues.push('No note tokens were parsed from the ABC body.');
    }

    return {
        notes,
        diagnostics: {
            normalizedKey,
            keyAccidentalCount: Object.keys(keyAccidentals).length / 2,
            issues,
        }
    };
}

export function convertRawNotesToAbc(
    notes: RawNote[],
    options: { ppq: number; ts: { num: number; den: number }; truncateBeats?: number }
): string {
    const sorted = [...notes].sort((a, b) => a.ticks - b.ticks);
    const beatsToKeep = options.truncateBeats && options.truncateBeats > 0 ? options.truncateBeats : null;
    const maxTick = beatsToKeep ? Math.round(beatsToKeep * options.ppq) : null;

    const toPitch = (midi: number): string => {
        const semitone = ((midi % 12) + 12) % 12;
        const octave = Math.floor(midi / 12) - 1;
        const abcNames = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
        let p = abcNames[semitone];
        const letterIndex = p.startsWith('^') ? 1 : 0;
        const letter = p[letterIndex];
        const accidental = p.startsWith('^') ? '^' : '';
        let pitchLetter = octave >= 5 ? letter.toLowerCase() : letter;
        if (octave > 5) pitchLetter += "'".repeat(octave - 5);
        if (octave < 4) pitchLetter += ','.repeat(4 - octave);
        return accidental + pitchLetter;
    };

    const toLen = (ticks: number): string => {
        const q = ticks / options.ppq;
        if (Math.abs(q - 1) < 0.001) return '';
        if (Math.abs(q - 0.5) < 0.001) return '/2';
        if (Math.abs(q - 0.25) < 0.001) return '/4';
        if (Number.isInteger(q)) return `${q}`;
        return `${Math.round(q * 100)}/100`;
    };

    let body = '';
    let cursorTick = 0;
    sorted.forEach((note) => {
        if (maxTick !== null && note.ticks >= maxTick) return;
        const startTick = note.ticks;
        const endTick = maxTick !== null ? Math.min(note.ticks + note.durationTicks, maxTick) : note.ticks + note.durationTicks;
        const duration = Math.max(1, endTick - startTick);
        if (startTick > cursorTick) {
            body += `z${toLen(startTick - cursorTick)} `;
        }
        body += `${toPitch(note.midi)}${toLen(duration)} `;
        cursorTick = Math.max(cursorTick, endTick);
    });

    return `X:1\nM:${options.ts.num}/${options.ts.den}\nL:1/4\nQ:120\nK:C\n${body.trim()}`;
}
