// Validate Phase 1 enumerator against the existing pipeline's VALID
// chains (its final results.entries). Phase 1 should produce a
// superset — every valid chain corresponds to one of its prefixes,
// modulo voice (which Phase 1 doesn't assign).
//
// If Phase 1 has more chains than the existing pipeline's results, that
// is acceptable: those are extra prefixes that downstream voice CSP /
// scoring would filter. The criterion: never miss a valid chain.

import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import { runPhaseOne } from './phaseOnePrefixEnum';
import type { RawNote, StrettoSearchOptions } from '../../types';

const ppq = 480;
const baseSubject: RawNote[] = [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' }
];
const baseOptions: StrettoSearchOptions = {
    ensembleTotal: 4,
    targetChainLength: 4,
    subjectVoiceIndex: 1,
    truncationMode: 'None',
    truncationTargetBeats: 1,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 0.5,
    scaleRoot: 0,
    scaleMode: 'Major'
};
const tradTranspositions = [-31, -29, -19, -17, -7, -5, 0, 5, 7, 17, 19, 29, 31, -24, -12, 12, 24];

// Voice-agnostic structural signature: (startTick, transposition, type, length) per entry.
function sigEntries(es: { startBeat?: number; startTick?: number; transposition: number; type: string; length?: number; lengthTicks?: number }[]): string {
    return es.map(e => {
        const tk = e.startTick ?? Math.round((e.startBeat ?? 0) * ppq);
        const len = e.lengthTicks ?? e.length ?? 0;
        return `${tk}:${e.transposition}:${e.type}:${len}`;
    }).join('|');
}

console.log('H  ExistingValid  PhaseOnePrefixes  ValidCoveredByPhaseOne  PhaseOneMs');
for (const H of [4, 5, 6]) {
    const opts: StrettoSearchOptions = { ...baseOptions, targetChainLength: H, maxSearchTimeMs: 60_000 };
    const oldR = await searchStrettoChains(baseSubject, opts, ppq);
    // Existing search may return partial chains (best-effort fallback when full
    // depth not reached). Only validate against full-depth results.
    const oldFullDepth = oldR.results.filter(r => r.entries.length === H);
    const oldValidSigs = new Set(oldFullDepth.map(r => sigEntries(r.entries)));

    const newR = await runPhaseOne({
        rawSubject: baseSubject, options: baseOptions, ppq,
        transpositionPool: tradTranspositions, H, maxPrefixes: 5_000_000
    });
    const newSigs = new Set(newR.prefixes.map(p => sigEntries(p.entries)));

    let covered = 0;
    const missing: string[] = [];
    for (const s of oldValidSigs) {
        if (newSigs.has(s)) covered++;
        else missing.push(s);
    }
    console.log(
        `${H}  ${String(oldValidSigs.size).padStart(13)}  ${String(newR.count).padStart(16)}  ${String(covered).padStart(22)}  ${String(newR.timeMs).padStart(10)}`
    );
    if (missing.length > 0) {
        console.log('  example missing:', missing.slice(0, 3));
    }
    // Phase 1 must cover every valid chain. Failure here means Phase 1 is over-pruning
    // — applying a rule that the existing pipeline does not.
    assert.equal(covered, oldValidSigs.size, `Phase 1 missing ${oldValidSigs.size - covered} valid chains at H=${H}`);
}
console.log('\n✓ Phase 1 covers every valid chain produced by searchStrettoChains.');
