
import { StrettoChainOption, StrettoSearchOptions, StrettoChainResult, ScoreLog } from '../../types';
import { INTERVALS, SCORING } from './strettoConstants';
import { analyzeStrettoHarmony } from './strettoHarmonyAnalysis';
import { isStrongBeat } from './strettoTimeUtils';

// --- Weights & Constants ---
const W_S1 = 0.2; // Unweighted Dissonance
const W_S2 = 0.3; // Weighted Dissonance
const W_S3 = 0.4; // NCT Ratio (emphasized)

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


interface DelayPenaltyBreakdown {
    total: number;
    items: ScoreLog['penalties'];
}

interface ScoringEvent {
    startTick: number;
    endTick: number;
    voices: PlacedNote[];
    isDissonant: boolean;
    nctCount: number;
    shortNoteInvolved: boolean;
}

interface PlacedNote {
    start: number;
    end: number;
    pitch: number;
    voice: number;
}

export function computeDelayPenaltyBreakdown(delays: number[], chainLength: number): DelayPenaltyBreakdown {
    let total = 0;
    const items: ScoreLog['penalties'] = [];

    const delayCounts = new Map<number, number>();
    delays.forEach((delay) => {
        const c = delayCounts.get(delay) ?? 0;
        delayCounts.set(delay, c + 1);
    });
    delayCounts.forEach((count, delay) => {
        if (count > 1) {
            const repeatedPenalty = (count - 1) * SCORING.DIST_REPEAT_PENALTY;
            total += repeatedPenalty;
            items.push({ reason: `P_distance: repeated delay ${delay.toFixed(2)} (${count}x)`, points: repeatedPenalty });
        }
    });

    for (let i = 0; i < delays.length; i++) {
        let localClusterCount = 0;
        if (i > 0 && Math.abs(delays[i] - delays[i - 1]) <= 0.5) localClusterCount++;
        if (i < delays.length - 1 && Math.abs(delays[i] - delays[i + 1]) <= 0.5) localClusterCount++;
        if (localClusterCount > 0) {
            const clusterPenalty = localClusterCount * SCORING.DIST_CLUSTER_PENALTY;
            total += clusterPenalty;
            items.push({ reason: `P_distance: clustered delay ${delays[i].toFixed(2)} (adjacent ±0.5 beat)`, points: clusterPenalty });
        }
    }

    const finalThirdStartEntry = Math.ceil((2 * chainLength) / 3);
    for (let i = 1; i < delays.length; i++) {
        const entryIndex = i + 1;
        if (entryIndex < finalThirdStartEntry && delays[i] > delays[i - 1]) {
            total += SCORING.EARLY_EXPANSION_PENALTY;
            items.push({ reason: `P_distance: early expansion before final third (entry ${entryIndex + 1})`, points: SCORING.EARLY_EXPANSION_PENALTY });
        }
    }

    return { total, items };
}



function isTruncatedEntry(entry: StrettoChainOption, chain: StrettoChainOption[]): boolean {
    return entry.length < chain[0].length;
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

function isDissonantSonority(pitches: number[]): boolean {
    if (pitches.length < 2) return false;
    const ordered = [...pitches].sort((a, b) => a - b);
    const bass = ordered[0];
    for (let j = 0; j < ordered.length; j++) {
        for (let k = j + 1; k < ordered.length; k++) {
            const int = (ordered[k] - ordered[j]) % 12;
            if (INTERVALS.DISSONANT_SIMPLE.has(int)) return true;
            if (int === 5 && ordered[j] === bass) return true;
        }
    }
    return false;
}

/**
 * Calculates the S1-S3 metrics + additive bonuses/penalties for a generated chain.
 * Hybrid scoring: S1-S3 utility + structural bonuses/penalties + polyphony density.
 */
export function calculateStrettoScore(
    chain: StrettoChainOption[],
    variants: SubjectVariant[],
    variantIndices: number[],
    options: StrettoSearchOptions,
    ppq: number = 480,
    autoTruncBeats: number = 0
): StrettoChainResult {

    const PPQ = ppq;
    const tsNum = options.meterNumerator ?? 4;
    const tsDenom = options.meterDenominator ?? 4;

    // 1. Collect all unique time points and place notes
    const timePoints = new Set<number>();

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

    const minTick = sortedPoints[0];
    const maxTick = sortedPoints[sortedPoints.length - 1];
    const tick16 = PPQ / 4;

    // --- 1B. Two-pass event construction using an active-set sweep ---
    const noteStarts = new Map<number, number[]>();
    const noteEnds = new Map<number, number[]>();
    for (let i = 0; i < placedNotes.length; i++) {
        const n = placedNotes[i];
        const starts = noteStarts.get(n.start) ?? [];
        starts.push(i);
        noteStarts.set(n.start, starts);
        const ends = noteEnds.get(n.end) ?? [];
        ends.push(i);
        noteEnds.set(n.end, ends);
    }

    const activeIds = new Set<number>();
    const activeSortedIds: number[] = [];
    const insertSortedId = (id: number): void => {
        let lo = 0;
        let hi = activeSortedIds.length;
        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (activeSortedIds[mid] < id) lo = mid + 1;
            else hi = mid;
        }
        activeSortedIds.splice(lo, 0, id);
    };
    const removeSortedId = (id: number): void => {
        let lo = 0;
        let hi = activeSortedIds.length - 1;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const cur = activeSortedIds[mid];
            if (cur === id) {
                activeSortedIds.splice(mid, 1);
                return;
            }
            if (cur < id) lo = mid + 1;
            else hi = mid - 1;
        }
    };
    const scoringEvents: ScoringEvent[] = [];
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const dur = end - start;
        if (dur <= 0) continue;

        const endingNow = noteEnds.get(start);
        if (endingNow) {
            endingNow.forEach((id) => {
                if (!activeIds.has(id)) return;
                activeIds.delete(id);
                removeSortedId(id);
            });
        }
        const startingNow = noteStarts.get(start);
        if (startingNow) {
            startingNow.forEach((id) => {
                if (activeIds.has(id)) return;
                activeIds.add(id);
                insertSortedId(id);
            });
        }

        const voices = activeSortedIds.map((id) => placedNotes[id]);

        const pitches = voices.map(v => v.pitch);
        scoringEvents.push({
            startTick: start,
            endTick: end,
            voices,
            isDissonant: isDissonantSonority(pitches),
            nctCount: voices.length >= 3 ? countNCTs(pitches) : 0,
            shortNoteInvolved: voices.some(v => (v.end - v.start) < tick16)
        });
    }

    // --- 1C. Run Harmony Analysis ---
    const harmonyTimeline: Record<number, Record<number, { pitch: number, dur16: number }>> = {};
    const harmonyTicks: number[] = [];

    let eventIndex = 0;
    for (let t = minTick; t < maxTick; t += tick16) {
        while (eventIndex < scoringEvents.length && scoringEvents[eventIndex].endTick <= t) {
            eventIndex++;
        }
        if (eventIndex >= scoringEvents.length) continue;
        const event = scoringEvents[eventIndex];
        if (event.startTick > t) continue;
        if (event.voices.length === 0) continue;

        const gridIndex = Math.round(t / tick16);
        harmonyTicks.push(gridIndex);
        harmonyTimeline[gridIndex] = {};
        event.voices.forEach((n) => {
            harmonyTimeline[gridIndex][n.voice] = { pitch: n.pitch, dur16: 1 };
        });
    }

    const harmonyAnalysis = analyzeStrettoHarmony(harmonyTimeline, harmonyTicks);

    // --- 2. Scan-Line Metric Calculation ---

    let totalPolyTime = 0;       // S1/S2 denominator (2+ voices)
    let totalDissTime = 0;       // S1
    let totalWeightedDissTime = 0; // S2
    let weightedTotalPoly = 0;   // S2 Denom
    let totalNCTTime = 0;        // S3 numerator
    let totalPoly3PlusTime = 0;  // S3 denominator (3+ voices only)


    // Polyphony density tracking
    let totalWeightedVoices = 0;
    let totalDuration = 0;


    for (const event of scoringEvents) {
        const dur = event.endTick - event.startTick;
        const voices = event.voices;

        // Accumulate polyphony density for ALL slices (including mono)
        totalWeightedVoices += voices.length * dur;
        totalDuration += dur;

        if (voices.length === 1) continue;

        if (voices.length < 2) continue;

        totalPolyTime += dur;

        const isStrong = isStrongBeat(event.startTick, PPQ, tsNum, tsDenom);
        const weight = isStrong ? 1.5 : 1.0;
        const weightedDur = dur * weight;

        weightedTotalPoly += weightedDur;

        // --- S1 & S2: Dissonance ---
        if (event.isDissonant) {
            totalDissTime += dur;
            totalWeightedDissTime += weightedDur;
        }

        // --- S3: NCT (proportional, 3+ voices only) ---
        if (voices.length >= 3) {
            totalPoly3PlusTime += dur;
            const nctCount = event.nctCount;
            if (nctCount > 0) {
                totalNCTTime += dur * (nctCount / voices.length);
            }
        }
    }

    // 3. Final Calculation: S1-S3 quality penalty (proportional)
    const S1 = totalPolyTime > 0 ? totalDissTime / totalPolyTime : 0;
    const S2 = weightedTotalPoly > 0 ? totalWeightedDissTime / weightedTotalPoly : 0;
    const S3 = totalPoly3PlusTime > 0 ? totalNCTTime / totalPoly3PlusTime : 0;

    const qualityPenaltyFraction = (S1 * W_S1) + (S2 * W_S2) + (S3 * W_S3);
    const U_quality = Math.round(SCORING.QUALITY_UTILITY_SCALE * qualityPenaltyFraction);

    let score = U_quality;
    const warnings: string[] = [];

    // Hard validity rule: reject chains containing >2 consecutive dissonant simultaneities.
    // This runs on the fully assembled sonority timeline (not only pairwise projections),
    // so it catches cases that can evade pair-local precomputation.
    let dissonanceRunEvents = 0;
    let maxDissonanceRunEvents = 0;
    for (const event of scoringEvents) {
        const voices = event.voices;
        if (voices.length < 2) {
            // Monophony: event counter is transparent — only consonance resets it.
            continue;
        }

        if (event.isDissonant) {
            dissonanceRunEvents++;
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissonanceRunEvents);
        } else {
            dissonanceRunEvents = 0;
        }
    }

    const bonuses: ScoreLog['bonuses'] = [];
    const penalties: ScoreLog['penalties'] = [
        { reason: `S1: Unweighted Diss (${(S1*100).toFixed(0)}%)`, points: Math.round(S1 * SCORING.QUALITY_COMPONENT_SCALE * W_S1) },
        { reason: `S2: Weighted Diss (${(S2*100).toFixed(0)}%)`, points: Math.round(S2 * SCORING.QUALITY_COMPONENT_SCALE * W_S2) },
        { reason: `S3: NCT Time (${(S3*100).toFixed(0)}%)`, points: Math.round(S3 * SCORING.QUALITY_COMPONENT_SCALE * W_S3) },
    ];

    // --- 3B. Additive Bonuses & Penalties ---

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

    // P_distance: repeated delays, clustered delays, and early expansions
    const delays = chain.slice(1).map((entry, i) => entry.startBeat - chain[i].startBeat);
    const delayPenalty = computeDelayPenaltyBreakdown(delays, chain.length);
    score -= delayPenalty.total;
    penalties.push(...delayPenalty.items);

    // P_distance: truncated-entry contraction requirement
    // Rule: after a truncated entry, the next delay must contract by >= 1 beat unless previous delay < Sb/3.
    for (let i = 2; i < chain.length; i++) {
        const prevEntry = chain[i - 1];
        const prevDelay = chain[i - 1].startBeat - chain[i - 2].startBeat;
        const currentDelay = chain[i].startBeat - chain[i - 1].startBeat;
        if (!isTruncatedEntry(prevEntry, chain)) continue;
        if (prevDelay < (subjectLengthBeats / 3)) continue;
        const requiredMaxDelay = prevDelay - 1;
        if (currentDelay > requiredMaxDelay) {
            const penalty = SCORING.EARLY_EXPANSION_PENALTY;
            score -= penalty;
            penalties.push({
                reason: `P_distance: post-truncation contraction miss (entry ${i + 1}; need <= ${requiredMaxDelay.toFixed(2)}B)`,
                points: penalty
            });
        }
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

    // P_autoTruncation: penalise beats removed by voice-capacity auto-truncation
    if (autoTruncBeats > 0) {
        const autoTruncPenalty = autoTruncBeats * SCORING.TRUNCATION_PENALTY_PER_BEAT;
        score -= autoTruncPenalty;
        penalties.push({ reason: `P_autoTruncation: ${autoTruncBeats.toFixed(1)} beat(s) auto-truncated`, points: autoTruncPenalty });
    }

    // P_missing_steps: penalize short fallback chains relative to configured target length
    const missingStepCount = Math.max(0, options.targetChainLength - chain.length);
    if (missingStepCount > 0) {
        const missingStepPenalty = missingStepCount * SCORING.MISSING_CHAIN_STEP_PENALTY;
        score -= missingStepPenalty;
        penalties.push({ reason: `P_missing_steps: ${missingStepCount} missing step(s)`, points: missingStepPenalty });
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


    const log: ScoreLog = {
        base: 0,
        bonuses,
        penalties,
        total: score
    };

    // --- 6. Consonant End Validation (per-voice) ---
    let isValid = maxDissonanceRunEvents <= 2;
    if (!isValid) {
        warnings.push(`Rejected: ${maxDissonanceRunEvents} consecutive dissonant simultaneities (max allowed = 2).`);
    }

    if (options.requireConsonantEnd) {
        const eventAtTick = (tick: number): ScoringEvent | undefined => {
            let lo = 0;
            let hi = scoringEvents.length - 1;
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                const ev = scoringEvents[mid];
                if (tick < ev.startTick) {
                    hi = mid - 1;
                } else if (tick >= ev.endTick) {
                    lo = mid + 1;
                } else {
                    return ev;
                }
            }
            return undefined;
        };

        for (let ei = 0; ei < chain.length; ei++) {
            const entry = chain[ei];
            const variant = variants[variantIndices[ei]];
            const entryStartTick = Math.round(entry.startBeat * PPQ);
            const entryEndTick = entryStartTick + variant.lengthTicks;
            const endTick = entryEndTick - 1;
            const event = eventAtTick(endTick);
            if (!event) continue;

            const activeAtEnd = event.voices.filter(n => n.voice !== entry.voiceIndex);

            if (activeAtEnd.length === 0) continue;

            const entryNotes = event.voices.filter(n => n.voice === entry.voiceIndex);
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
        warnings,
        score,
        scoreLog: log,
        detectedChords: harmonyAnalysis.chords,
        dissonanceRatio: S1,
        nctRatio: S3,
        pairDissonanceScore: 0,
        isValid,
        maxDissonanceRunEvents
    };
}
