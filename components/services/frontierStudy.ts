// Frontier study — measurement-only, using the full searchStrettoChains
// pipeline as the source of truth for valid prefixes.
//
// For each (subject, quotas, H) cell:
//   1. Run searchStrettoChains with targetChainLength = H+1. Every rule
//      is applied by the existing pipeline (A.1–A.10, quotas, B-rules,
//      §C re-entry, §C active-transposition uniqueness, pair-harmonic
//      and triplet-harmonic admissibility, parallel-perfect-58, P4
//      bass-role).
//   2. Project each result.entries onto the frontier feature vector.
//   3. Count |prefixes|, |distinct frontiers|, per-feature cardinalities.

import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions, StrettoChainOption } from '../../types';

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
    H: number;                  // frontier depth = chain length at which frontier is extracted
    qI: number | 'Unlimited' | 'None';
    qT: number | 'Unlimited' | 'None';
    qRestricted: number | 'Unlimited' | 'None';
    ensembleTotal: number;
    subjectVoiceIndex: number;
    maxPairwiseDissonance: number;
    disallowComplexExceptions: boolean;
    maxSearchTimeMs?: number;
}

export interface FrontierStudyResult {
    prefixes: number;
    distinctLean: number;
    distinctComp: number;
    ratioLean: number;
    ratioComp: number;
    timeMs: number;
    stopReason: string;
    featureCardinalities: Record<string, number>;
}

const ppq = 480;

function rawSubjectFrom(s: FrontierStudySubject): RawNote[] {
    return s.notes.map(n => ({
        midi: n.pitch,
        ticks: Math.round(n.relBeat * ppq),
        durationTicks: Math.round(n.durBeat * ppq),
        velocity: 90,
        name: ''
    }));
}

// Long-delay threshold for A.1.
function longThresholdTicks(SbBeats: number): number {
    return Math.floor(SbBeats * ppq / 3);
}

// Project a single chain onto two frontier variants. The chain has H+1
// entries (root e_0 plus H subsequent). The frontier captures state
// needed to extend with e_{H+1}.
function projectFrontier(
    entries: StrettoChainOption[],
    SbBeats: number,
    ensembleTotal: number,
    feat: Record<string, Set<string>>
): { lean: string; comp: string } {
    const H = entries.length - 1;                 // last placed index
    const eH = entries[H];
    const eHm1 = H >= 1 ? entries[H - 1] : null;
    const eHm2 = H >= 2 ? entries[H - 2] : null;

    const startTickH = Math.round(eH.startBeat * ppq);

    const dH = eHm1 ? Math.round((eH.startBeat - eHm1.startBeat) * ppq) : 0;
    const dHm1 = (eHm1 && eHm2) ? Math.round((eHm1.startBeat - eHm2.startBeat) * ppq) : 0;

    // Per-voice (min_t, max_t).
    const perVoiceMin: number[] = new Array(ensembleTotal).fill(Number.POSITIVE_INFINITY);
    const perVoiceMax: number[] = new Array(ensembleTotal).fill(Number.NEGATIVE_INFINITY);
    for (const e of entries) {
        if (e.transposition < perVoiceMin[e.voiceIndex]) perVoiceMin[e.voiceIndex] = e.transposition;
        if (e.transposition > perVoiceMax[e.voiceIndex]) perVoiceMax[e.voiceIndex] = e.transposition;
    }
    const perVoiceParts: string[] = [];
    for (let v = 0; v < ensembleTotal; v++) {
        if (perVoiceMin[v] !== Number.POSITIVE_INFINITY) {
            perVoiceParts.push(`${v}:${perVoiceMin[v]}:${perVoiceMax[v]}`);
        }
    }
    const perVoiceSig = perVoiceParts.join(',');

    // Active tail: entries (excluding e_H) with end_tick > startTickH.
    const tailParts: string[] = [];
    for (let k = 0; k < H; k++) {
        const e = entries[k];
        const endTick = Math.round(e.startBeat * ppq) + e.length;
        if (endTick > startTickH) {
            tailParts.push(`${e.type}:${e.length}:${e.transposition}:${e.voiceIndex}:${endTick - startTickH}`);
        }
    }
    const tailSig = tailParts.join(',');

    // Used long delays (A.1).
    const longTh = longThresholdTicks(SbBeats);
    const longs: number[] = [];
    for (let k = 1; k <= H; k++) {
        const d = Math.round((entries[k].startBeat - entries[k - 1].startBeat) * ppq);
        if (d > longTh) longs.push(d);
    }
    longs.sort((a, b) => a - b);
    const usedLongsSig = longs.join(',');

    // Quota counters.
    let nInv = 0, nTrunc = 0;
    for (const e of entries) {
        if (e.type === 'I') nInv++;
        // Truncated entries have length < full subject. We can't tell trunc
        // status from `length` alone without knowing full Sb; compare to root.
        if (e.length < entries[0].length) nTrunc++;
    }

    const varHSig = `${eH.type}:${eH.length}`;
    const tHSig = String(eH.transposition);
    const vHSig = String(eH.voiceIndex);

    // Lean frontier: every datum except U.
    const leanKey = [
        dH, dHm1, varHSig,
        nInv, nTrunc,
        tHSig, vHSig,
        perVoiceSig, tailSig
    ].join('|');

    // Comprehensive frontier: lean + U.
    const compKey = leanKey + '||U:' + usedLongsSig;

    feat.d_H.add(String(dH));
    feat.d_Hm1.add(String(dHm1));
    feat.var_H.add(varHSig);
    feat.nInv.add(String(nInv));
    feat.nTrunc.add(String(nTrunc));
    feat.t_H.add(tHSig);
    feat.v_H.add(vHSig);
    feat.perVoice.add(perVoiceSig);
    feat.tail.add(tailSig);
    feat.U.add(usedLongsSig);
    feat.U_size.add(String(longs.length));

    return { lean: leanKey, comp: compKey };
}

export async function runFrontierStudy(opts: FrontierStudyOptions): Promise<FrontierStudyResult> {
    const t0 = Date.now();
    const rawSubject = rawSubjectFrom(opts.subject);
    const searchOpts: StrettoSearchOptions = {
        ensembleTotal: opts.ensembleTotal,
        targetChainLength: opts.H,
        subjectVoiceIndex: opts.subjectVoiceIndex,
        truncationMode: opts.qT,
        truncationTargetBeats: 1,
        inversionMode: opts.qI,
        useChromaticInversion: false,
        thirdSixthMode: opts.qRestricted,
        pivotMidi: opts.subject.pivotMidi,
        requireConsonantEnd: false,
        disallowComplexExceptions: opts.disallowComplexExceptions,
        maxPairwiseDissonance: opts.maxPairwiseDissonance,
        scaleRoot: opts.subject.scaleRoot,
        scaleMode: opts.subject.scaleMode,
        maxSearchTimeMs: opts.maxSearchTimeMs ?? 60_000
    };

    const report = await searchStrettoChains(rawSubject, searchOpts, ppq);

    const distinctLean = new Set<string>();
    const distinctComp = new Set<string>();
    const feat: Record<string, Set<string>> = {
        d_H: new Set(), d_Hm1: new Set(), var_H: new Set(),
        nInv: new Set(), nTrunc: new Set(),
        t_H: new Set(), v_H: new Set(),
        perVoice: new Set(), tail: new Set(),
        U: new Set(), U_size: new Set()
    };

    for (const r of report.results) {
        const { lean, comp } = projectFrontier(r.entries, opts.subject.SbBeats, opts.ensembleTotal, feat);
        distinctLean.add(lean);
        distinctComp.add(comp);
    }

    const featureCardinalities: Record<string, number> = {};
    for (const k of Object.keys(feat)) featureCardinalities[k] = feat[k].size;

    const prefixes = report.results.length;
    return {
        prefixes,
        distinctLean: distinctLean.size,
        distinctComp: distinctComp.size,
        ratioLean: distinctLean.size > 0 ? prefixes / distinctLean.size : 0,
        ratioComp: distinctComp.size > 0 ? prefixes / distinctComp.size : 0,
        timeMs: Date.now() - t0,
        stopReason: report.stats.stopReason,
        featureCardinalities
    };
}
