import type { StrettoChainResult, StrettoChainOption } from '../../types';
import { foldTranspositionWithinSpan } from './strettoGenerator';

/**
 * U1: quality-weighted chain count, deduplicating octave-equivalent chains.
 *
 * For each chain c with length l_c >= targetLength - 2:
 *   contribution = 10^(1 + l_c - targetLength) × min(max(0, 0.4 - dissonanceRatio), 0.25)
 *
 * Chains are deduplicated by canonical key (delays, folded relative transpositions, variant shapes).
 * Octave-equivalent chains (same harmonic structure under foldTranspositionWithinSpan) contribute
 * only once — the one with the best dissonance factor.
 */
export function computeU1(
    results: StrettoChainResult[],
    targetLength: number,
    subjectSpanSemitones: number
): number {
    const best = new Map<string, number>(); // key → best dissonance factor seen
    const contributions = new Map<string, number>(); // key → contribution value

    for (const chain of results) {
        const lc = chain.entries.length;
        if (lc < targetLength - 2) continue;
        const d = chain.dissonanceRatio ?? 0;
        const factor = Math.min(Math.max(0, 0.4 - d), 0.25);
        if (factor === 0) continue;

        const key = chainCanonicalKey(chain.entries, subjectSpanSemitones);
        const prevBest = best.get(key) ?? -1;
        if (factor <= prevBest) continue;
        best.set(key, factor);
        contributions.set(key, Math.pow(10, 1 + lc - targetLength) * factor);
    }

    let total = 0;
    for (const v of contributions.values()) total += v;
    return total;
}

/**
 * U2: same structure as U1 but uses the full chain score instead of dissonance factor.
 * Scores are normalised to [0, 1] within the filtered result set.
 */
export function computeU2(
    results: StrettoChainResult[],
    targetLength: number,
    subjectSpanSemitones: number
): number {
    const filtered = results.filter(c => c.entries.length >= targetLength - 2);
    if (filtered.length === 0) return 0;
    const scores = filtered.map(c => c.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const range = maxScore - minScore;

    const best = new Map<string, number>();
    const contributions = new Map<string, number>();

    for (const chain of filtered) {
        const lc = chain.entries.length;
        const normScore = range > 0 ? (chain.score - minScore) / range : 1;
        const key = chainCanonicalKey(chain.entries, subjectSpanSemitones);
        const prevBest = best.get(key) ?? -1;
        if (normScore <= prevBest) continue;
        best.set(key, normScore);
        contributions.set(key, Math.pow(10, 1 + lc - targetLength) * normScore);
    }

    let total = 0;
    for (const v of contributions.values()) total += v;
    return total;
}

function chainCanonicalKey(entries: StrettoChainOption[], subjectSpanSemitones: number): string {
    if (entries.length === 0) return '';
    const delays: number[] = [];
    for (let i = 1; i < entries.length; i++) {
        delays.push(Math.round((entries[i].startBeat - entries[i - 1].startBeat) * 1000) / 1000);
    }
    const t0 = entries[0].transposition;
    const relT = entries.map(e => foldTranspositionWithinSpan(e.transposition - t0, subjectSpanSemitones));
    const shapes = entries.map(e => `${e.type}:${e.length}`);
    return JSON.stringify([delays, relT, shapes]);
}
