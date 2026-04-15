
/**
 * Canon Search Algorithm
 *
 * Enumerates ALL valid combinations of:
 *   (delay, transposition-tuple, inversion-pattern, chain-length)
 *
 * The transposition-tuple is a V-length array (one entry per voice slot).
 * Every combination is scored; results are returned for user filtering.
 *
 * Canon rules:
 *   - All inter-entry delays are identical.
 *   - Voice slot for entry i = i mod ensembleTotal.
 *   - Transposition for entry i = transpositionTuple[i mod ensembleTotal].
 *   - Voice spacing rules (B-rules) are pre-enforced when building tuples.
 *   - Auto-truncation applied when delay × voices < subject length.
 */

import {
    RawNote,
    CanonSearchOptions,
    CanonChainResult,
    CanonSearchReport,
    CanonInversionPattern,
    CanonTranspositionMode,
    StrettoChainOption,
} from '../../types';
import { SubjectVariant, InternalNote } from './strettoScoring';
import { getInvertedPitch } from './strettoCore';
import { calculateCanonScore } from './canonScoring';

// ---------------------------------------------------------------------------
// Transposition step sets
// ---------------------------------------------------------------------------

/**
 * Traditional canon intervals: perfect consonances only (unison, 4th, 5th)
 * and all their octave compounds up to 3 octaves.
 *   P1=0, P4=5, P5=7, P8=12, P11=17, P12=19, P15=24, P18=29, P19=31, P22=36
 * Compound thirds/sixths are NOT traditional — they belong to THIRD_SIXTH_STEPS.
 */
const TRADITIONAL_STEPS: number[] = [
    0,
    5,  -5,  // P4
    7,  -7,  // P5
    12, -12, // P8
    17, -17, // P11 (compound P4)
    19, -19, // P12 (compound P5)
    24, -24, // P15 (double octave)
    29, -29, // P18 (P4 + 2 octaves)
    31, -31, // P19 (P5 + 2 octaves)
    36, -36, // P22 (triple octave)
];

/**
 * 3rds, 6ths and all their octave compounds.
 *   m3=3, M3=4, m6=8, M6=9
 *   m10=15, M10=16, m13=20, M13=21  (+ 1 octave)
 */
const THIRD_SIXTH_STEPS: number[] = [
    3,  -3,  // m3
    4,  -4,  // M3
    8,  -8,  // m6
    9,  -9,  // M6
    15, -15, // m10 (compound m3)
    16, -16, // M10 (compound M3)
    20, -20, // m13 (compound m6)
    21, -21, // M13 (compound M6)
];

// ---------------------------------------------------------------------------
// Voice roles and spacing rules
// ---------------------------------------------------------------------------

type CanonRole = 'S' | 'A' | 'T' | 'B';

function getVoiceRoles(totalVoices: number): CanonRole[] {
    if (totalVoices <= 2) return ['S', 'B'];
    if (totalVoices === 3) return ['S', 'A', 'B'];
    if (totalVoices === 4) return ['S', 'A', 'T', 'B'];
    if (totalVoices === 5) return ['S', 'A', 'A', 'T', 'B'];
    if (totalVoices === 6) return ['S', 'A', 'A', 'T', 'T', 'B'];
    const cycle: CanonRole[] = ['S', 'A', 'T', 'B'];
    return Array.from({ length: totalVoices }, (_, i) => cycle[i % cycle.length]);
}

/**
 * Returns the allowed [min, max] semitone gap between the higher-register
 * voice (upper) and lower-register voice (lower).  null = only gap >= 0 applies.
 */
function pairGapRange(upper: CanonRole, lower: CanonRole): { min: number; max: number } | null {
    if ((upper === 'S' && lower === 'A') || (upper === 'A' && lower === 'T')) return { min: 3, max: 19 };
    if (upper === 'T' && lower === 'B') return { min: 7, max: 21 };
    if (upper === 'S' && lower === 'T') return { min: 8, max: 24 };
    if (upper === 'A' && lower === 'B') return { min: 12, max: 31 };
    if (upper === 'S' && lower === 'B') return { min: 19, max: 36 };
    return null;
}

/**
 * Backtracking enumeration of all valid transposition V-tuples.
 *
 * Voice 0 = soprano (highest register), voice V-1 = bass (lowest).
 * For each pair (i < j): gap = tuple[i] - tuple[j] must satisfy pairGapRange.
 * If pairGapRange returns null, only gap >= 0 is required.
 *
 * Pruning: for each new voice position the maximum/minimum allowable value
 * is computed from ALL higher-voice constraints — not just the immediately
 * preceding voice — so branches are cut early.
 */
function enumerateTranspositionTuples(
    tSteps: number[],
    voiceCount: number,
    roles: CanonRole[]
): number[][] {
    // Unique steps sorted descending so iteration naturally starts with larger values
    const steps = [...new Set(tSteps)].sort((a, b) => b - a);
    const results: number[][] = [];
    const current: number[] = [];

    function backtrack(vi: number): void {
        if (vi === voiceCount) {
            results.push([...current]);
            return;
        }

        // Derive tight upper and lower bounds from all higher voices already placed.
        let maxT = steps[0];
        let minT = steps[steps.length - 1];

        for (let prevVi = 0; prevVi < vi; prevVi++) {
            const range = pairGapRange(roles[prevVi], roles[vi]);
            if (range) {
                // gap = current[prevVi] - t  →  range.min <= gap <= range.max
                // => current[prevVi] - range.max  <=  t  <=  current[prevVi] - range.min
                maxT = Math.min(maxT, current[prevVi] - range.min);
                minT = Math.max(minT, current[prevVi] - range.max);
            } else {
                // Only gap >= 0  => t <= current[prevVi]
                maxT = Math.min(maxT, current[prevVi]);
            }
        }

        if (maxT < minT) return; // No feasible value for this voice

        for (const t of steps) {
            if (t > maxT) continue;
            if (t < minT) break; // steps is descending, smaller values won't help
            current.push(t);
            backtrack(vi + 1);
            current.pop();
        }
    }

    backtrack(0);
    return results;
}

/**
 * Build a cumulative transposition tuple for a given base step T.
 *
 * Voice 0 is fixed at 0.  Each subsequent voice is placed at the previous
 * voice's transposition + T, then shifted by the minimum integer number of
 * octaves (±12) needed to satisfy ALL voice-spacing constraints with every
 * higher voice already placed.  This keeps the interval class the same (e.g.
 * a P5-below canon stays a P5 or its octave compound, never drifting to a M3).
 * Returns null if no octave adjustment within ±4 octaves can produce a valid
 * placement for any voice.
 */
function buildCumulativeTuple(T: number, V: number, roles: CanonRole[]): number[] | null {
    const tuple: number[] = [0];

    for (let vi = 1; vi < V; vi++) {
        const base = tuple[vi - 1] + T;
        // Try 0, ±1, ±2, ±3, ±4 octaves in order of ascending |k|
        const octaveOrder = [0, -1, 1, -2, 2, -3, 3, -4, 4];
        let placed: number | null = null;

        for (const k of octaveOrder) {
            const candidate = base + k * 12;
            let valid = true;
            for (let prevVi = 0; prevVi < vi && valid; prevVi++) {
                const gap = tuple[prevVi] - candidate;
                if (gap < 0) { valid = false; break; }
                const range = pairGapRange(roles[prevVi], roles[vi]);
                if (range && (gap < range.min || gap > range.max)) valid = false;
            }
            if (valid) { placed = candidate; break; }
        }

        if (placed === null) return null;
        tuple.push(placed);
    }

    return tuple;
}

// ---------------------------------------------------------------------------
// Subject helpers
// ---------------------------------------------------------------------------

function buildBaseNotes(subjectNotes: RawNote[], ppq: number): InternalNote[] {
    const sorted = [...subjectNotes].sort((a, b) => a.ticks - b.ticks);
    const startTick = sorted[0].ticks;
    return sorted.map(n => ({
        relTick: n.ticks - startTick,
        durationTicks: n.durationTicks,
        pitch: n.midi,
    }));
}

function buildInvertedNotes(base: InternalNote[], options: CanonSearchOptions): InternalNote[] {
    return base.map(n => ({
        ...n,
        pitch: getInvertedPitch(
            n.pitch,
            options.pivotMidi,
            options.scaleRoot,
            options.scaleMode,
            options.useChromaticInversion
        ),
    }));
}

/**
 * Returns the variant array index to use for a given entry position.
 *   0 = normal full
 *   1 = inverted full  (only when inversions allowed)
 *   2 = normal truncated
 *   3 = inverted truncated
 */
function getVariantIndex(
    entryIndex: number,
    pattern: CanonInversionPattern,
    hasTruncated: boolean,
    hasInverted: boolean
): number {
    const isInverted = (() => {
        if (!hasInverted) return false;
        switch (pattern) {
            case 'none':         return false;
            case 'alternating':  return entryIndex % 2 === 1;
            case 'all-inverted': return entryIndex > 0;
        }
    })();

    if (hasTruncated && isInverted)  return 3;
    if (hasTruncated && !isInverted) return 2;
    if (!hasTruncated && isInverted) return 1;
    return 0;
}

/**
 * Returns the number of beats that must be removed from each entry due to
 * voice-cycle overlap.  Zero when no truncation is necessary.
 */
function computeAutoTruncation(
    delayBeats: number,
    voices: number,
    subjectLengthBeats: number,
    chainLength: number
): number {
    const cycleBeats = delayBeats * voices;
    if (chainLength > voices && cycleBeats < subjectLengthBeats) {
        return subjectLengthBeats - cycleBeats;
    }
    return 0;
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

export function runCanonSearch(
    subjectNotes: RawNote[],
    options: CanonSearchOptions,
    ppq: number
): CanonSearchReport {
    const startTime = Date.now();

    if (subjectNotes.length === 0) {
        return { results: [], totalEvaluated: 0, timeMs: 0 };
    }

    const sorted = [...subjectNotes].sort((a, b) => a.ticks - b.ticks);
    const subjectStartTick = sorted[0].ticks;
    const subjectEndTick = Math.max(...sorted.map(n => n.ticks + n.durationTicks));
    const subjectLengthTicks = subjectEndTick - subjectStartTick;
    const subjectLengthBeats = subjectLengthTicks / ppq;

    const baseNotes = buildBaseNotes(sorted, ppq);
    const invNotes = buildInvertedNotes(baseNotes, options);

    // Delay range at 0.5-beat resolution
    const minDelay = Math.max(0.5, options.delayMinBeats);
    const maxDelay = Math.max(minDelay, options.delayMaxBeats);
    const delays: number[] = [];
    for (let d = minDelay; d <= maxDelay + 1e-9; d += 0.5) {
        delays.push(Math.round(d * 2) / 2);
    }

    // Allowed transposition steps
    const tSteps: number[] = [...TRADITIONAL_STEPS];
    if (options.allowThirdSixth) {
        THIRD_SIXTH_STEPS.forEach(s => { if (!tSteps.includes(s)) tSteps.push(s); });
    }

    // Inversion patterns
    const patterns: CanonInversionPattern[] = options.allowInversions
        ? ['none', 'alternating', 'all-inverted']
        : ['none'];

    // Chain length range
    const minLen = Math.max(2, options.chainLengthMin);
    const maxLen = Math.max(minLen, options.chainLengthMax);

    const V = options.ensembleTotal;
    const roles = getVoiceRoles(V);
    const mode: CanonTranspositionMode = options.transpositionMode ?? 'independent';

    // Build the set of transposition V-tuples to search over.
    //
    // 'independent': enumerate all V-tuples whose per-voice transpositions
    //   satisfy the B-rule voice-spacing constraints.
    //
    // 'cumulative': for every T in the allowed step list build tuple [0,T,2T,…];
    //   only tuples that satisfy voice-spacing rules are retained.
    let tTuples: number[][];

    if (mode === 'cumulative') {
        // For each T, step each consecutive voice by T (same interval class),
        // adjusting by ±octaves as needed to satisfy voice-spacing rules.
        const seen = new Set<string>();
        tTuples = [];
        for (const T of tSteps) {
            const tuple = buildCumulativeTuple(T, V, roles);
            if (tuple === null) continue;
            const key = tuple.join(',');
            if (seen.has(key)) continue; // different T values can produce the same tuple
            seen.add(key);
            tTuples.push(tuple);
        }
    } else {
        // 'independent': full enumeration of valid V-tuples
        tTuples = enumerateTranspositionTuples(tSteps, V, roles);
    }

    const results: CanonChainResult[] = [];
    let totalEvaluated = 0;

    for (const delayBeats of delays) {
        for (const tTuple of tTuples) {
            for (const pattern of patterns) {
                for (let chainLen = minLen; chainLen <= maxLen; chainLen++) {
                    totalEvaluated++;

                    // ----------------------------------------------------------
                    // Auto-truncation
                    // ----------------------------------------------------------
                    const beatsRemoved = computeAutoTruncation(
                        delayBeats, V, subjectLengthBeats, chainLen
                    );
                    const hasTruncation = beatsRemoved > 0;
                    const truncTicks = hasTruncation
                        ? Math.round((subjectLengthBeats - beatsRemoved) * ppq)
                        : subjectLengthTicks;

                    // ----------------------------------------------------------
                    // Build variant array
                    //   [0] normal full
                    //   [1] inverted full        (only when inversions allowed)
                    //   [2] normal truncated     (only when hasTruncation)
                    //   [3] inverted truncated   (only when inversions + hasTruncation)
                    // ----------------------------------------------------------
                    const variants: SubjectVariant[] = [];

                    variants.push({
                        type: 'N', truncationBeats: 0,
                        lengthTicks: subjectLengthTicks, notes: baseNotes,
                    });

                    if (options.allowInversions) {
                        variants.push({
                            type: 'I', truncationBeats: 0,
                            lengthTicks: subjectLengthTicks, notes: invNotes,
                        });
                    }

                    if (hasTruncation) {
                        const truncNotes: InternalNote[] = baseNotes
                            .filter(n => n.relTick < truncTicks)
                            .map(n => ({
                                relTick: n.relTick,
                                durationTicks: Math.min(n.durationTicks, truncTicks - n.relTick),
                                pitch: n.pitch,
                            }));
                        variants.push({
                            type: 'N', truncationBeats: beatsRemoved,
                            lengthTicks: truncTicks, notes: truncNotes,
                        });
                    }

                    if (options.allowInversions && hasTruncation) {
                        const truncInvNotes: InternalNote[] = invNotes
                            .filter(n => n.relTick < truncTicks)
                            .map(n => ({
                                relTick: n.relTick,
                                durationTicks: Math.min(n.durationTicks, truncTicks - n.relTick),
                                pitch: n.pitch,
                            }));
                        variants.push({
                            type: 'I', truncationBeats: beatsRemoved,
                            lengthTicks: truncTicks, notes: truncInvNotes,
                        });
                    }

                    // ----------------------------------------------------------
                    // Build chain entries
                    // ----------------------------------------------------------
                    const entries: StrettoChainOption[] = [];
                    const variantIndices: number[] = [];

                    for (let i = 0; i < chainLen; i++) {
                        const voiceIndex = i % V;

                        // Inversion determined by pattern and entry position
                        const isInverted = (() => {
                            if (!options.allowInversions) return false;
                            switch (pattern) {
                                case 'none':         return false;
                                case 'alternating':  return i % 2 === 1;
                                case 'all-inverted': return i > 0;
                            }
                        })();

                        const vIdx = Math.min(
                            getVariantIndex(i, pattern, hasTruncation, options.allowInversions),
                            variants.length - 1
                        );
                        variantIndices.push(vIdx);

                        entries.push({
                            startBeat:    i * delayBeats,
                            transposition: tTuple[voiceIndex],
                            type:         isInverted ? 'I' : 'N',
                            length:       variants[vIdx].lengthTicks,
                            voiceIndex,
                        });
                    }

                    // ----------------------------------------------------------
                    // Score
                    // ----------------------------------------------------------
                    const { score, scoreLog, detectedChords } = calculateCanonScore(
                        entries, variants, variantIndices, beatsRemoved, ppq
                    );

                    const tupleKey = tTuple.join(',');
                    results.push({
                        id: `canon-${delayBeats}-${tupleKey}-${pattern}-${chainLen}-${totalEvaluated}`,
                        entries,
                        score,
                        scoreLog,
                        delayBeats,
                        transpositionSteps: tTuple,
                        chainLength: chainLen,
                        inversionPattern: pattern,
                        detectedChords,
                        autoTruncatedBeats: beatsRemoved,
                        warnings: [],
                    });
                }
            }
        }
    }

    const timeMs = Date.now() - startTime;
    return { results, totalEvaluated, timeMs };
}
