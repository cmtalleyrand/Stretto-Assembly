
/**
 * Canon Search Algorithm
 *
 * Enumerates ALL combinations of (delay, transposition step, inversion pattern,
 * chain length) for a given subject, scores each using canon-specific scoring,
 * and returns the full result set for user filtering.
 *
 * Unlike the stretto search, this does NOT pre-filter on delay-progression rules
 * (A.1–A.10). The only structural decisions are:
 *   - All inter-entry delays are identical.
 *   - Auto-truncation is applied when delay × voices < subject length.
 *   - Voice assignment cycles: entry i → voice (i mod ensembleTotal).
 */

import {
    RawNote,
    CanonSearchOptions,
    CanonChainResult,
    CanonSearchReport,
    CanonInversionPattern,
    StrettoChainOption,
} from '../../types';
import { SubjectVariant, InternalNote } from './strettoScoring';
import { getInvertedPitch } from './strettoCore';
import { calculateCanonScore } from './canonScoring';
import { SCALE_INTERVALS } from './strettoConstants';

// ---------------------------------------------------------------------------
// Transposition sets
// ---------------------------------------------------------------------------

/** Traditional canon intervals (unison, 4th, 5th, octave, double-octave). */
const TRADITIONAL_STEPS: number[] = [0, 5, -5, 7, -7, 12, -12, 24, -24];
/** 3rds and 6ths added when allowThirdSixth is true. */
const THIRD_SIXTH_STEPS: number[] = [3, -3, 4, -4, 8, -8, 9, -9];

// ---------------------------------------------------------------------------
// Helpers
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

function buildInvertedNotes(
    base: InternalNote[],
    options: CanonSearchOptions
): InternalNote[] {
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
 * Returns the variant index to use for a given entry position and inversion pattern.
 *  0 = normal full
 *  1 = inverted full (only present when inversions allowed)
 *  2 = normal truncated
 *  3 = inverted truncated
 */
function getVariantIndex(
    entryIndex: number,
    pattern: CanonInversionPattern,
    hasTruncated: boolean,
    hasInverted: boolean
): number {
    const useTrunc = hasTruncated;
    const isInverted = (() => {
        if (!hasInverted) return false;
        switch (pattern) {
            case 'none': return false;
            case 'alternating': return entryIndex % 2 === 1;
            case 'all-inverted': return entryIndex > 0; // entry 0 is always normal
        }
    })();

    if (useTrunc && isInverted) return 3;
    if (useTrunc && !isInverted) return 2;
    if (!useTrunc && isInverted) return 1;
    return 0;
}

/**
 * Compute the auto-truncated length in beats.
 * When delay * voices < subjectLengthBeats AND chainLength > voices,
 * entries must be truncated to (delay * voices) beats so that the next
 * entry of the same voice doesn't overlap the current one.
 */
function computeAutoTruncation(
    delayBeats: number,
    voices: number,
    subjectLengthBeats: number,
    chainLength: number
): number {
    const cycleBeats = delayBeats * voices;
    if (chainLength > voices && cycleBeats < subjectLengthBeats) {
        return subjectLengthBeats - cycleBeats; // beats truncated
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

    // Delay range: step at 0.5-beat resolution
    const delayStep = 0.5;
    const minDelay = Math.max(0.5, options.delayMinBeats);
    const maxDelay = Math.max(minDelay, options.delayMaxBeats);

    const delays: number[] = [];
    for (let d = minDelay; d <= maxDelay + 1e-9; d += delayStep) {
        delays.push(Math.round(d * 2) / 2); // round to nearest 0.5
    }

    // Transposition steps
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

    const results: CanonChainResult[] = [];
    let totalEvaluated = 0;

    for (const delayBeats of delays) {
        const delayTicks = Math.round(delayBeats * ppq);

        for (const T of tSteps) {
            for (const pattern of patterns) {
                // Skip pure inversion patterns when inversions not allowed
                if (!options.allowInversions && pattern !== 'none') continue;

                for (let chainLen = minLen; chainLen <= maxLen; chainLen++) {
                    totalEvaluated++;

                    // ----------------------------------------------------------------
                    // Auto-truncation
                    // ----------------------------------------------------------------
                    const beatsRemoved = computeAutoTruncation(
                        delayBeats,
                        options.ensembleTotal,
                        subjectLengthBeats,
                        chainLen
                    );
                    const hasTruncation = beatsRemoved > 0;
                    const truncTicks = hasTruncation
                        ? Math.round((subjectLengthBeats - beatsRemoved) * ppq)
                        : subjectLengthTicks;

                    // Build variants: [0]=normal, [1]=inverted, [2]=normalTrunc, [3]=invertedTrunc
                    const variants: SubjectVariant[] = [];

                    // Variant 0: normal full
                    variants.push({
                        type: 'N',
                        truncationBeats: 0,
                        lengthTicks: subjectLengthTicks,
                        notes: baseNotes,
                    });

                    // Variant 1: inverted full (only when inversions allowed)
                    if (options.allowInversions) {
                        variants.push({
                            type: 'I',
                            truncationBeats: 0,
                            lengthTicks: subjectLengthTicks,
                            notes: invNotes,
                        });
                    }

                    // Variant 2: normal truncated (only when needed)
                    if (hasTruncation) {
                        const truncNotes: InternalNote[] = baseNotes
                            .filter(n => n.relTick < truncTicks)
                            .map(n => ({
                                relTick: n.relTick,
                                durationTicks: Math.min(n.durationTicks, truncTicks - n.relTick),
                                pitch: n.pitch,
                            }));
                        variants.push({
                            type: 'N',
                            truncationBeats: beatsRemoved,
                            lengthTicks: truncTicks,
                            notes: truncNotes,
                        });
                    }

                    // Variant 3: inverted truncated (only when inversions + truncation)
                    if (options.allowInversions && hasTruncation) {
                        const truncInvNotes: InternalNote[] = invNotes
                            .filter(n => n.relTick < truncTicks)
                            .map(n => ({
                                relTick: n.relTick,
                                durationTicks: Math.min(n.durationTicks, truncTicks - n.relTick),
                                pitch: n.pitch,
                            }));
                        variants.push({
                            type: 'I',
                            truncationBeats: beatsRemoved,
                            lengthTicks: truncTicks,
                            notes: truncInvNotes,
                        });
                    }

                    // ----------------------------------------------------------------
                    // Build chain entries
                    // ----------------------------------------------------------------
                    const entries: StrettoChainOption[] = [];
                    const variantIndices: number[] = [];

                    for (let i = 0; i < chainLen; i++) {
                        // Voice cycles through ensembleTotal
                        const voiceIndex = i % options.ensembleTotal;

                        // Absolute transposition: each voice uses cycled slot's T offset
                        // Slot = voiceIndex (position in cycle)
                        const absoluteTransposition = voiceIndex * T;

                        // Inversion: determined by pattern and entry index
                        const isInverted = (() => {
                            if (!options.allowInversions) return false;
                            switch (pattern) {
                                case 'none': return false;
                                case 'alternating': return i % 2 === 1;
                                case 'all-inverted': return i > 0;
                            }
                        })();

                        // Variant index
                        const vIdx = getVariantIndex(i, pattern, hasTruncation, options.allowInversions);
                        // Clamp to actual variants array length
                        const safeVIdx = Math.min(vIdx, variants.length - 1);
                        variantIndices.push(safeVIdx);

                        const variant = variants[safeVIdx];

                        entries.push({
                            startBeat: i * delayBeats,
                            transposition: absoluteTransposition,
                            type: isInverted ? 'I' : 'N',
                            length: variant.lengthTicks,
                            voiceIndex,
                        });
                    }

                    // ----------------------------------------------------------------
                    // Score
                    // ----------------------------------------------------------------
                    const { score, scoreLog, detectedChords } = calculateCanonScore(
                        entries,
                        variants,
                        variantIndices,
                        beatsRemoved,
                        ppq
                    );

                    results.push({
                        id: `canon-${delayBeats}-${T}-${pattern}-${chainLen}-${totalEvaluated}`,
                        entries,
                        score,
                        scoreLog,
                        delayBeats,
                        transpositionStep: T,
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
