// Phase 1 — Exhaustive prefix enumerator up to depth H.
//
// Streams Model A delay-variant sequences. For each, walks transpositions
// applying every rule that the existing pipeline applies BEFORE post-hoc
// voice CSP:
//   - A.1–A.10 + quotas (from Model A)
//   - A.7 at every adjacent boundary
//   - Pair-harmonic admissibility for every temporally overlapping pair
//   - Parallel-P5/P8 conditional rule (consecutive boundaries OR
//     adjacent delays ≥ Sb/3)
//   - §C active-transposition uniqueness
//
// Voice-assignment-dependent rules (B-rules across all pairs, §C re-entry,
// §D P4 bass-role) are NOT applied here — they belong to post-hoc CSP,
// matching the split in the existing pipeline.
//
// Rules deferred to a later commit:
//   - thirdSixthMode quota (`isRestrictedInterval` accumulation)
//   - the implementation-side ratio predicate at strettoGenerator.ts:3209
//     (`nextRestricted > 1 && nextRestricted >= nextFree`)
//
// Both are inactive at baseOptions (qRestricted = 'None'). Validation
// against searchStrettoChains is meaningful at qRestricted = 'None' only
// until those are added.

import {
    checkCounterpointStructureWithBassRole,
    type isVoicePairAllowedForTransposition as _voiceUnused
} from './strettoGenerator';
import { getInvertedPitch } from './strettoCore';
import type { SubjectVariant, InternalNote } from './strettoScoring';
import type { RawNote, StrettoSearchOptions, StrettoConstraintMode } from '../../types';
import { buildDelayVariantSequences } from './delayVariantModel';

export interface PhaseOnePrefixEntry {
    startTick: number;
    variantIndex: number;
    transposition: number;
    type: 'N' | 'I';
    lengthTicks: number;
    truncationBeats: number;
}

export interface PhaseOnePrefix {
    entries: PhaseOnePrefixEntry[];
}

export interface PhaseOneResult {
    prefixes: PhaseOnePrefix[];
    count: number;          // == prefixes.length unless cap hit
    cappedAtMax: boolean;
    timeMs: number;
}

export interface PhaseOneOptions {
    rawSubject: RawNote[];
    options: StrettoSearchOptions;
    ppq: number;
    transpositionPool: number[];
    H: number;              // chain depth (entries including root)
    maxPrefixes?: number;
    streamingOnPrefix?: (p: PhaseOnePrefix) => void;
}

const A7_MIN_SEMITONES = 5;

// --- Variant build (mirrors strettoGenerator.ts:1807–1844) ---

function buildVariants(rawSubject: RawNote[], options: StrettoSearchOptions, ppq: number): SubjectVariant[] {
    const sorted = [...rawSubject].filter(n => !!n).sort((a, b) => a.ticks - b.ticks);
    if (sorted.length === 0) return [];
    const startTick = sorted[0].ticks;
    const baseNotes: InternalNote[] = sorted.map(n => ({
        relTick: n.ticks - startTick,
        durationTicks: n.durationTicks,
        pitch: n.midi
    }));
    const lengthTicks = Math.max(...baseNotes.map(n => n.relTick + n.durationTicks));

    const variants: SubjectVariant[] = [];
    variants.push({ type: 'N', truncationBeats: 0, lengthTicks, notes: baseNotes });

    const inversionEnabled = options.inversionMode !== 'None';
    const truncationEnabled = options.truncationMode !== 'None' && options.truncationTargetBeats > 0;
    let invNotes: InternalNote[] | null = null;
    if (inversionEnabled) {
        invNotes = baseNotes.map(n => ({
            ...n,
            pitch: getInvertedPitch(n.pitch, options.pivotMidi, options.scaleRoot, options.scaleMode, options.useChromaticInversion)
        }));
        variants.push({ type: 'I', truncationBeats: 0, lengthTicks, notes: invNotes });
    }
    if (truncationEnabled) {
        const truncTicks = Math.round(options.truncationTargetBeats * ppq);
        if (truncTicks < lengthTicks) {
            variants.push({
                type: 'N', truncationBeats: options.truncationTargetBeats, lengthTicks: truncTicks,
                notes: baseNotes.filter(n => n.relTick < truncTicks).map(n => ({
                    relTick: n.relTick,
                    durationTicks: Math.min(n.durationTicks, truncTicks - n.relTick),
                    pitch: n.pitch
                }))
            });
            if (inversionEnabled && invNotes) {
                variants.push({
                    type: 'I', truncationBeats: options.truncationTargetBeats, lengthTicks: truncTicks,
                    notes: invNotes.filter(n => n.relTick < truncTicks).map(n => ({
                        relTick: n.relTick,
                        durationTicks: Math.min(n.durationTicks, truncTicks - n.relTick),
                        pitch: n.pitch
                    }))
                });
            }
        }
    }
    return variants;
}

// --- Pair record cache ---

interface PairRecord {
    compatible: boolean;
    hasParallelPerfect58: boolean;
}

function buildPairCache(
    variants: SubjectVariant[],
    ppq: number,
    delayStep: number,
    transpositionPool: number[],
    options: StrettoSearchOptions
): Map<string, PairRecord> {
    const cache = new Map<string, PairRecord>();
    const fourthTreatment = options.disallowComplexExceptions ? 'dissonant' : 'provisional';
    const ΔtSet = new Set<number>();
    for (const a of transpositionPool) for (const b of transpositionPool) ΔtSet.add(b - a);

    for (let vA = 0; vA < variants.length; vA++) {
        for (let vB = 0; vB < variants.length; vB++) {
            const lenA = variants[vA].lengthTicks;
            // Cover delays right up to (but not including) lenA — overlap region for any
            // non-adjacent pair (k, i) where startTick_i − startTick_k < lenA.
            const dMaxAdjacent = Math.floor(2 * lenA / 3);
            const dMaxOverlap = lenA - 1;
            // Adjacent delays only go up to 2/3 lenA per A.6, but overlapping non-adjacent
            // pairs span the full overlap range. We cache the union.
            for (let d = delayStep; d <= dMaxOverlap; d += delayStep) {
                for (const Δt of ΔtSet) {
                    const r = checkCounterpointStructureWithBassRole(
                        variants[vA], variants[vB], d, Δt, options.maxPairwiseDissonance,
                        fourthTreatment, ppq, options.meterNumerator ?? 4, options.meterDenominator ?? 4,
                        options.allowP4RunLengthExtension ?? false, true
                    );
                    cache.set(`${vA}|${vB}|${d}|${Δt}`, {
                        compatible: r.compatible,
                        hasParallelPerfect58: r.hasParallelPerfect58
                    });
                    void dMaxAdjacent; // satisfy linter; bound documented
                }
            }
        }
    }
    return cache;
}

// --- Phase 1 enumerator ---

export async function runPhaseOne(opts: PhaseOneOptions): Promise<PhaseOneResult> {
    const t0 = Date.now();
    const { rawSubject, options, ppq, transpositionPool, H } = opts;
    const maxPrefixes = opts.maxPrefixes ?? Infinity;
    const delayStep = ppq / 2;

    const variants = buildVariants(rawSubject, options, ppq);
    if (variants.length === 0) {
        return { prefixes: [], count: 0, cappedAtMax: false, timeMs: Date.now() - t0 };
    }
    const pairCache = buildPairCache(variants, ppq, delayStep, transpositionPool, options);

    const Sb = variants[0].lengthTicks;
    const SbThird = Math.floor(Sb / 3);  // A.1 long-delay threshold; also parallel-P5/P8 trigger threshold

    const prefixes: PhaseOnePrefix[] = [];
    let count = 0;
    let cappedAtMax = false;

    // Streaming Model A. For each delay-variant sequence, walk transpositions.
    await buildDelayVariantSequences(
        variants, delayStep, H, options,
        {
            onSequence: (seq) => {
                if (cappedAtMax) return;
                // seq.delays has length H-1, seq.variants has length H (root at 0).
                const startTicks = new Int32Array(H);
                for (let i = 1; i < H; i++) startTicks[i] = startTicks[i - 1] + seq.delays[i - 1];

                // tStack[k] = transposition of e_k. tStack[0] = 0.
                const tStack = new Int32Array(H);
                // boundaryHasParallel[k] = (e_{k-1}, e_k) pair's hasParallelPerfect58. Index 0 unused.
                const boundaryHasParallel = new Uint8Array(H);

                const dfs = (i: number): void => {
                    if (cappedAtMax) return;
                    if (i === H) {
                        const entries: PhaseOnePrefixEntry[] = [];
                        for (let k = 0; k < H; k++) {
                            const v = variants[seq.variants[k]];
                            entries.push({
                                startTick: startTicks[k],
                                variantIndex: seq.variants[k],
                                transposition: tStack[k],
                                type: v.type,
                                lengthTicks: v.lengthTicks,
                                truncationBeats: v.truncationBeats
                            });
                        }
                        const prefix: PhaseOnePrefix = { entries };
                        if (opts.streamingOnPrefix) opts.streamingOnPrefix(prefix);
                        else prefixes.push(prefix);
                        count++;
                        if (count >= maxPrefixes) cappedAtMax = true;
                        return;
                    }

                    const vCurrIdx = seq.variants[i];
                    const dCurr = seq.delays[i - 1];
                    const sCurr = startTicks[i];
                    const tPrev = tStack[i - 1];
                    const vPrevIdx = seq.variants[i - 1];

                    for (const tCand of transpositionPool) {
                        // A.7
                        const Δt = tCand - tPrev;
                        if (Math.abs(Δt) < A7_MIN_SEMITONES) continue;

                        // Pair-harmony at boundary (i-1, i)
                        const adjPair = pairCache.get(`${vPrevIdx}|${vCurrIdx}|${dCurr}|${Δt}`);
                        if (!adjPair || !adjPair.compatible) continue;

                        // Parallel-P5/P8 conditional rule
                        const adjParallel = adjPair.hasParallelPerfect58;
                        if (adjParallel) {
                            // Trigger 1: consecutive boundaries both have it
                            if (i >= 2 && boundaryHasParallel[i - 1]) continue;
                            // Trigger 2: any P5/P8 with both adjacent delays >= Sb/3
                            if (i >= 2) {
                                const dPrev = seq.delays[i - 2];
                                if (dPrev >= SbThird && dCurr >= SbThird) continue;
                            } else {
                                // i == 1: only one delay; rule needs two adjacent delays.
                                // Trigger 2 cannot fire. Trigger 1 cannot fire (no prior boundary).
                            }
                        }

                        // Pair-harmony for ALL non-adjacent overlapping pairs (k, i)
                        let nonAdjFail = false;
                        for (let k = 0; k < i - 1; k++) {
                            const eEnd = startTicks[k] + variants[seq.variants[k]].lengthTicks;
                            if (eEnd <= sCurr) continue;  // not overlapping
                            const dKi = sCurr - startTicks[k];
                            const ΔtKi = tCand - tStack[k];
                            const rec = pairCache.get(`${seq.variants[k]}|${vCurrIdx}|${dKi}|${ΔtKi}`);
                            if (!rec || !rec.compatible) { nonAdjFail = true; break; }
                        }
                        if (nonAdjFail) continue;

                        // §C active-transposition uniqueness
                        let tConflict = false;
                        for (let k = 0; k < i; k++) {
                            const eEnd = startTicks[k] + variants[seq.variants[k]].lengthTicks;
                            if (eEnd > sCurr && tStack[k] === tCand) { tConflict = true; break; }
                        }
                        if (tConflict) continue;

                        tStack[i] = tCand;
                        boundaryHasParallel[i] = adjParallel ? 1 : 0;
                        dfs(i + 1);
                    }
                };
                dfs(1);
            }
        }
    );

    return {
        prefixes,
        count,
        cappedAtMax,
        timeMs: Date.now() - t0
    };
}

// --- Suppress unused-import warning ---
void (null as unknown as typeof _voiceUnused);
