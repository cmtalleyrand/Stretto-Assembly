// H-bounded search architecture.
//
// Phase 1: exhaustive prefix enumeration to depth H (existing
//   phaseOnePrefixEnum.runPhaseOne). Voice-agnostic, applies every
//   non-voice-dependent rule.
//
// Frontier projection: each prefix is projected to a feature vector
//   capturing every datum needed for forward-extension validity. Two
//   prefixes with identical frontier produce identical extensions.
//
// Phase 2: for each distinct frontier, continue from depth H to
//   targetChainLength applying the same rules as Phase 1. Output:
//   continuation suffixes.
//
// Combine: full chain = (prefix [0..H-1]) ++ (continuation [H..n-1]).
//
// Voice CSP and scoring are NOT applied here — assignVoices is not
// exported from strettoGenerator. Output is voice-agnostic structural
// full chains. Hooking into the existing voice CSP / scoring is a
// follow-up that requires exporting assignVoices.

import { checkCounterpointStructureWithBassRole, isVoicePairAllowedForTransposition } from './strettoGenerator';
import { calculateStrettoScore } from './strettoScoring';
import type { StrettoChainOption, StrettoChainResult } from '../../types';
import { getInvertedPitch } from './strettoCore';
import type { SubjectVariant, InternalNote } from './strettoScoring';
import type { RawNote, StrettoSearchOptions, StrettoConstraintMode } from '../../types';
import { buildDelayVariantSequences } from './delayVariantModel';
import { runPhaseOne, type PhaseOnePrefix, type PhaseOnePrefixEntry } from './phaseOnePrefixEnum';

export interface HBoundedFullChain {
    entries: PhaseOnePrefixEntry[];
}

export interface HBoundedSearchOptions {
    rawSubject: RawNote[];
    options: StrettoSearchOptions;
    ppq: number;
    transpositionPool: number[];
    H: number;          // 1 <= H <= targetChainLength; H == targetChainLength means no continuation
    maxPrefixes?: number;
    maxContinuationsPerFrontier?: number;
}

export interface HBoundedSearchResult {
    chains: HBoundedFullChain[];
    distinctFrontiers: number;
    phase1Prefixes: number;
    phase2Continuations: number;
    timeMs: number;
}

const A7_MIN_SEMITONES = 5;

// --- Variant build (shared with phaseOnePrefixEnum; duplicated to avoid coupling) ---

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

interface PairRecord {
    compatible: boolean;
    hasParallelPerfect58: boolean;
    hasFourth: boolean;
    compatibleWhenPairIncludesBass: boolean;
}

function buildPairCache(
    variants: SubjectVariant[], ppq: number, delayStep: number,
    transpositionPool: number[], options: StrettoSearchOptions
): Map<string, PairRecord> {
    const cache = new Map<string, PairRecord>();
    const ΔtSet = new Set<number>();
    for (const a of transpositionPool) for (const b of transpositionPool) ΔtSet.add(b - a);
    for (let vA = 0; vA < variants.length; vA++) {
        for (let vB = 0; vB < variants.length; vB++) {
            const lenA = variants[vA].lengthTicks;
            const dMaxOverlap = lenA - 1;
            for (let d = delayStep; d <= dMaxOverlap; d += delayStep) {
                for (const Δt of ΔtSet) {
                    const r = checkCounterpointStructureWithBassRole(
                        variants[vA], variants[vB], d, Δt, options.maxPairwiseDissonance,
                        'provisional', ppq, options.meterNumerator ?? 4, options.meterDenominator ?? 4,
                        options.allowP4RunLengthExtension ?? false, true
                    );
                    // For pairs containing a P4, re-run with 'dissonant' treatment
                    // to determine compatibility when the pair includes the bass voice
                    // (P4-as-bass dissonance, §D). If no P4, both treatments give the
                    // same compatibility outcome.
                    let compatibleWhenPairIncludesBass = r.compatible;
                    if (r.hasFourth) {
                        const r2 = checkCounterpointStructureWithBassRole(
                            variants[vA], variants[vB], d, Δt, options.maxPairwiseDissonance,
                            'dissonant', ppq, options.meterNumerator ?? 4, options.meterDenominator ?? 4,
                            options.allowP4RunLengthExtension ?? false, true
                        );
                        compatibleWhenPairIncludesBass = r2.compatible;
                    }
                    cache.set(`${vA}|${vB}|${d}|${Δt}`, {
                        compatible: r.compatible,
                        hasParallelPerfect58: r.hasParallelPerfect58,
                        hasFourth: r.hasFourth,
                        compatibleWhenPairIncludesBass
                    });
                }
            }
        }
    }
    return cache;
}

// --- Frontier projection ---
//
// The frontier captures every datum that affects forward extension. Two
// prefixes with identical frontier produce identical valid continuations.

interface Frontier {
    key: string;
    activeEntries: { variantIndex: number; transposition: number; relEnd: number }[];
    lastVariantIndex: number;
    lastTransposition: number;
    lastDelay: number;
    prevPrevDelay: number;
    nInv: number;
    nTrunc: number;
    usedLongDelays: number[];   // sorted; relative to root so canonical
}

function projectFrontier(p: PhaseOnePrefix, variants: SubjectVariant[], SbThird: number): Frontier {
    const H = p.entries.length;
    const last = p.entries[H - 1];
    const sH = last.startTick;
    const activeEntries: Frontier['activeEntries'] = [];
    let nInv = 0, nTrunc = 0;
    const usedLongDelays: number[] = [];
    for (let k = 0; k < H; k++) {
        const e = p.entries[k];
        const end = e.startTick + e.lengthTicks;
        // Active = still sounding at sH (excluding the last entry itself, which is always "active" as the just-placed one)
        if (k < H - 1 && end > sH) {
            activeEntries.push({
                variantIndex: e.variantIndex,
                transposition: e.transposition,
                relEnd: end - sH
            });
        }
        if (e.type === 'I') nInv++;
        if (e.truncationBeats > 0) nTrunc++;
        if (k > 0) {
            const d = e.startTick - p.entries[k - 1].startTick;
            if (d > SbThird) usedLongDelays.push(d);
        }
    }
    usedLongDelays.sort((a, b) => a - b);
    const lastDelay = H >= 2 ? p.entries[H - 1].startTick - p.entries[H - 2].startTick : 0;
    const prevPrevDelay = H >= 3 ? p.entries[H - 2].startTick - p.entries[H - 3].startTick : 0;

    const activeSig = activeEntries
        .map(a => `${a.variantIndex},${a.transposition},${a.relEnd}`).join(';');
    const usedSig = usedLongDelays.join(',');
    const key = `${last.variantIndex}|${last.transposition}|${lastDelay}|${prevPrevDelay}|${nInv},${nTrunc}|${activeSig}|${usedSig}`;

    return {
        key,
        activeEntries,
        lastVariantIndex: last.variantIndex,
        lastTransposition: last.transposition,
        lastDelay,
        prevPrevDelay,
        nInv,
        nTrunc,
        usedLongDelays
    };
}

// --- Phase 2 continuation ---
//
// Starts from frontier state. Extends to targetChainLength applying the
// same rules as Phase 1. Output: array of "continuation suffixes" — the
// entries from depth H to depth targetChainLength-1, with startTick
// relative to the frontier's last-entry start (i.e., relative coords).

interface ContinuationEntry {
    relStartTick: number;       // relative to last frontier entry's startTick (= 0 for the first continuation entry's offset from frontier last)
    variantIndex: number;
    transposition: number;
    lengthTicks: number;
    type: 'N' | 'I';
    truncationBeats: number;
}

interface Continuation {
    entries: ContinuationEntry[];
}

function continueFromFrontier(
    frontier: Frontier,
    variants: SubjectVariant[],
    pairCache: Map<string, PairRecord>,
    transpositionPool: number[],
    targetChainLength: number,
    H: number,
    options: StrettoSearchOptions,
    ppq: number,
    delayStep: number,
    maxContinuations: number
): Continuation[] {
    const continuationsNeeded = targetChainLength - H;
    if (continuationsNeeded <= 0) return [{ entries: [] }];

    const SbTicks = variants[0].lengthTicks;
    const SbThird = Math.floor(SbTicks / 3);
    const halfSbTicks = Math.floor(SbTicks / 2);

    // Reconstruct a synthetic prefix state at depth H using frontier data.
    // sH = 0 (relative to last frontier entry start). Active entries get negative startTick
    // (they started before sH). Last entry is at startTick = 0.
    // Active entries' start in sH-relative coords:
    //   e_k.startTick (absolute) = end_k − lengthTicks_k
    //   relativeStart = e_k.startTick − sH = (end_k − sH) − lengthTicks_k = relEnd − lengthTicks_k
    // Always negative (entry began before sH).
    const activeStart = frontier.activeEntries.map(a => a.relEnd - variants[a.variantIndex].lengthTicks);
    // Build chain in sH-relative coordinates: [...active entries, last entry]
    const prefixEntries: { variantIndex: number; transposition: number; startTick: number }[] = [];
    for (let i = 0; i < frontier.activeEntries.length; i++) {
        const a = frontier.activeEntries[i];
        prefixEntries.push({
            variantIndex: a.variantIndex,
            transposition: a.transposition,
            startTick: activeStart[i]
        });
    }
    prefixEntries.push({
        variantIndex: frontier.lastVariantIndex,
        transposition: frontier.lastTransposition,
        startTick: 0
    });

    const usedLongs = new Set<number>(frontier.usedLongDelays);
    let nInv = frontier.nInv;
    let nTrunc = frontier.nTrunc;

    const continuations: Continuation[] = [];
    let cappedAtMax = false;

    // DFS state: current chain extending prefixEntries, latest delay/prevPrev tracking.
    const dfsChain: { variantIndex: number; transposition: number; startTick: number }[] = [...prefixEntries];
    const dfsDelays: number[] = [];      // delays AT continuation positions only
    const dfsParallelHistory: boolean[] = [false]; // boundary parallel for last-frontier→continuation[0] is frontier's last; we don't know it here without recomputing
    // Boundary parallel for the entry BEFORE position H is unknown without history; conservative: treat as false (won't trigger trigger-1 at position H+1 unless this assumption is too lax).
    // For correctness we need: if continuation[1] has parallel and continuation[0] also has parallel, reject. We track during continuation only.

    function dfs(continuationIdx: number, lastDelay: number, prevPrevDelay: number): void {
        if (cappedAtMax) return;
        if (continuationIdx === continuationsNeeded) {
            // Emit continuation
            const entries: ContinuationEntry[] = [];
            for (let i = 0; i < continuationsNeeded; i++) {
                const c = dfsChain[prefixEntries.length + i];
                const v = variants[c.variantIndex];
                entries.push({
                    relStartTick: c.startTick,
                    variantIndex: c.variantIndex,
                    transposition: c.transposition,
                    lengthTicks: v.lengthTicks,
                    type: v.type,
                    truncationBeats: v.truncationBeats
                });
            }
            continuations.push({ entries });
            if (continuations.length >= maxContinuations) cappedAtMax = true;
            return;
        }

        // Determine prev variant (always the entry just placed, which is dfsChain.last)
        const prev = dfsChain[dfsChain.length - 1];
        const prevVariant = variants[prev.variantIndex];
        const prevLengthTicks = prevVariant.lengthTicks;
        const prevIsTrunc = prevVariant.truncationBeats > 0;
        const prevIsInv = prevVariant.type === 'I';

        // Delay range for next entry
        let minD = delayStep;
        let maxD = Math.floor(prevLengthTicks * 2 / 3);    // A.6
        // A.5 max contraction
        minD = Math.max(minD, lastDelay - Math.floor(prevLengthTicks / 4));
        // A.3 expansion recoil
        if (prevPrevDelay > 0 && lastDelay > prevPrevDelay && lastDelay * 3 > prevLengthTicks) {
            maxD = Math.min(maxD, prevPrevDelay - delayStep);
        }
        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;

        for (let d = minD; d <= maxD && !cappedAtMax; d += delayStep) {
            // A.2 OR-form
            const halfPrev = prevLengthTicks / 2;
            if ((lastDelay >= halfPrev || d >= halfPrev) && d >= lastDelay) continue;
            // A.4 post-truncation contraction
            if (prevIsTrunc && lastDelay * 3 >= prevLengthTicks && (lastDelay - d) < ppq) continue;
            // A.1 long-delay uniqueness
            const isLong = d > SbThird;
            if (isLong && usedLongs.has(d)) continue;

            for (let varIdx = 0; varIdx < variants.length && !cappedAtMax; varIdx++) {
                const v = variants[varIdx];
                const isInv = v.type === 'I';
                const isTrunc = v.truncationBeats > 0;
                if ((prevIsInv || prevIsTrunc) && (isInv || isTrunc)) continue;       // A.8
                if (isTrunc && d >= halfSbTicks) continue;                              // A.10
                // Quotas
                if (isInv && options.inversionMode !== 'Unlimited' && options.inversionMode !== 'None'
                    && nInv >= (options.inversionMode as number)) continue;
                if (isInv && options.inversionMode === 'None') continue;
                if (isTrunc && options.truncationMode !== 'Unlimited' && options.truncationMode !== 'None'
                    && nTrunc >= (options.truncationMode as number)) continue;
                if (isTrunc && options.truncationMode === 'None') continue;

                const newStartTick = prev.startTick + d;
                const newEndTick = newStartTick + v.lengthTicks;

                for (const t of transpositionPool) {
                    if (cappedAtMax) break;
                    const Δt = t - prev.transposition;
                    if (Math.abs(Δt) < A7_MIN_SEMITONES) continue;                     // A.7

                    const adjPair = pairCache.get(`${prev.variantIndex}|${varIdx}|${d}|${Δt}`);
                    if (!adjPair || !adjPair.compatible) continue;

                    // Parallel-P5/P8 conditional rule
                    const adjParallel = adjPair.hasParallelPerfect58;
                    if (adjParallel) {
                        // Trigger 2: any P5/P8 with both adjacent delays >= Sb/3
                        if (lastDelay >= SbThird && d >= SbThird) continue;
                        // Trigger 1: consecutive boundaries both have it
                        // (For the first continuation step, we don't know the frontier's
                        // last boundary parallel state. Conservative: only check within
                        // continuation. This may MISS some rejections that the existing
                        // pipeline catches, but cannot produce false positives.)
                        if (continuationIdx >= 1 && dfsParallelHistory[continuationIdx]) continue;
                    }

                    // Pair-harmony for ALL non-adjacent overlapping pairs
                    let nonAdjFail = false;
                    for (let k = 0; k < dfsChain.length - 1; k++) {
                        const eK = dfsChain[k];
                        const eEnd = eK.startTick + variants[eK.variantIndex].lengthTicks;
                        if (eEnd <= newStartTick) continue;
                        const dKi = newStartTick - eK.startTick;
                        const ΔtKi = t - eK.transposition;
                        const rec = pairCache.get(`${eK.variantIndex}|${varIdx}|${dKi}|${ΔtKi}`);
                        if (!rec || !rec.compatible) { nonAdjFail = true; break; }
                    }
                    if (nonAdjFail) continue;

                    // §C active-transposition uniqueness
                    let tConflict = false;
                    for (const eK of dfsChain) {
                        const eEnd = eK.startTick + variants[eK.variantIndex].lengthTicks;
                        if (eEnd > newStartTick && eK.transposition === t) { tConflict = true; break; }
                    }
                    if (tConflict) continue;

                    // Push frame
                    dfsChain.push({ variantIndex: varIdx, transposition: t, startTick: newStartTick });
                    dfsDelays.push(d);
                    dfsParallelHistory.push(adjParallel);
                    if (isInv) nInv++;
                    if (isTrunc) nTrunc++;
                    if (isLong) usedLongs.add(d);

                    dfs(continuationIdx + 1, d, lastDelay);

                    // Pop
                    dfsChain.pop();
                    dfsDelays.pop();
                    dfsParallelHistory.pop();
                    if (isInv) nInv--;
                    if (isTrunc) nTrunc--;
                    if (isLong) usedLongs.delete(d);
                }
            }
        }
    }

    dfs(0, frontier.lastDelay, frontier.prevPrevDelay);
    return continuations;
}

// --- Voice CSP (mirrors strettoGenerator.ts:2846 assignVoices) ---

function assignVoices(
    chain: HBoundedFullChain,
    pairCache: Map<string, PairRecord>,
    options: StrettoSearchOptions,
    ppq: number
): { voices: number[] } | null {
    const n = chain.entries.length;
    const voices = new Array<number>(n).fill(-1);
    const bassIdx = options.ensembleTotal - 1;

    function conflicts(i: number, j: number): boolean {
        const ei = chain.entries[i], ej = chain.entries[j];
        if (ei.startTick > ej.startTick) return conflicts(j, i);
        const iEnd = ei.startTick + ei.lengthTicks;
        return ej.startTick < iEnd - ppq;
    }

    function valid(pos: number, v: number): boolean {
        if (pos === 0) return v === options.subjectVoiceIndex;
        for (let k = 0; k < pos; k++) {
            if (!isVoicePairAllowedForTransposition(
                voices[k], v,
                chain.entries[pos].transposition - chain.entries[k].transposition,
                options.ensembleTotal, false
            )) return false;
            if (conflicts(k, pos) && voices[k] === v) return false;
            if (conflicts(k, pos)) {
                const eK = chain.entries[k], eP = chain.entries[pos];
                const [eIdx, lIdx] = eK.startTick <= eP.startTick ? [k, pos] : [pos, k];
                const eE = chain.entries[eIdx], eL = chain.entries[lIdx];
                const relDelay = eL.startTick - eE.startTick;
                const relTrans = eL.transposition - eE.transposition;
                const rec = pairCache.get(`${eE.variantIndex}|${eL.variantIndex}|${relDelay}|${relTrans}`);
                if (rec?.hasFourth) {
                    const eV = eK.startTick <= eP.startTick ? voices[k] : v;
                    const lV = eK.startTick <= eP.startTick ? v : voices[k];
                    const pairContainsBass = eV === bassIdx || lV === bassIdx;
                    if (pairContainsBass && !rec.compatibleWhenPairIncludesBass) return false;
                }
            }
        }
        return true;
    }

    function backtrack(pos: number): boolean {
        if (pos === n) return true;
        for (let v = 0; v < options.ensembleTotal; v++) {
            if (valid(pos, v)) {
                voices[pos] = v;
                if (backtrack(pos + 1)) return true;
            }
        }
        voices[pos] = -1;
        return false;
    }
    if (!backtrack(0)) return null;
    return { voices };
}

// --- Scored top-level runner ---

export interface HBoundedScoredResult {
    results: StrettoChainResult[];
    distinctFrontiers: number;
    phase1Prefixes: number;
    phase2Continuations: number;
    voiceAssignedCount: number;
    scoringValidCount: number;
    timeMs: number;
}

export async function runHBoundedSearchScored(opts: HBoundedSearchOptions): Promise<HBoundedScoredResult> {
    const t0 = Date.now();
    const structural = await runHBoundedSearch(opts);

    // Rebuild pair cache + variants for assignVoices/scoring (could be memoised
    // across the two calls — left as future optimisation).
    const variants = buildVariants(opts.rawSubject, opts.options, opts.ppq);
    const pairCache = buildPairCache(variants, opts.ppq, opts.ppq / 2, opts.transpositionPool, opts.options);

    const results: StrettoChainResult[] = [];
    let voiceAssignedCount = 0;
    let scoringValidCount = 0;

    for (let i = 0; i < structural.chains.length; i++) {
        const c = structural.chains[i];
        const assigned = assignVoices(c, pairCache, opts.options, opts.ppq);
        if (!assigned) continue;
        voiceAssignedCount++;

        // Convert to StrettoChainOption with voice indices, then score.
        const chainOpts: StrettoChainOption[] = c.entries.map((e, idx) => ({
            startBeat: e.startTick / opts.ppq,
            transposition: e.transposition,
            type: e.type,
            length: e.lengthTicks,
            voiceIndex: assigned.voices[idx]
        }));
        const variantIndices = c.entries.map(e => e.variantIndex);
        const scored = calculateStrettoScore(chainOpts, variants, variantIndices, opts.options, opts.ppq, 0);
        if (scored.isValid) {
            scoringValidCount++;
            results.push(scored);
        }
    }

    return {
        results,
        distinctFrontiers: structural.distinctFrontiers,
        phase1Prefixes: structural.phase1Prefixes,
        phase2Continuations: structural.phase2Continuations,
        voiceAssignedCount,
        scoringValidCount,
        timeMs: Date.now() - t0
    };
}

// --- Top-level orchestrator (structural only) ---

export async function runHBoundedSearch(opts: HBoundedSearchOptions): Promise<HBoundedSearchResult> {
    const t0 = Date.now();
    const { rawSubject, options, ppq, transpositionPool, H } = opts;
    const targetChainLength = options.targetChainLength;
    const maxPrefixes = opts.maxPrefixes ?? 5_000_000;
    const maxContinuationsPerFrontier = opts.maxContinuationsPerFrontier ?? 1_000_000;
    const delayStep = ppq / 2;

    if (H < 1 || H > targetChainLength) throw new Error(`H must be 1..targetChainLength (${targetChainLength})`);

    const variants = buildVariants(rawSubject, options, ppq);
    const SbThird = Math.floor(variants[0].lengthTicks / 3);
    const pairCache = buildPairCache(variants, ppq, delayStep, transpositionPool, options);

    // Phase 1
    const phase1 = await runPhaseOne({
        rawSubject, options, ppq, transpositionPool, H, maxPrefixes
    });

    // Project to frontiers
    const frontierMap = new Map<string, { prefixes: PhaseOnePrefix[]; frontier: Frontier }>();
    for (const p of phase1.prefixes) {
        const f = projectFrontier(p, variants, SbThird);
        let bucket = frontierMap.get(f.key);
        if (!bucket) {
            bucket = { prefixes: [], frontier: f };
            frontierMap.set(f.key, bucket);
        }
        bucket.prefixes.push(p);
    }

    // Phase 2 + combine
    const chains: HBoundedFullChain[] = [];
    let totalContinuations = 0;
    for (const bucket of frontierMap.values()) {
        const continuations = continueFromFrontier(
            bucket.frontier, variants, pairCache, transpositionPool,
            targetChainLength, H, options, ppq, delayStep, maxContinuationsPerFrontier
        );
        totalContinuations += continuations.length;
        for (const prefix of bucket.prefixes) {
            const lastSH = prefix.entries[H - 1].startTick;
            for (const cont of continuations) {
                const entries: PhaseOnePrefixEntry[] = [...prefix.entries];
                for (const ce of cont.entries) {
                    entries.push({
                        startTick: lastSH + ce.relStartTick,
                        variantIndex: ce.variantIndex,
                        transposition: ce.transposition,
                        type: ce.type,
                        lengthTicks: ce.lengthTicks,
                        truncationBeats: ce.truncationBeats
                    });
                }
                chains.push({ entries });
            }
        }
    }

    return {
        chains,
        distinctFrontiers: frontierMap.size,
        phase1Prefixes: phase1.count,
        phase2Continuations: totalContinuations,
        timeMs: Date.now() - t0
    };
}
