
import { StrettoChainOption, StrettoSearchOptions, StrettoChainResult, ScoreLog } from '../../types';
import { INTERVALS } from './strettoConstants';
import { analyzeStrettoHarmony } from './strettoHarmonyAnalysis';

// --- Weights & Constants ---
const W_S1 = 0.2; // Unweighted Dissonance
const W_S2 = 0.3; // Weighted Dissonance
const W_S3 = 0.2; // NCT Ratio
const W_S4 = 0.3; // Unprepared Dissonance

const DISSONANT_INTERVALS = new Set([1, 2, 6, 10, 11]);

// Chord Templates (Pitch Class Sets) for Metric S3
const CHORD_TEMPLATES: number[][] = [
    [0, 4, 7],     // Major
    [0, 3, 7],     // Minor
    [0, 3, 6],     // Dim
    [0, 4, 8],     // Aug
    [0, 4, 7, 11], // Maj7
    [0, 3, 7, 10], // m7
    [0, 4, 7, 10], // Dom7
    [0, 3, 7, 11], // mM7
    [0, 3, 6, 9],  // dim7
    [0, 3, 6, 10], // m7b5
    [0, 4, 10],    // It+6
    [0, 4, 6, 10], // Fr+6
];

// Helper Interfaces for Internal Calculation
interface InternalNote {
    relTick8: number;
    dur8: number;
    pitch: number;
}

export interface SubjectVariant {
    type: 'N' | 'I';
    truncationBeats: number;
    notes: InternalNote[];
    length8: number;
}

function countNCTs(pitches: number[]): number {
    if (pitches.length === 0) return 0;
    const pcs = Array.from(new Set(pitches.map(p => p % 12)));
    const Q_len = pcs.length;
    
    let maxOverlap = 0;
    
    for (const template of CHORD_TEMPLATES) {
        for (let i = 0; i < 12; i++) {
            const shiftedTemplate = template.map(x => (x + i) % 12);
            let overlap = 0;
            for (const pc of pcs) {
                if (shiftedTemplate.includes(pc)) overlap++;
            }
            if (overlap > maxOverlap) maxOverlap = overlap;
        }
    }
    
    return Q_len - maxOverlap;
}

/**
 * Calculates the S1-S4 metrics for a generated chain.
 */
export function calculateStrettoScore(
    chain: StrettoChainOption[], 
    variants: SubjectVariant[], 
    variantIndices: number[], 
    options: StrettoSearchOptions,
    unitsPerBeat: number = 2
): StrettoChainResult {
    
    // 1. Build Timeline
    // Map tick -> active voices
    const timeline = new Map<number, {pitch: number, voice: number, dur8: number}[]>();
    let maxT = 0;

    chain.forEach((e, i) => {
        const variant = variants[variantIndices[i]];
        const start8 = Math.round(e.startBeat * unitsPerBeat);
        
        variant.notes.forEach(n => {
            for (let t=0; t<n.dur8; t++) {
                const tick = start8 + n.relTick8 + t;
                if (!timeline.has(tick)) timeline.set(tick, []);
                timeline.get(tick)!.push({ 
                    pitch: n.pitch + e.transposition, 
                    voice: e.voiceIndex,
                    dur8: n.dur8
                });
                if (tick > maxT) maxT = tick;
            }
        });
    });
    
    // --- 1B. Run Harmony Analysis for UI ---
    // Convert the 8th-note timeline to the 16th-note format required by analyzeStrettoHarmony
    const harmonyTimeline: Record<number, Record<number, { pitch: number, dur16: number }>> = {};
    const harmonyTicks: number[] = [];

    timeline.forEach((voices, t) => {
        const tick16 = Math.round((t / unitsPerBeat) * 4); // Convert adaptive grid index to 16th-grid
        harmonyTicks.push(tick16);
        harmonyTimeline[tick16] = {};
        voices.forEach(v => {
            harmonyTimeline[tick16][v.voice] = { pitch: v.pitch, dur16: v.dur8 * 2 };
        });
    });

    const harmonyAnalysis = analyzeStrettoHarmony(harmonyTimeline, harmonyTicks);

    const timePoints = Array.from(timeline.keys()).sort((a,b) => a-b);
    
    let totalPolyTime = 0;
    let totalDissTime = 0; // S1
    let totalWeightedDissTime = 0; // S2
    let weightedTotalPoly = 0; // S2 Denom
    let totalNCTTime = 0; // S3 (Time Based: Count slices where ANY NCT exists)
    
    let totalDissEvents = 0; // S4
    let unpreparedDissEvents = 0; // S4
    
    // Track previous state for S4 (Preparation check)
    const previousStateByVoice = new Map<number, {pitch: number, isConsonantAgainstBass: boolean}>();
    let prevBass: number | null = null;

    // 2. Iterate Timeline
    timePoints.forEach(t => {
        const voices = timeline.get(t)!;
        
        // Update monophonic state for S4 continuity
        if (voices.length === 1) {
            prevBass = voices[0].pitch;
            previousStateByVoice.clear();
            previousStateByVoice.set(voices[0].voice, { pitch: voices[0].pitch, isConsonantAgainstBass: true });
            return;
        }
        
        if (voices.length < 2) return;

        totalPolyTime++; 
        
        // S2 Weighting: Strong beat (bar-aligned quarter-level assumption)
        const isStrong = (t % unitsPerBeat === 0); 
        const weight = isStrong ? 1.5 : 1.0;
        weightedTotalPoly += weight;

        const pitches = voices.map(v => v.pitch).sort((a,b)=>a-b);
        const bass = pitches[0];
        
        // --- S1 & S2: Dissonance ---
        let isDiss = false;
        for(let i=0; i<pitches.length; i++) {
            for(let j=i+1; j<pitches.length; j++) {
                const int = (pitches[j] - pitches[i]) % 12;
                if (DISSONANT_INTERVALS.has(int)) isDiss = true;
                if (int === 5 && pitches[i] === bass) isDiss = true;
            }
        }
        
        if (isDiss) {
            totalDissTime++;
            totalWeightedDissTime += weight;
        }

        // --- S3: NCT (TIME BASED LOGIC) ---
        // If there is ANY NCT in this slice, mark the slice as "harmonic clutter"
        const nctCount = countNCTs(pitches);
        if (nctCount > 0) {
            totalNCTTime++;
        }

        // --- S4: Unprepared Dissonance ---
        voices.forEach(v => {
            if (v.pitch === bass) return;
            
            const intVsBass = (v.pitch - bass + 1200) % 12;
            const isDissVsBass = DISSONANT_INTERVALS.has(intVsBass) || intVsBass === 5;
            
            if (isDissVsBass) {
                totalDissEvents++;
                
                // P1: Must have been consonant previously
                const prevState = previousStateByVoice.get(v.voice);
                let prepared = false;
                
                if (prevState && prevState.isConsonantAgainstBass) {
                    // P2: Single motion constraint
                    const bassMoved = (prevBass !== null && prevBass !== bass);
                    const voiceMoved = (prevState.pitch !== v.pitch);
                    
                    // XOR logic: Only one should move for strict preparation
                    if ((!voiceMoved && bassMoved) || (voiceMoved && !bassMoved)) {
                        prepared = true;
                    }
                }
                
                if (!prepared) {
                    unpreparedDissEvents++;
                }
            }
            // Update state
            previousStateByVoice.set(v.voice, { pitch: v.pitch, isConsonantAgainstBass: !isDissVsBass });
        });
        prevBass = bass;
    });

    // 3. Final Calculation
    const S1 = totalPolyTime > 0 ? totalDissTime / totalPolyTime : 0;
    const S2 = weightedTotalPoly > 0 ? totalWeightedDissTime / weightedTotalPoly : 0;
    // S3 Update: Time Based Ratio
    const S3 = totalPolyTime > 0 ? totalNCTTime / totalPolyTime : 0;
    
    const S4 = totalDissEvents > 0 ? unpreparedDissEvents / totalDissEvents : 0;

    const penalty = (S1 * W_S1) + (S2 * W_S2) + (S3 * W_S3) + (S4 * W_S4);
    const score = Math.max(0, Math.round(1000 * (1 - penalty)));

    const log: ScoreLog = { 
        base: 1000, 
        bonuses: [], 
        penalties: [
            { reason: `S1: Unweighted Diss (${(S1*100).toFixed(0)}%)`, points: Math.round(S1 * 1000 * W_S1) },
            { reason: `S2: Weighted Diss (${(S2*100).toFixed(0)}%)`, points: Math.round(S2 * 1000 * W_S2) },
            { reason: `S3: NCT Time (${(S3*100).toFixed(0)}%)`, points: Math.round(S3 * 1000 * W_S3) },
            { reason: `S4: Unprepared Diss (${(S4*100).toFixed(0)}%)`, points: Math.round(S4 * 1000 * W_S4) },
        ], 
        total: score 
    };

    // 4. Consonant End Validation (Gatekeeper A)
    let isValid = true;
    if (options.requireConsonantEnd) {
        chain.forEach((e, i) => {
            const variant = variants[variantIndices[i]];
            const end8 = Math.round(e.startBeat * unitsPerBeat) + variant.length8;
            const lastMoment = end8 - 1;
            
            const activeVoices = timeline.get(lastMoment);
            if (activeVoices && activeVoices.length > 1) {
                const pitches = activeVoices.map(v => v.pitch).sort((a,b)=>a-b);
                const bass = pitches[0];
                const myVoice = activeVoices.find(v => v.voice === e.voiceIndex);
                
                if (myVoice) {
                    let isClean = true;
                    if (myVoice.pitch === bass) {
                        for (const other of pitches) {
                            if (other === bass) continue;
                            const int = (other - bass) % 12;
                            if (DISSONANT_INTERVALS.has(int) || int === 5) isClean = false;
                        }
                    } else {
                        const int = (myVoice.pitch - bass) % 12;
                        if (DISSONANT_INTERVALS.has(int) || int === 5) isClean = false;
                    }
                    if (!isClean) isValid = false;
                }
            }
        });
    }

    return {
        id: Math.random().toString(36),
        entries: chain,
        warnings: [],
        score,
        scoreLog: log,
        detectedChords: harmonyAnalysis.chords, 
        dissonanceRatio: S1,
        nctRatio: S3, // Now populated with Time-Based metric
        pairDissonanceScore: S4 * 100,
        isValid
    };
}
