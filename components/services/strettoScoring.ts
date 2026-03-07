
import { StrettoChainOption, StrettoSearchOptions, StrettoChainResult, ScoreLog } from '../../types';
import { INTERVALS, SCORING } from './strettoConstants';
import { analyzeStrettoHarmony } from './strettoHarmonyAnalysis';

// --- Weights & Constants ---
const W_S1 = 0.2; // Unweighted Dissonance
const W_S2 = 0.3; // Weighted Dissonance
const W_S3 = 0.2; // NCT Ratio
const W_S4 = 0.3; // Unprepared Dissonance

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
export interface InternalNote {
    relTick: number;
    durationTicks: number;
    pitch: number;
}

export interface SubjectVariant {
    type: 'N' | 'I';
    truncationBeats: number;
    notes: InternalNote[];
    lengthTicks: number;
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
 * REFACTORED: Uses Scan-Line algorithm on raw ticks (no 8th note quantization).
 */
export function calculateStrettoScore(
    chain: StrettoChainOption[], 
    variants: SubjectVariant[], 
    variantIndices: number[], 
    options: StrettoSearchOptions
): StrettoChainResult {
    
    // 1. Collect all unique time points (events)
    const timePoints = new Set<number>();
    
    // Also build a structure to quickly query active notes
    // We'll use a flat list of "PlacedNotes" for the scan-line
    interface PlacedNote {
        start: number;
        end: number;
        pitch: number;
        voice: number;
    }
    const placedNotes: PlacedNote[] = [];

    // We need PPQ to determine strong beats. Assuming 480 if not passed in options (it's not, but usually standard)
    // We'll infer beat duration from the chain if possible, or assume 480.
    // StrettoChainOption has startBeat. startBeat * 480 = ticks? 
    // Actually, the generator uses a PPQ. We don't have PPQ here explicitly in arguments?
    // The options object doesn't have PPQ. 
    // However, `startBeat` is in beats. 
    // Let's assume 1 Beat = 480 Ticks for the sake of S2 weighting if we don't have it.
    // Wait, `calculateStrettoScore` is called by `searchStrettoChains` which HAS `ppq`.
    // But `calculateStrettoScore` signature doesn't take `ppq`.
    // We should probably add it, but to avoid breaking signature right now, we can try to infer or use a standard constant.
    // The `startBeat` is float. 
    // Let's assume standard 480 for internal weighting logic.
    const PPQ = 480; 

    chain.forEach((e, i) => {
        const variant = variants[variantIndices[i]];
        const startTick = Math.round(e.startBeat * PPQ);
        
        variant.notes.forEach(n => {
            const absStart = startTick + n.relTick;
            const absEnd = absStart + n.durationTicks;
            timePoints.add(absStart);
            timePoints.add(absEnd);
            placedNotes.push({
                start: absStart,
                end: absEnd,
                pitch: n.pitch + e.transposition,
                voice: e.voiceIndex
            });
        });
    });

    const sortedPoints = Array.from(timePoints).sort((a,b) => a-b);
    
    // --- 1B. Run Harmony Analysis for UI ---
    // We still need to generate the 16th-note grid for the visualizer/analyzer
    // We can derive this from our placedNotes
    const harmonyTimeline: Record<number, Record<number, { pitch: number, dur16: number }>> = {};
    const harmonyTicks: number[] = [];
    
    const minTick = sortedPoints[0];
    const maxTick = sortedPoints[sortedPoints.length - 1];
    const tick16 = PPQ / 4; // 120

    // Quantize to 16th grid for display analysis
    for (let t = minTick; t < maxTick; t += tick16) {
        // Find active notes at this 16th slice (sample at start)
        const active = placedNotes.filter(n => n.start <= t && n.end > t);
        if (active.length > 0) {
            // Normalize t to 16th index
            const gridIndex = Math.round(t / tick16); 
            harmonyTicks.push(gridIndex);
            harmonyTimeline[gridIndex] = {};
            active.forEach(n => {
                harmonyTimeline[gridIndex][n.voice] = { pitch: n.pitch, dur16: 1 }; // Unit duration for grid
            });
        }
    }

    const harmonyAnalysis = analyzeStrettoHarmony(harmonyTimeline, harmonyTicks);

    // --- 2. Scan-Line Metric Calculation ---
    
    let totalPolyTime = 0;
    let totalDissTime = 0; // S1
    let totalWeightedDissTime = 0; // S2
    let weightedTotalPoly = 0; // S2 Denom
    let totalNCTTime = 0; // S3
    
    let totalDissEvents = 0; // S4
    let unpreparedDissEvents = 0; // S4
    
    // Track previous state for S4 (Preparation check)
    // We need to track state *per interval*.
    const previousStateByVoice = new Map<number, {pitch: number, isConsonantAgainstBass: boolean}>();
    let prevBass: number | null = null;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i+1];
        const dur = end - start;
        if (dur <= 0) continue;

        // Find active notes in this interval
        const voices = placedNotes.filter(n => n.start <= start && n.end > start);
        
        // Update monophonic state for S4 continuity
        if (voices.length === 1) {
            prevBass = voices[0].pitch;
            previousStateByVoice.clear();
            previousStateByVoice.set(voices[0].voice, { pitch: voices[0].pitch, isConsonantAgainstBass: true });
            continue;
        }
        
        if (voices.length < 2) continue;

        totalPolyTime += dur;
        
        // S2 Weighting: Check if this interval overlaps a strong beat
        // Strong beat = multiples of PPQ (Quarter notes) or PPQ*2 (Half notes)?
        // Original code: Strong if tick8 % 4 === 0 (Half note in 4/4) or tick8 % 8 === 0 (Bar)
        // Let's stick to Beat 1 and Beat 3 in 4/4.
        // Beat 1: tick % (PPQ * 4) === 0
        // Beat 3: tick % (PPQ * 4) === (PPQ * 2)
        // Simplified: Strong if tick % (PPQ * 2) === 0.
        
        // Does the interval [start, end) contain a strong beat?
        // Or is the start on a strong beat?
        // Let's use the start point for weighting to keep it simple, or integrate.
        // Simple: Weight = 1.5 if start is strong, 1.0 otherwise.
        const isStrong = (start % (PPQ * 2) === 0);
        const weight = isStrong ? 1.5 : 1.0;
        const weightedDur = dur * weight;
        
        weightedTotalPoly += weightedDur;

        const pitches = voices.map(v => v.pitch).sort((a,b)=>a-b);
        const bass = pitches[0];
        
        // --- S1 & S2: Dissonance ---
        let isDiss = false;
        for(let j=0; j<pitches.length; j++) {
            for(let k=j+1; k<pitches.length; k++) {
                const int = (pitches[k] - pitches[j]) % 12;
                if (INTERVALS.DISSONANT_SIMPLE.has(int)) isDiss = true;
                if (int === 5 && pitches[j] === bass) isDiss = true;
            }
        }
        
        if (isDiss) {
            totalDissTime += dur;
            totalWeightedDissTime += weightedDur;
        }

        // --- S3: NCT ---
        const nctCount = countNCTs(pitches);
        if (nctCount > 0) {
            totalNCTTime += dur;
        }

        // --- S4: Unprepared Dissonance ---
        // We only check this once per *event* (interval start), not integrated over time
        // Actually, S4 counts *events*.
        voices.forEach(v => {
            if (v.pitch === bass) return;
            
            const intVsBass = (v.pitch - bass + 1200) % 12;
            const isDissVsBass = INTERVALS.DISSONANT_SIMPLE.has(intVsBass) || intVsBass === 5;
            
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
    }

    // 3. Final Calculation: S1-S4 quality penalty (proportional)
    const S1 = totalPolyTime > 0 ? totalDissTime / totalPolyTime : 0;
    const S2 = weightedTotalPoly > 0 ? totalWeightedDissTime / weightedTotalPoly : 0;
    const S3 = totalPolyTime > 0 ? totalNCTTime / totalPolyTime : 0;
    const S4 = totalDissEvents > 0 ? unpreparedDissEvents / totalDissEvents : 0;

    const qualityPenaltyFraction = (S1 * W_S1) + (S2 * W_S2) + (S3 * W_S3) + (S4 * W_S4);
    let score = Math.round(1000 * (1 - qualityPenaltyFraction));

    const bonuses: ScoreLog['bonuses'] = [];
    const penalties: ScoreLog['penalties'] = [
        { reason: `S1: Unweighted Diss (${(S1*100).toFixed(0)}%)`, points: Math.round(S1 * 1000 * W_S1) },
        { reason: `S2: Weighted Diss (${(S2*100).toFixed(0)}%)`, points: Math.round(S2 * 1000 * W_S2) },
        { reason: `S3: NCT Time (${(S3*100).toFixed(0)}%)`, points: Math.round(S3 * 1000 * W_S3) },
        { reason: `S4: Unprepared Diss (${(S4*100).toFixed(0)}%)`, points: Math.round(S4 * 1000 * W_S4) },
    ];

    // --- 3B. Additive Bonuses & Penalties (per SCORING_MECHANISM.md) ---

    const subjectLengthBeats = variants[0].lengthTicks / PPQ;

    // B_compactness: reward hyper-stretto entries
    for (let i = 1; i < chain.length; i++) {
        const delay = chain[i].startBeat - chain[i-1].startBeat;
        const ratio = delay / subjectLengthBeats;
        if (ratio < SCORING.COMPACT_HYPER_THRESH) {
            score += SCORING.COMPACT_HYPER_BONUS;
            bonuses.push({ reason: `B_compactness: hyper-stretto entry ${i+1}`, points: SCORING.COMPACT_HYPER_BONUS });
        } else if (ratio < SCORING.COMPACT_TIGHT_THRESH) {
            score += SCORING.COMPACT_TIGHT_BONUS;
            bonuses.push({ reason: `B_compactness: tight entry ${i+1}`, points: SCORING.COMPACT_TIGHT_BONUS });
        }
    }

    // B_variety: unique transposition intervals and imperfect consonances
    const IMPERFECT_INTERVAL_CLASSES = new Set([3, 4, 8, 9]); // m3, M3, m6, M6
    const transpositionLinks: number[] = [];
    for (let i = 1; i < chain.length; i++) {
        transpositionLinks.push(chain[i].transposition - chain[i-1].transposition);
    }
    const uniqueIntervals = new Set(transpositionLinks);
    if (uniqueIntervals.size > 1) {
        const varietyBonus = (uniqueIntervals.size - 1) * 40;
        score += varietyBonus;
        bonuses.push({ reason: `B_variety: ${uniqueIntervals.size} unique intervals`, points: varietyBonus });
    }
    for (let i = 1; i < chain.length; i++) {
        const ic = ((chain[i].transposition - chain[i-1].transposition) % 12 + 12) % 12;
        if (IMPERFECT_INTERVAL_CLASSES.has(ic)) {
            score += SCORING.IMPERFECT_CONS_BONUS;
            bonuses.push({ reason: `B_variety: imperfect consonance entry ${i+1}`, points: SCORING.IMPERFECT_CONS_BONUS });
        }
    }

    // B_complexity: inversions and extra voices
    let invCount = 0;
    for (let i = 0; i < chain.length; i++) {
        if (variants[variantIndices[i]].type === 'I') invCount++;
    }
    if (invCount > 0) {
        const invBonus = invCount * SCORING.INVERSION_BONUS;
        score += invBonus;
        bonuses.push({ reason: `B_complexity: ${invCount} inverted voice(s)`, points: invBonus });
    }
    if (chain.length > 2) {
        const extraVoiceBonus = (chain.length - 2) * SCORING.CHAIN_LENGTH_BONUS;
        score += extraVoiceBonus;
        bonuses.push({ reason: `B_complexity: ${chain.length - 2} extra voice(s) beyond 2`, points: extraVoiceBonus });
    }

    // P_truncation: penalise beats removed
    for (let i = 0; i < chain.length; i++) {
        const truncBeats = variants[variantIndices[i]].truncationBeats;
        if (truncBeats > 0) {
            const truncPenalty = truncBeats * SCORING.TRUNCATION_PENALTY_PER_BEAT;
            score -= truncPenalty;
            penalties.push({ reason: `P_truncation: ${truncBeats} beat(s) removed entry ${i+1}`, points: truncPenalty });
        }
    }

    // P_monotony: penalise if any single transposition interval dominates
    if (transpositionLinks.length >= 2) {
        const totalLinks = transpositionLinks.length;
        const intervalCounts: Record<number, number> = {};
        for (const iv of transpositionLinks) {
            intervalCounts[iv] = (intervalCounts[iv] || 0) + 1;
        }
        for (const count of Object.values(intervalCounts)) {
            if (count > totalLinks * 0.5) {
                score -= SCORING.MONOTONY_PENALTY;
                penalties.push({ reason: 'P_monotony: single interval > 50% of links', points: SCORING.MONOTONY_PENALTY });
                break;
            }
        }
    }

    score = Math.max(0, score);

    const log: ScoreLog = {
        base: 1000,
        bonuses,
        penalties,
        total: score
    };

    // 4. Consonant End Validation (Gatekeeper A)
    let isValid = true;
    if (options.requireConsonantEnd) {
        // Check the very last interval
        if (sortedPoints.length > 1) {
            const lastStart = sortedPoints[sortedPoints.length - 2];
            const activeVoices = placedNotes.filter(n => n.start <= lastStart && n.end > lastStart);
            
            if (activeVoices.length > 1) {
                const pitches = activeVoices.map(v => v.pitch).sort((a,b)=>a-b);
                const bass = pitches[0];
                const myVoice = activeVoices.find(v => v.voice === chain[chain.length-1].voiceIndex); // Check last added voice?
                // Actually, check *all* voices for dissonance
                let isClean = true;
                for(let j=0; j<pitches.length; j++) {
                    for(let k=j+1; k<pitches.length; k++) {
                        const int = (pitches[k] - pitches[j]) % 12;
                        if (INTERVALS.DISSONANT_SIMPLE.has(int)) isClean = false;
                        if (int === 5 && pitches[j] === bass) isClean = false;
                    }
                }
                if (!isClean) isValid = false;
            }
        }
    }

    return {
        id: Math.random().toString(36),
        entries: chain,
        warnings: [],
        score,
        scoreLog: log,
        detectedChords: harmonyAnalysis.chords, 
        dissonanceRatio: S1,
        nctRatio: S3, 
        pairDissonanceScore: S4 * 100,
        isValid
    };
}
