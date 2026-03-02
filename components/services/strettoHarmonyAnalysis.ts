
import { CHORD_SHAPES, SCORING } from './strettoConstants';
import { NOTE_NAMES } from './midiCore';

export interface StrettoHarmonyResult {
    reward: number;
    penalty: number;
    chords: string[]; // List of unique detected chord names for display
}

interface InternalNoteState {
    pitch: number;
    dur16: number; // Remaining duration in 16th notes
}

interface ChordMatchResult {
    name: string;
    rootIndex: number; // 0-11 relative to the input set, needs context to resolve absolute name
    matched: number;
    nct: number;
    full: boolean;
}

// Memoization Cache: 12-bit integer (Pitch Class Set) -> Best Chord Match Template
const CHORD_CACHE = new Map<number, ChordMatchResult | null>();

function getPitchSetBitmask(pitches: number[]): number {
    let mask = 0;
    for (const p of pitches) {
        mask |= (1 << (p % 12));
    }
    return mask;
}

// Core matching logic (Heavy)
function computeBestChord(pitches: number[]): ChordMatchResult | null {
    const uniquePCs = Array.from(new Set(pitches.map(p => p % 12)));
    if (uniquePCs.length < 2) return null;

    let bestMatch = null;
    let bestScore = -Infinity;

    for (const root of uniquePCs) {
        const intervals = uniquePCs.map(pc => (pc - root + 12) % 12);
        
        for (const shape of CHORD_SHAPES) {
            const matchedIntervals = intervals.filter(i => shape.intervals.includes(i));
            const nctCount = intervals.length - matchedIntervals.length;
            
            let requiredPresent = true;
            
            // Check 3rd (3 or 4) - Mandatory
            const has3rd = matchedIntervals.includes(3) || matchedIntervals.includes(4);
            if (!has3rd) continue; 

            // Check 5th
            const has5th = matchedIntervals.includes(7) || matchedIntervals.includes(6) || matchedIntervals.includes(8);
            
            let isFull = has3rd && has5th;
            if (shape.name.includes('7') || shape.name.includes('9')) {
                const has7 = matchedIntervals.includes(10) || matchedIntervals.includes(11) || matchedIntervals.includes(9);
                if (!has7) requiredPresent = false; 
                else isFull = isFull && true;
            }

            if (!requiredPresent) continue;

            const score = (matchedIntervals.length * 10) - (nctCount * 15);
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = { 
                    name: shape.name, 
                    rootIndex: root,
                    matched: matchedIntervals.length, 
                    nct: nctCount,
                    full: isFull 
                };
            }
        }
    }
    return bestMatch;
}

// Memoized Wrapper (Fast)
function identifyBestChordMemoized(pitches: number[]): ChordMatchResult | null {
    const mask = getPitchSetBitmask(pitches);
    if (CHORD_CACHE.has(mask)) {
        return CHORD_CACHE.get(mask)!;
    }
    const result = computeBestChord(pitches);
    CHORD_CACHE.set(mask, result);
    return result;
}

/**
 * Analyzes the harmonic content of a timeline using optimized caching.
 * Logic:
 * - 2+ Voices: Attempt to identify and report chord names.
 * - 3+ Voices: Apply scoring (Rewards/Penalties).
 * - FILTER: Only reports chords that persist for >= 1 Beat (4 x 16th notes).
 */
export function analyzeStrettoHarmony(
    timeline: { [tick16: number]: { [voiceIdx: number]: InternalNoteState } },
    ticks: number[]
): StrettoHarmonyResult {
    let harmonicReward = 0;
    let harmonicPenalty = 0;
    const detectedChordsMap = new Map<string, number>(); // Name -> Duration (16ths)

    if (ticks.length === 0) return { reward: 0, penalty: 0, chords: [] };

    for (const t of ticks) {
        const activeVoiceMap = timeline[t];
        if (!activeVoiceMap) continue;

        const activeIndices = Object.keys(activeVoiceMap).map(Number);
        const activeCount = activeIndices.length;

        // Threshold 1: Detection (2 or more voices)
        if (activeCount >= 2) {
            const longPitches: number[] = [];
            activeIndices.forEach(v => {
                const noteData = activeVoiceMap[v];
                if (noteData.dur16 >= SCORING.HARMONY_MIN_DURATION_16THS) {
                    longPitches.push(noteData.pitch);
                }
            });

            if (longPitches.length >= 2) {
                const match = identifyBestChordMemoized(longPitches);
                
                if (match) {
                    // Resolve absolute root name
                    const rootName = NOTE_NAMES[match.rootIndex % 12];
                    const fullName = `${rootName} ${match.name}`;
                    
                    // Accumulate duration for this chord
                    // Each step in timeline is a 16th note (from strettoScoring.ts logic)
                    detectedChordsMap.set(fullName, (detectedChordsMap.get(fullName) || 0) + 1);

                    // Threshold 2: Scoring (3 or more voices)
                    if (activeCount >= 3) {
                        // Normalized: Score per BEAT. Each loop step is 1/16th (0.25 beat).
                        if (match.full) {
                            harmonicReward += (0.25) * SCORING.HARMONY_FULL_CHORD_REWARD; 
                        }
                        if (match.nct > 0) {
                            harmonicPenalty += (0.25) * (match.nct * SCORING.HARMONY_NCT_PENALTY_MULT);
                        }
                    }
                }
            }
        }
    }

    // Filter: Only include chords that existed for at least 1 Beat (4 x 16th notes)
    const validChords = Array.from(detectedChordsMap.entries())
        .filter(([_, dur]) => dur >= 4)
        .map(([name]) => name)
        .slice(0, 8); // Return up to 8 unique significant chords

    return {
        reward: harmonicReward,
        penalty: harmonicPenalty,
        chords: validChords
    };
}
