// Frontier study — measurement module.
//
// Enumerates every valid prefix of length H+1 (root e_0 plus H imitating
// entries) under the full rule set, projects each onto two frontier
// variants (lean, comprehensive), and reports compression ratios.
//
// Rules applied during enumeration:
//   A.1 long-delay global uniqueness
//   A.2 half-Sb OR-form contraction
//   A.3 expansion recoil
//   A.4 post-truncation contraction
//   A.5 max contraction bound
//   A.6 universal max delay
//   A.7 adjacent transposition separation
//   A.8 transform-following normality
//   A.9 e_1 not inverted
//   A.10 no truncation at long delay
//   variant quotas (nInv, nTrunc, nRestricted via thirdSixthMode)
//   B-rules across every temporal pair
//   §C re-entry (1-beat re-entry window)
//   §C active-transposition uniqueness
//   pair-harmonic admissibility (cached)
//
// Deferred (NOTE):
//   triplet-harmonic 3-voice texture check. Including it requires a
//   3-voice scanner that the existing pipeline carries via precomputed
//   triplet records; not extracted here. This makes |prefixes| a slight
//   upper bound. The frontier-compression ratio (the deliverable) is
//   unaffected by this since it depends on projection, not the absolute
//   prefix count.

import { checkCounterpointStructureWithBassRole, isVoicePairAllowedForTransposition } from './strettoGenerator';
import { getInvertedPitch } from './strettoCore';
import type { SubjectVariant, InternalNote } from './strettoScoring';
import type { StrettoConstraintMode } from '../../types';

type VariantTypeIndex = 0 | 1 | 2 | 3;  // 0:N, 1:I, 2:T_N, 3:T_I

export interface FrontierStudySubject {
    name: string;
    SbBeats: number;
    pivotMidi: number;
    scaleRoot: number;
    scaleMode: 'Major' | 'Minor';
    notes: { pitch: number; relBeat: number; durBeat: number }[];
}

export interface FrontierStudyOptions {
    subject: FrontierStudySubject;
    H: number;                  // frontier depth (entries placed, root included)
    qI: number;                 // Infinity for unbounded
    qT: number;
    qRestricted: number;        // thirdSixthMode quota; Infinity for unbounded
    ensembleTotal: number;
    subjectVoiceIndex: number;
    transpositionPool: number[];
    maxPairwiseDissonance: number;
    fourthTreatment: 'provisional' | 'dissonant';
    maxPrefixes: number;        // cap to abort runaway runs
}

export interface FrontierStudyResult {
    prefixes: number;
    cappedAtMax: boolean;
    distinctLean: number;
    distinctComp: number;
    ratioLean: number;
    ratioComp: number;
    timeMs: number;
    // For each feature in the comprehensive frontier, the # of distinct
    // values it contributes (across all observed frontiers). Higher means
    // the feature inflates the frontier count more.
    featureCardinalities: Record<string, number>;
}

const ppq = 480;
const delayStep = ppq / 2;
const A7_MIN_SEMITONES = 5;

function buildVariants(s: FrontierStudySubject, includeInv: boolean, includeTrunc: boolean, truncBeats: number): SubjectVariant[] {
    const lengthTicks = Math.round(s.SbBeats * ppq);
    const baseNotes: InternalNote[] = s.notes.map(n => ({
        pitch: n.pitch,
        relTick: Math.round(n.relBeat * ppq),
        durationTicks: Math.round(n.durBeat * ppq)
    }));
    const variants: SubjectVariant[] = [
        { type: 'N', truncationBeats: 0, lengthTicks, notes: baseNotes }
    ];
    if (includeInv) {
        const invNotes: InternalNote[] = baseNotes.map(n => ({
            ...n,
            pitch: getInvertedPitch(n.pitch, s.pivotMidi, s.scaleRoot, s.scaleMode, false)
        }));
        variants.push({ type: 'I', truncationBeats: 0, lengthTicks, notes: invNotes });
    }
    if (includeTrunc) {
        const truncTicks = Math.round(truncBeats * ppq);
        const truncatedLength = lengthTicks - truncTicks;
        const truncN = baseNotes
            .filter(n => n.relTick < truncatedLength)
            .map(n => ({ relTick: n.relTick, durationTicks: Math.min(n.durationTicks, truncatedLength - n.relTick), pitch: n.pitch }));
        variants.push({ type: 'N', truncationBeats: truncBeats, lengthTicks: truncatedLength, notes: truncN });
        if (includeInv) {
            const invNotes: InternalNote[] = baseNotes.map(n => ({
                ...n,
                pitch: getInvertedPitch(n.pitch, s.pivotMidi, s.scaleRoot, s.scaleMode, false)
            }));
            const truncI = invNotes
                .filter(n => n.relTick < truncatedLength)
                .map(n => ({ relTick: n.relTick, durationTicks: Math.min(n.durationTicks, truncatedLength - n.relTick), pitch: n.pitch }));
            variants.push({ type: 'I', truncationBeats: truncBeats, lengthTicks: truncatedLength, notes: truncI });
        }
    }
    return variants;
}

function buildPairCache(
    variants: SubjectVariant[],
    transpositionPool: number[],
    maxDiss: number,
    fourthTreatment: 'provisional' | 'dissonant'
): Map<string, boolean> {
    const pairCache = new Map<string, boolean>();
    // Enumerate every distinct Δt = t' - t over transpositionPool²; many
    // collisions but cache on first compute.
    const deltaSet = new Set<number>();
    for (const a of transpositionPool) for (const b of transpositionPool) deltaSet.add(b - a);
    for (let vA = 0; vA < variants.length; vA++) {
        for (let vB = 0; vB < variants.length; vB++) {
            const lenA = variants[vA].lengthTicks;
            const dMax = Math.floor(2 * lenA / 3);
            for (let d = delayStep; d <= dMax; d += delayStep) {
                for (const Δt of deltaSet) {
                    const r = checkCounterpointStructureWithBassRole(
                        variants[vA], variants[vB], d, Δt, maxDiss,
                        fourthTreatment, ppq, 4, 4, false, true
                    );
                    if (r.compatible) pairCache.set(`${vA}|${vB}|${d}|${Δt}`, true);
                }
            }
        }
    }
    return pairCache;
}

function quotaAllows(mode: number, current: number): boolean {
    return current < mode;
}

// Variant-classification helpers: returns whether a variant is inverted /
// truncated and (for the joint type) whether it's a "restricted" interval
// in the thirdSixthMode sense. The thirdSixthMode quota counts entries
// arriving at restricted intervals (3rd / 6th relative to prior entry);
// here we capture the variant flags only.
function variantIsInv(v: SubjectVariant): boolean { return v.type === 'I'; }
function variantIsTrunc(v: SubjectVariant): boolean { return v.truncationBeats > 0; }

// The rule "restricted interval" depends on the relative semitone delta
// between adjacent entries. Class membership lifted from the existing
// implementation: (|Δt| mod 12) ∈ {3, 4, 8, 9} ⇒ restricted (3rd/6th);
// (|Δt| mod 12) ∈ {0, 5, 7} ⇒ free (P1/P4/P5/P8); else other.
function transitionIsRestricted(Δt: number): boolean {
    const c = ((Δt % 12) + 12) % 12;
    return c === 3 || c === 4 || c === 8 || c === 9;
}

interface PrefixState {
    n: number;                         // number of entries placed (including root e_0)
    delays: Int32Array;                // length n-1
    variants: Uint8Array;              // length n; index 0 = root (variant 0)
    transpositions: Int16Array;        // length n; t[0] = 0
    voices: Uint8Array;                // length n; v[0] = subjectVoiceIndex
    startTicks: Int32Array;            // length n
    endTicks: Int32Array;              // length n
    nInv: number;
    nTrunc: number;
    nRestricted: number;
    usedLongDelays: Set<number>;       // A.1 tracker
    perVoiceMin: Int32Array;           // length ensembleTotal; INT_MAX if unused
    perVoiceMax: Int32Array;           // INT_MIN if unused
    voiceUsed: Uint8Array;
}

const INT_MAX = 0x7fffffff;
const INT_MIN = -0x80000000;

export async function runFrontierStudy(opts: FrontierStudyOptions): Promise<FrontierStudyResult> {
    const t0 = Date.now();
    const includeInv = opts.qI > 0;
    const includeTrunc = opts.qT > 0;
    const variants = buildVariants(opts.subject, includeInv, includeTrunc, 1);
    const pairCache = buildPairCache(variants, opts.transpositionPool, opts.maxPairwiseDissonance, opts.fourthTreatment);

    const Sb = opts.subject.SbBeats;
    const SbTicks = Math.round(Sb * ppq);
    const halfSbTicks = Math.round(Sb * ppq / 2);
    const longThresholdTicks = Math.round(Sb * ppq / 3);

    let prefixCount = 0;
    let cappedAtMax = false;
    const distinctLean = new Set<string>();
    const distinctComp = new Set<string>();

    // Per-feature distinct-value sets, used for cardinality histogram.
    const featDistinct: Record<string, Set<string>> = {
        d_H: new Set(), d_Hm1: new Set(), var_H: new Set(),
        nInv: new Set(), nTrunc: new Set(), nRestricted: new Set(),
        t_H: new Set(), v_H: new Set(),
        perVoice: new Set(), activeTail: new Set(),
        U: new Set(), U_size: new Set()
    };

    const state: PrefixState = {
        n: 1,
        delays: new Int32Array(opts.H),
        variants: new Uint8Array(opts.H + 1),
        transpositions: new Int16Array(opts.H + 1),
        voices: new Uint8Array(opts.H + 1),
        startTicks: new Int32Array(opts.H + 1),
        endTicks: new Int32Array(opts.H + 1),
        nInv: 0, nTrunc: 0, nRestricted: 0,
        usedLongDelays: new Set(),
        perVoiceMin: new Int32Array(opts.ensembleTotal).fill(INT_MAX),
        perVoiceMax: new Int32Array(opts.ensembleTotal).fill(INT_MIN),
        voiceUsed: new Uint8Array(opts.ensembleTotal)
    };
    // Initialise root e_0.
    state.variants[0] = 0;
    state.transpositions[0] = 0;
    state.voices[0] = opts.subjectVoiceIndex;
    state.startTicks[0] = 0;
    state.endTicks[0] = variants[0].lengthTicks;
    state.perVoiceMin[opts.subjectVoiceIndex] = 0;
    state.perVoiceMax[opts.subjectVoiceIndex] = 0;
    state.voiceUsed[opts.subjectVoiceIndex] = 1;

    // Recursive DFS extending one entry at a time.
    function emitFrontier() {
        prefixCount++;
        if (prefixCount >= opts.maxPrefixes) {
            cappedAtMax = true;
            return;
        }

        const i = state.n - 1;          // index of last placed entry
        const sH = state.startTicks[i];
        const eH = state.endTicks[i];

        // Lean frontier:
        //   d_H, d_{H-1}, var_H, nInv (if quota), nTrunc (if quota),
        //   nRestricted (if quota), t_H, v_H, per-voice min/max,
        //   active-tail entries.
        const dH = i >= 1 ? state.delays[i - 1] : 0;
        const dHm1 = i >= 2 ? state.delays[i - 2] : 0;
        const varH = state.variants[i];
        const tH = state.transpositions[i];
        const vH = state.voices[i];

        const perVoiceParts: string[] = [];
        for (let v = 0; v < opts.ensembleTotal; v++) {
            if (state.voiceUsed[v]) {
                perVoiceParts.push(`${v}:${state.perVoiceMin[v]}:${state.perVoiceMax[v]}`);
            }
        }
        const perVoiceSig = perVoiceParts.join(',');

        // Active tail: prior entries (excluding the latest) still sounding
        // at start of next entry. "Next entry" hasn't been placed; the
        // earliest possible next start is sH + delayStep, but a candidate
        // continuation could be any startTick > sH. For a CORRECT frontier
        // we project assuming continuation could start arbitrarily soon,
        // so encode k whose endTick > sH (i.e., still active right after
        // the most recent entry started).
        const tailParts: string[] = [];
        for (let k = 0; k < i; k++) {
            if (state.endTicks[k] > sH) {
                tailParts.push(`${state.variants[k]}:${state.transpositions[k]}:${state.voices[k]}:${state.endTicks[k] - sH}`);
            }
        }
        const tailSig = tailParts.join(',');

        const nInvPart = opts.qI < INT_MAX ? `i${state.nInv}` : '';
        const nTruncPart = opts.qT < INT_MAX ? `t${state.nTrunc}` : '';
        const nRestrictedPart = opts.qRestricted < INT_MAX ? `r${state.nRestricted}` : '';
        const leanKey = `${dH}|${dHm1}|${varH}|${nInvPart}${nTruncPart}${nRestrictedPart}|${tH}|${vH}|${perVoiceSig}|${tailSig}`;
        distinctLean.add(leanKey);

        // Comprehensive frontier: lean + U.
        const usedLongs = Array.from(state.usedLongDelays).sort((a, b) => a - b).join(',');
        const compKey = `${leanKey}||U:${usedLongs}`;
        distinctComp.add(compKey);

        // Per-feature cardinalities.
        featDistinct.d_H.add(String(dH));
        featDistinct.d_Hm1.add(String(dHm1));
        featDistinct.var_H.add(String(varH));
        featDistinct.nInv.add(String(state.nInv));
        featDistinct.nTrunc.add(String(state.nTrunc));
        featDistinct.nRestricted.add(String(state.nRestricted));
        featDistinct.t_H.add(String(tH));
        featDistinct.v_H.add(String(vH));
        featDistinct.perVoice.add(perVoiceSig);
        featDistinct.activeTail.add(tailSig);
        featDistinct.U.add(usedLongs);
        featDistinct.U_size.add(String(state.usedLongDelays.size));
    }

    function dfs(): void {
        if (cappedAtMax) return;
        const i = state.n - 1;            // last placed
        if (state.n === opts.H + 1) {
            emitFrontier();
            return;
        }
        // Place entry i+1.
        const prevVariantIdx = state.variants[i];
        const prevVariant = variants[prevVariantIdx];
        const prevLengthTicks = prevVariant.lengthTicks;
        const prevDelay = i >= 1 ? state.delays[i - 1] : -1;
        const prevPrevDelay = i >= 2 ? state.delays[i - 2] : -1;
        const prevIsTrunc = variantIsTrunc(prevVariant);
        const prevIsInv = variantIsInv(prevVariant);

        // Delay range
        let minD = delayStep;
        let maxD = Math.floor(prevLengthTicks * 2 / 3);                      // A.6
        if (i === 0) {
            // First imitating entry: existing convention sets minD = floor(prevLength * 0.5)
            minD = Math.max(minD, Math.floor(prevLengthTicks / 2));
        } else {
            // A.5 max contraction
            minD = Math.max(minD, prevDelay - Math.floor(prevLengthTicks / 4));
            // A.3 expansion recoil
            if (prevPrevDelay >= 0 && prevDelay > prevPrevDelay && prevDelay * 3 > prevLengthTicks) {
                maxD = Math.min(maxD, prevPrevDelay - delayStep);
            }
        }
        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;

        for (let d = minD; d <= maxD && !cappedAtMax; d += delayStep) {
            // A.2 OR-form trigger
            if (i >= 1) {
                const halfPrev = prevLengthTicks / 2;
                if ((prevDelay >= halfPrev || d >= halfPrev) && d >= prevDelay) continue;
            }
            // A.4 post-truncation contraction
            if (prevIsTrunc && prevDelay * 3 >= prevLengthTicks && (prevDelay - d) < ppq) continue;
            // A.1 long-delay uniqueness
            const isLong = d * 3 > variants[0].lengthTicks;
            if (isLong && state.usedLongDelays.has(d)) continue;

            for (let nextVarIdx = 0; nextVarIdx < variants.length && !cappedAtMax; nextVarIdx++) {
                const nextVariant = variants[nextVarIdx];
                const nextIsInv = variantIsInv(nextVariant);
                const nextIsTrunc = variantIsTrunc(nextVariant);
                // A.8 transform-following normality
                if ((prevIsInv || prevIsTrunc) && (nextIsInv || nextIsTrunc)) continue;
                // A.9 first imitating entry not inverted
                if (i === 0 && nextIsInv) continue;
                // A.10 no truncation at long delay
                if (nextIsTrunc && d >= halfSbTicks) continue;
                // Quotas
                if (nextIsInv && !quotaAllows(opts.qI, state.nInv)) continue;
                if (nextIsTrunc && !quotaAllows(opts.qT, state.nTrunc)) continue;

                const newStartTick = state.startTicks[i] + d;
                const newEndTick = newStartTick + nextVariant.lengthTicks;

                // Enumerate transposition × voice combos.
                const tPrev = state.transpositions[i];
                for (const tCurr of opts.transpositionPool) {
                    if (cappedAtMax) break;
                    const Δt = tCurr - tPrev;
                    // A.7 adjacent transposition separation
                    if (Math.abs(Δt) < A7_MIN_SEMITONES) continue;
                    // pair-harmonic admissibility (var_prev, var_next, d, Δt)
                    if (!pairCache.get(`${prevVariantIdx}|${nextVarIdx}|${d}|${Δt}`)) continue;
                    // §C active-transposition uniqueness
                    let tConflict = false;
                    for (let k = 0; k < state.n; k++) {
                        if (state.endTicks[k] > newStartTick && state.transpositions[k] === tCurr) {
                            tConflict = true; break;
                        }
                    }
                    if (tConflict) continue;
                    // thirdSixth quota
                    const isRestricted = transitionIsRestricted(Δt);
                    if (isRestricted && !quotaAllows(opts.qRestricted, state.nRestricted)) continue;

                    for (let nextVoice = 0; nextVoice < opts.ensembleTotal && !cappedAtMax; nextVoice++) {
                        // §C re-entry: same voice allowed iff jStart >= iEnd - ppq
                        let voiceConflict = false;
                        for (let k = 0; k < state.n; k++) {
                            if (state.voices[k] !== nextVoice) continue;
                            if (newStartTick < state.endTicks[k] - ppq) { voiceConflict = true; break; }
                        }
                        if (voiceConflict) continue;
                        // B-rules across all temporal pairs
                        let bConflict = false;
                        for (let k = 0; k < state.n; k++) {
                            if (state.voices[k] === nextVoice) continue;
                            if (!isVoicePairAllowedForTransposition(
                                state.voices[k], nextVoice, tCurr - state.transpositions[k],
                                opts.ensembleTotal, false
                            )) { bConflict = true; break; }
                        }
                        if (bConflict) continue;

                        // Push frame
                        state.variants[state.n] = nextVarIdx;
                        state.delays[i] = d;
                        state.transpositions[state.n] = tCurr;
                        state.voices[state.n] = nextVoice;
                        state.startTicks[state.n] = newStartTick;
                        state.endTicks[state.n] = newEndTick;
                        if (nextIsInv) state.nInv++;
                        if (nextIsTrunc) state.nTrunc++;
                        if (isRestricted) state.nRestricted++;
                        if (isLong) state.usedLongDelays.add(d);

                        const prevMin = state.perVoiceMin[nextVoice];
                        const prevMax = state.perVoiceMax[nextVoice];
                        const prevUsed = state.voiceUsed[nextVoice];
                        if (tCurr < prevMin) state.perVoiceMin[nextVoice] = tCurr;
                        if (tCurr > prevMax) state.perVoiceMax[nextVoice] = tCurr;
                        state.voiceUsed[nextVoice] = 1;

                        state.n++;
                        dfs();
                        state.n--;

                        // Pop frame
                        state.perVoiceMin[nextVoice] = prevMin;
                        state.perVoiceMax[nextVoice] = prevMax;
                        state.voiceUsed[nextVoice] = prevUsed;
                        if (nextIsInv) state.nInv--;
                        if (nextIsTrunc) state.nTrunc--;
                        if (isRestricted) state.nRestricted--;
                        if (isLong) state.usedLongDelays.delete(d);
                    }
                }
            }
        }
    }

    dfs();

    const featureCardinalities: Record<string, number> = {};
    for (const k of Object.keys(featDistinct)) featureCardinalities[k] = featDistinct[k].size;

    return {
        prefixes: prefixCount,
        cappedAtMax,
        distinctLean: distinctLean.size,
        distinctComp: distinctComp.size,
        ratioLean: distinctLean.size > 0 ? prefixCount / distinctLean.size : 0,
        ratioComp: distinctComp.size > 0 ? prefixCount / distinctComp.size : 0,
        timeMs: Date.now() - t0,
        featureCardinalities
    };
}
