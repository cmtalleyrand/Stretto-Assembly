// Frontier study — measurement-only.
//
// Sources |prefixes| and |distinct prefixes| from searchStrettoChains'
// own diagnostics, since the existing pipeline IS the full search model
// applying every rule (A.1–A.10, quotas, B-rules, §C re-entry, §C
// active-transposition uniqueness, pair-harmonic and triplet-harmonic
// admissibility, parallel-perfect-58, P4 bass-role).
//
// Two metrics extracted per (subject, quotas, H) cell:
//
//   structurallyCompleteChainsFound — every chain that satisfies all
//     structural rules at the target chain length, before voice CSP
//     and scoring. This is the rigorous |prefixes|.
//
//   distinctStructuralChainCount — the same set after deduplication by
//     the existing pipeline's chain signature (delays + transposition
//     mod 12 + variant type per entry; voice-agnostic since voice is
//     post-hoc). This is |distinct frontiers| under the pipeline's own
//     frontier definition.
//
// Compression ratio = structurallyCompleteChainsFound /
//                     distinctStructuralChainCount.

import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

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
    H: number;
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
    structurallyComplete: number;
    prefixAdmissible: number;
    distinctStructural: number;
    ratioStructural: number;          // structurallyComplete / distinctStructural
    ratioPrefixAdmissible: number;    // prefixAdmissible / distinctStructural
    timeMs: number;
    stopReason: string;
    nodesVisited: number;
    deterministicDagMergedNodes: number | undefined;
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
    const diag = report.stats.completionDiagnostics;
    const structurallyComplete = diag?.structurallyCompleteChainsFound ?? 0;
    const prefixAdmissible = diag?.prefixAdmissibleCompleteChainsFound ?? 0;
    const distinctStructural = diag?.distinctStructuralChainCount ?? 0;

    return {
        structurallyComplete,
        prefixAdmissible,
        distinctStructural,
        ratioStructural: distinctStructural > 0 ? structurallyComplete / distinctStructural : 0,
        ratioPrefixAdmissible: distinctStructural > 0 ? prefixAdmissible / distinctStructural : 0,
        timeMs: Date.now() - t0,
        stopReason: report.stats.stopReason,
        nodesVisited: report.stats.nodesVisited,
        deterministicDagMergedNodes: report.stats.stageStats?.deterministicDagMergedNodes
    };
}
