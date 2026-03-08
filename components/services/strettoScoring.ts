
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
 * Calculates the S1-S4 metrics + additive bonuses/penalties for a generated chain.
 * Hybrid scoring: S1-S4 ratio base + structural bonuses/penalties + polyphony density.
 */
export function calculateStrettoScore(
    chain: StrettoChainOption[],
    variants: SubjectVariant[],
    variantIndices: number[],
    options: StrettoSearchOptions,
    ppq: number = 480
): StrettoChainResult {

    const PPQ = ppq;

    // 1. Collect all unique time points and place notes
    const timePoints = new Set<number>();

    interface PlacedNote {
        start: number;
        end: number;
        pitch: number;
        voice: number;
    }
    const placedNotes: PlacedNote[] = [];

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

    // --- 1B. Run Harmony Analysis ---
    const harmonyTimeline: Record<number, Record<number, { pitch: number, dur16: number }>> = {};
    const harmonyTicks: number[] = [];

    const minTick = sortedPoints[0];
    const maxTick = sortedPoints[sortedPoints.length - 1];
    const tick16 = PPQ / 4;

    for (let t = minTick; t < maxTick; t += tick16) {
        const active = placedNotes.filter(n => n.start <= t && n.end > t);
        if (active.length > 0) {
            const gridIndex = Math.round(t / tick16);
            harmonyTicks.push(gridIndex);
            harmonyTimeline[gridIndex] = {};
            active.forEach(n => {
                harmonyTimeline[gridIndex][n.voice] = { pitch: n.pitch, dur16: 1 };
            });
        }
    }

    const harmonyAnalysis = analyzeStrettoHarmony(harmonyTimeline, harmonyTicks);

    // --- 2. Scan-Line Metric Calculation ---

    let totalPolyTime = 0;       // S1/S2 denominator (2+ voices)
    let totalDissTime = 0;       // S1
    let totalWeightedDissTime = 0; // S2
    let weightedTotalPoly = 0;   // S2 Denom
    let totalNCTTime = 0;        // S3 numerator
    let totalPoly3PlusTime = 0;  // S3 denominator (3+ voices only)

    let totalDissEvents = 0;     // S4
    let unpreparedDissEvents = 0; // S4

    // Polyphony density tracking
    let totalWeightedVoices = 0;
    let totalDuration = 0;

    const previousStateByVoice = new Map<number, {pitch: number, isConsonantAgainstBass: boolean}>();
    let prevBass: number | null = null;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i+1];
        const dur = end - start;
        if (dur <= 0) continue;

        const voices = placedNotes.filter(n => n.start <= start && n.end > start);

        // Accumulate polyphony density for ALL slices (including mono)
        totalWeightedVoices += voices.length * dur;
        totalDuration += dur;

        if (voices.length === 1) {
            prevBass = voices[0].pitch;
            previousStateByVoice.clear();
            previousStateByVoice.set(voices[0].voice, { pitch: voices[0].pitch, isConsonantAgainstBass: true });
            continue;
        }

        if (voices.length < 2) continue;

        totalPolyTime += dur;

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

        // --- S3: NCT (proportional, 3+ voices only) ---
        if (voices.length >= 3) {
            totalPoly3PlusTime += dur;
            const nctCount = countNCTs(pitches);
            if (nctCount > 0) {
                totalNCTTime += dur * (nctCount / pitches.length);
            }
        }

        // --- S4: Unprepared Dissonance ---
        voices.forEach(v => {
            if (v.pitch === bass) return;

            const intVsBass = (v.pitch - bass + 1200) % 12;
            const isDissVsBass = INTERVALS.DISSONANT_SIMPLE.has(intVsBass) || intVsBass === 5;

            if (isDissVsBass) {
                totalDissEvents++;

                const prevState = previousStateByVoice.get(v.voice);
                let prepared = false;

                if (prevState && prevState.isConsonantAgainstBass) {
                    const bassMoved = (prevBass !== null && prevBass !== bass);
                    const voiceMoved = (prevState.pitch !== v.pitch);

                    if ((!voiceMoved && bassMoved) || (voiceMoved && !bassMoved)) {
                        prepared = true;
                    }
                }

                if (!prepared) {
                    unpreparedDissEvents++;
                }
            }
            previousStateByVoice.set(v.voice, { pitch: v.pitch, isConsonantAgainstBass: !isDissVsBass });
        });
        prevBass = bass;
    }

    // 3. Final Calculation: S1-S4 quality penalty (proportional)
    const S1 = totalPolyTime > 0 ? totalDissTime / totalPolyTime : 0;
    const S2 = weightedTotalPoly > 0 ? totalWeightedDissTime / weightedTotalPoly : 0;
    const S3 = totalPoly3PlusTime > 0 ? totalNCTTime / totalPoly3PlusTime : 0;
    const S4 = totalDissEvents > 0 ? unpreparedDissEvents / totalDissEvents : 0;

    const qualityPenaltyFraction = (S1 * W_S1) + (S2 * W_S2) + (S3 * W_S3) + (S4 * W_S4);
    const U_quality = Math.round(
        SCORING.QUALITY_UTILITY_SCALE * (SCORING.QUALITY_NEUTRAL_PENALTY - qualityPenaltyFraction)
    );

    let score = U_quality;

    const bonuses: ScoreLog['bonuses'] = [];
    const penalties: ScoreLog['penalties'] = [
        { reason: `S1: Unweighted Diss (${(S1*100).toFixed(0)}%)`, points: Math.round(S1 * SCORING.QUALITY_COMPONENT_SCALE * W_S1) },
        { reason: `S2: Weighted Diss (${(S2*100).toFixed(0)}%)`, points: Math.round(S2 * SCORING.QUALITY_COMPONENT_SCALE * W_S2) },
        { reason: `S3: NCT Time (${(S3*100).toFixed(0)}%)`, points: Math.round(S3 * SCORING.QUALITY_COMPONENT_SCALE * W_S3) },
        { reason: `S4: Unprepared Diss (${(S4*100).toFixed(0)}%)`, points: Math.round(S4 * SCORING.QUALITY_COMPONENT_SCALE * W_S4) },
    ];

    // --- 3B. Additive Bonuses & Penalties ---

    const subjectLengthBeats = variants[0].lengthTicks / PPQ;
    const subjectLengthTicks = variants[0].lengthTicks;

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

    // B_variety: reward interval diversity between successive entries
    const transpositionLinks: number[] = [];
    for (let i = 1; i < chain.length; i++) {
        transpositionLinks.push(chain[i].transposition - chain[i-1].transposition);
    }
    const uniqueIntervals = new Set(transpositionLinks);
    if (uniqueIntervals.size > 1) {
        const varietyBonus = (uniqueIntervals.size - 1) * SCORING.DIST_VARIETY_BONUS;
        score += varietyBonus;
        bonuses.push({ reason: `B_variety: ${uniqueIntervals.size} unique intervals`, points: varietyBonus });
    }

    // B_variety (imperfect consonance): +30 per 3rd/6th entry
    let imperfectCount = 0;
    chain.forEach(e => {
        const ic = Math.abs(e.transposition % 12);
        if ([3, 4, 8, 9].includes(ic)) imperfectCount++;
    });
    if (imperfectCount > 0) {
        const imperfectBonus = imperfectCount * SCORING.IMPERFECT_CONS_BONUS;
        score += imperfectBonus;
        bonuses.push({ reason: `B_variety: ${imperfectCount} imperfect consonance entries`, points: imperfectBonus });
    }

    // B_complexity: +100 per inversion, +10 per voice beyond 2
    const inversionCount = chain.filter(e => e.type === 'I').length;
    const extraVoices = Math.max(0, chain.length - 2);
    const complexityBonus = inversionCount * SCORING.INVERSION_BONUS + extraVoices * SCORING.CHAIN_LENGTH_BONUS;
    if (complexityBonus > 0) {
        score += complexityBonus;
        bonuses.push({ reason: `B_complexity (${inversionCount} inv, ${extraVoices} extra voices)`, points: complexityBonus });
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

    // P_monotony: -100 if any transposition > 50% of entries
    const transCounts = new Map<number, number>();
    chain.forEach(e => {
        const tc = (e.transposition % 12 + 12) % 12;
        transCounts.set(tc, (transCounts.get(tc) || 0) + 1);
    });
    let monotonyApplied = false;
    transCounts.forEach((count) => {
        if (count > chain.length * 0.5 && !monotonyApplied) {
            score -= SCORING.MONOTONY_PENALTY;
            penalties.push({ reason: `P_monotony`, points: SCORING.MONOTONY_PENALTY });
            monotonyApplied = true;
        }
    });

    // --- 4. Harmony Reward/Penalty ---
    if (harmonyAnalysis.reward > 0) {
        const r = Math.round(harmonyAnalysis.reward);
        score += r;
        bonuses.push({ reason: `Harmony: full chords`, points: r });
    }
    if (harmonyAnalysis.penalty > 0) {
        const p = Math.round(harmonyAnalysis.penalty);
        score -= p;
        penalties.push({ reason: `Harmony: NCT presence`, points: p });
    }

    // --- 5. Polyphony Density Bonus: 200 * (avgVoices - 2) ---
    const avgVoices = totalDuration > 0 ? totalWeightedVoices / totalDuration : 1;
    const polyphonyBonus = Math.round(SCORING.POLYPHONY_DENSITY_MULT * (avgVoices - SCORING.POLYPHONY_DENSITY_OFFSET));
    score += polyphonyBonus;
    if (polyphonyBonus >= 0) {
        bonuses.push({ reason: `Polyphony density (avg ${avgVoices.toFixed(1)} voices)`, points: polyphonyBonus });
    } else {
        penalties.push({ reason: `Thin texture (avg ${avgVoices.toFixed(1)} voices)`, points: -polyphonyBonus });
    }

    // Clamp score
    score = Math.max(SCORING.SCORE_MIN, Math.min(SCORING.SCORE_MAX, score));

    const log: ScoreLog = {
        base: 0,
        bonuses,
        penalties,
        total: score
    };

    // --- 6. Consonant End Validation (per-voice) ---
    let isValid = true;
    if (options.requireConsonantEnd) {
        for (let ei = 0; ei < chain.length; ei++) {
            const entry = chain[ei];
            const variant = variants[variantIndices[ei]];
            const entryStartTick = Math.round(entry.startBeat * PPQ);
            const entryEndTick = entryStartTick + variant.lengthTicks;

            const activeAtEnd = placedNotes.filter(n =>
                n.voice !== entry.voiceIndex &&
                n.start <= entryEndTick - 1 && n.end > entryEndTick - 1
            );

            if (activeAtEnd.length === 0) continue;

            const entryNotes = placedNotes.filter(n =>
                n.voice === entry.voiceIndex &&
                n.start <= entryEndTick - 1 && n.end > entryEndTick - 1
            );
            if (entryNotes.length === 0) continue;

            const endPitch = entryNotes[0].pitch;
            const allPitches = [endPitch, ...activeAtEnd.map(n => n.pitch)].sort((a, b) => a - b);
            const endBass = allPitches[0];

            for (let j = 0; j < allPitches.length; j++) {
                for (let k = j + 1; k < allPitches.length; k++) {
                    const int = (allPitches[k] - allPitches[j]) % 12;
                    if (INTERVALS.DISSONANT_SIMPLE.has(int)) isValid = false;
                    if (int === 5 && allPitches[j] === endBass) isValid = false;
                }
            }
            if (!isValid) break;
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
