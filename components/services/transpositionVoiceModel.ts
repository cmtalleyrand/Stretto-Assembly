// Model B — full-length transposition-voice enumerator.
//
// Emits every (t_1..t_n, v_1..v_n) sequence consistent with rules A.7
// (adjacent transposition separation) and B-rules (voice-spacing across
// every temporal pair). t_1 = 0 by canonicalisation; v_1 is fixed to the
// subjectVoiceIndex (the voice that carries the subject).
//
// Stage 2 of the new pipeline. Voice re-entry timing (§C) and active-
// transposition uniqueness depend on delays and are deferred to the
// join. P4 bass-role dissonance (§D) needs harmonic data and stays in
// the post-hoc CSP.

import { isVoicePairAllowedForTransposition } from './strettoGenerator';

export interface TranspositionVoiceSequence {
    transpositions: Int16Array;  // length n; t[0] = 0
    voices: Uint8Array;          // length n; v[0] = subjectVoiceIndex
}

export interface TranspositionVoiceModelStats {
    sequencesEmitted: number;
    truncatedAtCap: boolean;
}

export interface TranspositionVoiceModelOptions {
    chainLength: number;                // n entries including root
    ensembleTotal: number;              // number of voices
    subjectVoiceIndex: number;          // root entry's voice
    transpositionPool: number[];        // allowed t values (signed semitones)
    maxSequences?: number;
    onSequence?: (seq: TranspositionVoiceSequence) => void;
}

export interface TranspositionVoiceModelResult {
    sequences: TranspositionVoiceSequence[];
    stats: TranspositionVoiceModelStats;
}

const A7_MIN_SEMITONES = 5;

export function buildTranspositionVoiceSequences(
    opts: TranspositionVoiceModelOptions
): TranspositionVoiceModelResult {
    const { chainLength: n, ensembleTotal, subjectVoiceIndex, transpositionPool } = opts;
    const maxSequences = opts.maxSequences ?? Infinity;
    const accumulate = !opts.onSequence;

    if (n < 1) return { sequences: [], stats: { sequencesEmitted: 0, truncatedAtCap: false } };

    const tStack = new Int16Array(n);
    const vStack = new Uint8Array(n);
    tStack[0] = 0;
    vStack[0] = subjectVoiceIndex;

    const sequences: TranspositionVoiceSequence[] = [];
    let sequencesEmitted = 0;
    let truncatedAtCap = false;

    function emit(): boolean {
        const seq: TranspositionVoiceSequence = {
            transpositions: tStack.slice(),
            voices: vStack.slice()
        };
        sequencesEmitted++;
        if (opts.onSequence) opts.onSequence(seq);
        if (accumulate) sequences.push(seq);
        if (sequencesEmitted >= maxSequences) {
            truncatedAtCap = true;
            return true;
        }
        return false;
    }

    function dfs(i: number): boolean {
        if (i === n) return emit();
        const tPrev = tStack[i - 1];
        for (const t of transpositionPool) {
            // A.7 adjacent transposition separation
            if (Math.abs(t - tPrev) < A7_MIN_SEMITONES) continue;
            tStack[i] = t;
            for (let v = 0; v < ensembleTotal; v++) {
                // B-rules: v at position i must be admissible against every prior
                // (v_k, t_k). Same-voice pairs are always allowed (re-entry timing
                // is checked later in the join + post-hoc CSP).
                let ok = true;
                for (let k = 0; k < i; k++) {
                    if (vStack[k] === v) continue;
                    if (!isVoicePairAllowedForTransposition(
                        vStack[k], v, t - tStack[k], ensembleTotal, false
                    )) { ok = false; break; }
                }
                if (!ok) continue;
                vStack[i] = v;
                if (dfs(i + 1)) return true;
            }
        }
        return false;
    }

    dfs(1);

    return {
        sequences,
        stats: { sequencesEmitted, truncatedAtCap }
    };
}
