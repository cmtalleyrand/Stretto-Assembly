
/**
 * Canon Search Scoring
 *
 * Entirely separate from stretto scoring. Evaluates harmonic quality of a canon
 * chain using event-based analysis (dissonance, NCTs, parallel perfects, chord
 * quality) rather than the proportion-based S1–S3 metrics used by stretto.
 */

import { StrettoChainOption, ScoreLog, CanonChordSpan, CanonHarmonyClass } from '../../types';
import { SubjectVariant } from './strettoScoring';
import { INTERVALS } from './strettoConstants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISSONANCE_RESOLUTION_BONUS = 20;
const DISSONANCE_CHAIN_BASE_PENALTY = 20;     // applied on 2nd consecutive dissonance
const DISSONANCE_PENALTY_PER_BEAT = 10;
const NCT_PENALTY = 30;
const NCT_ADD_PENALTY = 30;                   // additional per NCT after first
const HARMONY_FULL_TRIAD_BONUS = 20;          // per beat, no NCTs, full triad
const HARMONY_7TH_MISSING_5TH_BONUS = 20;    // per beat, no NCTs, 7th missing 5th
const HARMONY_FULL_7TH_BONUS = 40;            // per beat, no NCTs, complete 7th/6th
const PARALLEL_PERFECT_BASE_PENALTY = 30;
const PARALLEL_PERFECT_MULTIPLIER = 1.5;
const UNISON_PENALTY = 10;
const TRUNCATION_PENALTY_PER_BEAT = 20;
const STEP_BONUS = 100;                        // per entry in chain
const SHORT_NOTE_SCALE = 0.5;                  // scale factor when notes < 8th note

// ---------------------------------------------------------------------------
// Chord templates for harmony bonuses
// ---------------------------------------------------------------------------

// Full triads (exactly 3 distinct interval classes from root)
const FULL_TRIADS: number[][] = [
    [0, 4, 7],  // Major
    [0, 3, 7],  // Minor
    [0, 3, 6],  // Diminished
    [0, 4, 8],  // Augmented
];

// Full 7th / 6th chords (4 distinct interval classes)
const FULL_7TH_OR_6TH: number[][] = [
    [0, 4, 7, 10],  // Dom7
    [0, 4, 7, 11],  // Maj7
    [0, 3, 7, 10],  // m7
    [0, 3, 7, 11],  // mM7
    [0, 3, 6, 10],  // m7b5
    [0, 3, 6, 9],   // dim7
    [0, 4, 7, 9],   // Maj6
    [0, 3, 7, 9],   // m6
];

// 7th / 6th with missing fifth (3 notes: root + 3rd + 7th or 6th, no 5th)
const SEVENTH_MISSING_5TH: number[][] = [
    [0, 4, 10],  // Dom7 no5
    [0, 4, 11],  // Maj7 no5
    [0, 3, 10],  // m7 no5
    [0, 3, 11],  // mM7 no5
    [0, 3, 9],   // m6 no5 / dim7 no5
    [0, 4, 9],   // Maj6 no5
];

interface ChordMatchResult {
    isFullTriad: boolean;
    isFull7thOr6th: boolean;
    is7thMissing5th: boolean;
    nctCount: number;
    chordName?: string;
}

function matchChordTemplates(pitches: number[], templates: number[][]): boolean {
    const pcs = Array.from(new Set(pitches.map(p => ((p % 12) + 12) % 12)));
    for (const template of templates) {
        for (let root = 0; root < 12; root++) {
            const shifted = template.map(i => (i + root) % 12);
            if (pcs.every(pc => shifted.includes(pc)) && shifted.every(i => pcs.includes(i))) {
                return true;
            }
        }
    }
    return false;
}

function detectChordQuality(pitches: number[]): ChordMatchResult {
    const pcs = Array.from(new Set(pitches.map(p => ((p % 12) + 12) % 12)));

    if (pcs.length < 2) {
        return { isFullTriad: false, isFull7thOr6th: false, is7thMissing5th: false, nctCount: 0 };
    }

    // Try to find the best matching template across all categories
    const tryMatch = (templates: number[][]): { matched: boolean; nct: number } => {
        let bestNct = Infinity;
        for (const template of templates) {
            for (let root = 0; root < 12; root++) {
                const shifted = template.map(i => (i + root) % 12);
                if (shifted.every(intervalPc => pcs.includes(intervalPc))) {
                    // Template must be fully present in the active slice.
                    // NCTs are extra pitch classes beyond the matched template.
                    const nct = pcs.filter(pc => !shifted.includes(pc)).length;
                    if (nct < bestNct) bestNct = nct;
                }
            }
        }
        return { matched: bestNct !== Infinity, nct: bestNct === Infinity ? pcs.length : bestNct };
    };

    // Check from most complete to least
    const full7 = tryMatch(FULL_7TH_OR_6TH);
    if (full7.matched) {
        return { isFullTriad: false, isFull7thOr6th: true, is7thMissing5th: false, nctCount: full7.nct };
    }
    const miss5 = tryMatch(SEVENTH_MISSING_5TH);
    if (miss5.matched) {
        return { isFullTriad: false, isFull7thOr6th: false, is7thMissing5th: true, nctCount: miss5.nct };
    }
    const triad = tryMatch(FULL_TRIADS);
    if (triad.matched) {
        return { isFullTriad: true, isFull7thOr6th: false, is7thMissing5th: false, nctCount: triad.nct };
    }

    // No template matched — count NCTs vs best fitting template
    let bestNct = pcs.length;
    for (const templates of [FULL_7TH_OR_6TH, SEVENTH_MISSING_5TH, FULL_TRIADS]) {
        for (const template of templates) {
            for (let root = 0; root < 12; root++) {
                const shifted = template.map(i => (i + root) % 12);
                const nct = pcs.filter(pc => !shifted.includes(pc)).length;
                if (nct < bestNct) bestNct = nct;
            }
        }
    }
    return { isFullTriad: false, isFull7thOr6th: false, is7thMissing5th: false, nctCount: bestNct };
}

function isDissonant(pitches: number[]): boolean {
    const bass = Math.min(...pitches);
    for (let j = 0; j < pitches.length; j++) {
        for (let k = j + 1; k < pitches.length; k++) {
            const int = ((pitches[k] - pitches[j]) % 12 + 12) % 12;
            if (INTERVALS.DISSONANT_SIMPLE.has(int)) return true;
            // P4 dissonant when lower note is the global bass
            if (int === 5 && pitches[j] === bass) return true;
        }
    }
    return false;
}

function hasUnison(pitches: number[]): boolean {
    for (let j = 0; j < pitches.length; j++) {
        for (let k = j + 1; k < pitches.length; k++) {
            if (pitches[j] === pitches[k]) return true;  // same absolute pitch
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Placed note representation
// ---------------------------------------------------------------------------

interface PlacedNote {
    start: number;    // absolute ticks
    end: number;
    pitch: number;
    voice: number;
    durationTicks: number;
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

export interface CanonScoreResult {
    score: number;
    scoreLog: ScoreLog;
    detectedChords: string[];
}

function classifyHarmony(chordResult: ChordMatchResult): CanonHarmonyClass {
    if (chordResult.isFull7thOr6th) return 'full_7th_or_6th';
    if (chordResult.is7thMissing5th) return 'incomplete_7th_or_6th';
    if (chordResult.isFullTriad) return 'full_triad';
    return 'non_chord';
}

export function calculateCanonScore(
    chain: StrettoChainOption[],
    variants: SubjectVariant[],
    variantIndices: number[],
    autoTruncatedBeats: number,
    ppq: number
): CanonScoreResult {
    const PPQ = ppq;
    const EIGHTH_NOTE_TICKS = PPQ / 2;

    // -------------------------------------------------------------------------
    // 1. Place all notes on absolute timeline
    // -------------------------------------------------------------------------
    const placedNotes: PlacedNote[] = [];

    chain.forEach((e, i) => {
        const variant = variants[variantIndices[i]];
        const startTick = Math.round(e.startBeat * PPQ);

        variant.notes.forEach(n => {
            const absStart = startTick + n.relTick;
            const absEnd = absStart + n.durationTicks;
            placedNotes.push({
                start: absStart,
                end: absEnd,
                pitch: n.pitch + e.transposition,
                voice: e.voiceIndex,
                durationTicks: n.durationTicks,
            });
        });
    });

    if (placedNotes.length === 0) {
        const empty: CanonScoreResult = {
            score: 0,
            scoreLog: { base: 0, bonuses: [], penalties: [], total: 0 },
            detectedChords: [],
        };
        return empty;
    }

    // -------------------------------------------------------------------------
    // 2. Collect all event boundaries (note starts and ends)
    // -------------------------------------------------------------------------
    const boundarySet = new Set<number>();
    for (const n of placedNotes) {
        boundarySet.add(n.start);
        boundarySet.add(n.end);
    }
    const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

    // -------------------------------------------------------------------------
    // 3. Scan each event slice
    // -------------------------------------------------------------------------
    const bonuses: ScoreLog['bonuses'] = [];
    const penalties: ScoreLog['penalties'] = [];
    let score = 0;

    // State tracking
    let consecutiveDissonanceCount = 0;
    let prevWasDiss = false;
    let prevPitchesByVoice: Map<number, number> = new Map();
    // For parallel perfect consecutive tracking: voicePairKey -> consecutive count
    const parallelPerfectConsec: Map<string, number> = new Map();
    const detectedChordsMap = new Map<string, number>(); // chordName -> beats
    const chordSequence: CanonChordSpan[] = [];

    let analyzedBeats = 0;
    let dissonantBeats = 0;
    let nctBeats = 0;
    let parallelPerfectCount = 0;
    let unisonCount = 0;
    const harmonyCounts = {
        fullTriad: 0,
        full7thOr6th: 0,
        incomplete7thOr6th: 0,
        nonChord: 0,
    };
    const contributions = {
        harmonyBonus: 0,
        dissonancePenalty: 0,
        dissonanceResolutionBonus: 0,
        nctPenalty: 0,
        parallelPenalty: 0,
        unisonPenalty: 0,
        stepBonus: 0,
        truncationPenalty: 0,
    };

    for (let bi = 0; bi < boundaries.length - 1; bi++) {
        const sliceStart = boundaries[bi];
        const sliceEnd = boundaries[bi + 1];
        const sliceDur = sliceEnd - sliceStart;
        if (sliceDur <= 0) continue;

        const sliceDurBeats = sliceDur / PPQ;

        // Active notes in this slice
        const active = placedNotes.filter(n => n.start <= sliceStart && n.end > sliceStart);
        if (active.length < 2) {
            // Monophony or silence – reset dissonance chain but keep other state
            if (active.length === 0) {
                prevWasDiss = false;
                consecutiveDissonanceCount = 0;
            }
            // Update voice pitches
            prevPitchesByVoice = new Map();
            for (const n of active) prevPitchesByVoice.set(n.voice, n.pitch);
            // Reset parallel perfect consecutiveness on gap
            parallelPerfectConsec.clear();
            continue;
        }

        const pitches = active.map(a => a.pitch);
        const currentPitchesByVoice = new Map<number, number>();
        for (const a of active) currentPitchesByVoice.set(a.voice, a.pitch);
        analyzedBeats += sliceDurBeats;

        // Check for short notes in this slice
        const hasShortNote = active.some(a => a.durationTicks < EIGHTH_NOTE_TICKS);
        const shortScale = hasShortNote ? SHORT_NOTE_SCALE : 1.0;

        // -----------------------------------------------------------------------
        // A. Dissonance analysis
        // -----------------------------------------------------------------------
        const sliceIsDiss = isDissonant(pitches);

        if (sliceIsDiss) {
            dissonantBeats += sliceDurBeats;
            // Per-beat dissonance penalty
            const beatPenalty = Math.round(DISSONANCE_PENALTY_PER_BEAT * sliceDurBeats * shortScale);
            if (beatPenalty > 0) {
                score -= beatPenalty;
                penalties.push({ reason: `Dissonance (${sliceDurBeats.toFixed(2)} beat${sliceDurBeats !== 1 ? 's' : ''})`, points: beatPenalty });
                contributions.dissonancePenalty += beatPenalty;
            }

            if (prevWasDiss) {
                // Consecutive dissonance chain penalty — grows by 1.5× each time
                consecutiveDissonanceCount++;
                const chainPenalty = Math.round(DISSONANCE_CHAIN_BASE_PENALTY * Math.pow(PARALLEL_PERFECT_MULTIPLIER, consecutiveDissonanceCount - 1) * shortScale);
                score -= chainPenalty;
                penalties.push({ reason: `Consecutive dissonance chain (run ${consecutiveDissonanceCount + 1})`, points: chainPenalty });
                contributions.dissonancePenalty += chainPenalty;
            } else {
                // First dissonance in a new run
                consecutiveDissonanceCount = 0;
            }
        } else {
            // Consonant slice
            if (prevWasDiss) {
                // Dissonance resolved to consonance
                const resolveBonus = Math.round(DISSONANCE_RESOLUTION_BONUS * shortScale);
                score += resolveBonus;
                bonuses.push({ reason: `Dissonance resolution`, points: resolveBonus });
                contributions.dissonanceResolutionBonus += resolveBonus;
            }
            consecutiveDissonanceCount = 0;
        }
        prevWasDiss = sliceIsDiss;

        // -----------------------------------------------------------------------
        // B. Unisons
        // -----------------------------------------------------------------------
        if (hasUnison(pitches)) {
            const unisonPenalty = Math.round(UNISON_PENALTY * shortScale);
            score -= unisonPenalty;
            penalties.push({ reason: `Unison between voices`, points: unisonPenalty });
            unisonCount++;
            contributions.unisonPenalty += unisonPenalty;
        }

        // -----------------------------------------------------------------------
        // C. NCT analysis (one-time per slice, not per beat)
        // -----------------------------------------------------------------------
        const chordResult = detectChordQuality(pitches);
        if (chordResult.nctCount > 0) nctBeats += sliceDurBeats;
        if (chordResult.nctCount > 0) {
            const nctPenalty = Math.round((NCT_PENALTY + (chordResult.nctCount - 1) * NCT_ADD_PENALTY) * shortScale);
            score -= nctPenalty;
            penalties.push({ reason: `NCT (${chordResult.nctCount} non-chord tone${chordResult.nctCount > 1 ? 's' : ''})`, points: nctPenalty });
            contributions.nctPenalty += nctPenalty;
        }

        const harmonyClass = classifyHarmony(chordResult);
        if (harmonyClass === 'full_triad') harmonyCounts.fullTriad++;
        else if (harmonyClass === 'full_7th_or_6th') harmonyCounts.full7thOr6th++;
        else if (harmonyClass === 'incomplete_7th_or_6th') harmonyCounts.incomplete7thOr6th++;
        else harmonyCounts.nonChord++;

        // -----------------------------------------------------------------------
        // D. Harmony bonuses (per beat)
        // -----------------------------------------------------------------------
        if (chordResult.nctCount === 0) {
            if (chordResult.isFull7thOr6th) {
                const h = Math.round(HARMONY_FULL_7TH_BONUS * sliceDurBeats * shortScale);
                score += h;
                bonuses.push({ reason: `Full 7th/6th chord (${sliceDurBeats.toFixed(2)} beat${sliceDurBeats !== 1 ? 's' : ''})`, points: h });
                contributions.harmonyBonus += h;
            } else if (chordResult.is7thMissing5th) {
                const h = Math.round(HARMONY_7TH_MISSING_5TH_BONUS * sliceDurBeats * shortScale);
                score += h;
                bonuses.push({ reason: `7th/6th missing 5th (${sliceDurBeats.toFixed(2)} beat${sliceDurBeats !== 1 ? 's' : ''})`, points: h });
                contributions.harmonyBonus += h;
            } else if (chordResult.isFullTriad) {
                const h = Math.round(HARMONY_FULL_TRIAD_BONUS * sliceDurBeats * shortScale);
                score += h;
                bonuses.push({ reason: `Full triad (${sliceDurBeats.toFixed(2)} beat${sliceDurBeats !== 1 ? 's' : ''})`, points: h });
                contributions.harmonyBonus += h;
            }
        }

        const chordSpan: CanonChordSpan = {
            label: harmonyClass === 'full_7th_or_6th'
                ? '7th/6th'
                : harmonyClass === 'incomplete_7th_or_6th'
                    ? '7th/6th (incomplete)'
                    : harmonyClass === 'full_triad'
                        ? 'Triad'
                        : 'Other',
            harmonyClass,
            durationBeats: sliceDurBeats,
            nctCount: chordResult.nctCount,
            dissonant: sliceIsDiss,
        };
        const lastSpan = chordSequence[chordSequence.length - 1];
        if (
            lastSpan &&
            lastSpan.label === chordSpan.label &&
            lastSpan.harmonyClass === chordSpan.harmonyClass &&
            lastSpan.nctCount === chordSpan.nctCount &&
            lastSpan.dissonant === chordSpan.dissonant
        ) {
            lastSpan.durationBeats += chordSpan.durationBeats;
        } else {
            chordSequence.push(chordSpan);
        }

        // -----------------------------------------------------------------------
        // E. Parallel perfect detection (between previous slice and this one)
        // -----------------------------------------------------------------------
        if (prevPitchesByVoice.size >= 2) {
            const voiceIds = Array.from(currentPitchesByVoice.keys()).filter(v => prevPitchesByVoice.has(v));
            for (let vi = 0; vi < voiceIds.length; vi++) {
                for (let vj = vi + 1; vj < voiceIds.length; vj++) {
                    const va = voiceIds[vi];
                    const vb = voiceIds[vj];
                    const prevA = prevPitchesByVoice.get(va)!;
                    const prevB = prevPitchesByVoice.get(vb)!;
                    const curA = currentPitchesByVoice.get(va)!;
                    const curB = currentPitchesByVoice.get(vb)!;

                    const prevInt = ((Math.abs(prevA - prevB)) % 12 + 12) % 12;
                    const curInt = ((Math.abs(curA - curB)) % 12 + 12) % 12;

                    const isPrevPerfect = prevInt === 0 || prevInt === 7;
                    const isCurPerfect = curInt === 0 || curInt === 7;
                    const bothMoved = (curA !== prevA) || (curB !== prevB);

                    const pairKey = `${Math.min(va, vb)}-${Math.max(va, vb)}`;
                    if (isPrevPerfect && isCurPerfect && bothMoved) {
                        // Check for parallel (same direction) motion
                        const deltaA = curA - prevA;
                        const deltaB = curB - prevB;
                        const isParallel = (deltaA > 0 && deltaB > 0) || (deltaA < 0 && deltaB < 0) || (deltaA === 0 || deltaB === 0);

                        if (isParallel) {
                            const prevConsec = parallelPerfectConsec.get(pairKey) ?? 0;
                            const penalty = Math.round(PARALLEL_PERFECT_BASE_PENALTY * Math.pow(PARALLEL_PERFECT_MULTIPLIER, prevConsec) * shortScale);
                            score -= penalty;
                            penalties.push({ reason: `Parallel ${curInt === 0 ? 'unison/octave' : 'perfect 5th'} (v${va}–v${vb}, consec ${prevConsec + 1})`, points: penalty });
                            parallelPerfectConsec.set(pairKey, prevConsec + 1);
                            parallelPerfectCount++;
                            contributions.parallelPenalty += penalty;
                        } else {
                            parallelPerfectConsec.delete(pairKey);
                        }
                    } else {
                        parallelPerfectConsec.delete(pairKey);
                    }
                }
            }
        }

        // -----------------------------------------------------------------------
        // F. Chord name tracking for display
        // -----------------------------------------------------------------------
        if (active.length >= 2 && !sliceIsDiss && sliceDurBeats >= 0.25) {
            const pcs = Array.from(new Set(pitches.map(p => ((p % 12) + 12) % 12))).sort((a, b) => a - b);
            if (pcs.length >= 2) {
                const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
                // Guess root as bass pitch class
                const bassPC = ((Math.min(...pitches) % 12) + 12) % 12;
                const name = `${NOTE_NAMES[bassPC]} chord`;
                detectedChordsMap.set(name, (detectedChordsMap.get(name) ?? 0) + sliceDurBeats);
            }
        }

        prevPitchesByVoice = currentPitchesByVoice;
    }

    // -------------------------------------------------------------------------
    // 4. Structural bonuses / penalties
    // -------------------------------------------------------------------------

    // Step bonus: +100 per entry
    const stepBonus = chain.length * STEP_BONUS;
    score += stepBonus;
    bonuses.push({ reason: `Chain length bonus (${chain.length} entries × ${STEP_BONUS})`, points: stepBonus });
    contributions.stepBonus += stepBonus;

    // Truncation penalty: -20 per beat of auto-truncation per entry
    if (autoTruncatedBeats > 0) {
        // Count how many entries use the truncated variant
        let truncatedCount = 0;
        for (const vi of variantIndices) {
            if (variants[vi].truncationBeats > 0) truncatedCount++;
        }
        const truncPenalty = truncatedCount * autoTruncatedBeats * TRUNCATION_PENALTY_PER_BEAT;
        score -= truncPenalty;
        penalties.push({ reason: `Auto-truncation (${truncatedCount} entries × ${autoTruncatedBeats} beat${autoTruncatedBeats !== 1 ? 's' : ''})`, points: truncPenalty });
        contributions.truncationPenalty += truncPenalty;
    }

    // -------------------------------------------------------------------------
    // 5. Build detected chord list
    // -------------------------------------------------------------------------
    const detectedChords = Array.from(detectedChordsMap.entries())
        .filter(([, dur]) => dur >= 0.5)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([name]) => name);

    const log: ScoreLog = {
        base: 0,
        bonuses,
        penalties,
        breakdown: {
            analyzedBeats,
            dissonantBeats,
            nctBeats,
            parallelPerfectCount,
            unisonCount,
            harmonyCounts,
            contributions,
            chordSequence,
        },
        total: score,
    };

    return { score, scoreLog: log, detectedChords };
}
