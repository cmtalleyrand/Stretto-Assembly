// Validate H-bounded search: combining Phase 1 (depth H) + Phase 2
// continuation should produce the same set of full chains as Phase 1
// run directly to depth = targetChainLength.

import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import { runPhaseOne } from './phaseOnePrefixEnum';
import { runHBoundedSearch } from './hBoundedSearch';
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

function sigEntries(es: { startTick?: number; startBeat?: number; transposition: number; type: string; length?: number; lengthTicks?: number }[]): string {
    return es.map(e => {
        const tk = e.startTick ?? Math.round((e.startBeat ?? 0) * ppq);
        const len = e.lengthTicks ?? e.length ?? 0;
        return `${tk}:${e.transposition}:${e.type}:${len}`;
    }).join('|');
}

console.log('Test 1: H-bounded with H == targetChainLength matches Phase 1 directly');
{
    const N = 4;
    const opts: StrettoSearchOptions = { ...baseOptions, targetChainLength: N };
    const phaseOne = await runPhaseOne({
        rawSubject: baseSubject, options: opts, ppq, transpositionPool: tradTranspositions, H: N
    });
    const hBounded = await runHBoundedSearch({
        rawSubject: baseSubject, options: opts, ppq, transpositionPool: tradTranspositions, H: N
    });
    const setA = new Set(phaseOne.prefixes.map(p => sigEntries(p.entries)));
    const setB = new Set(hBounded.chains.map(c => sigEntries(c.entries)));
    console.log(`  PhaseOne(H=N=4): ${setA.size}  HBoundedSearch(H=N=4): ${setB.size}`);
    assert.equal(setA.size, setB.size, 'set sizes should match when H == targetChainLength');
    for (const s of setA) assert.ok(setB.has(s), `missing chain in H-bounded: ${s}`);
}

console.log('\nTest 2: H-bounded with H < targetChainLength produces same chains as Phase 1 direct at full depth');
for (const N of [4, 5]) {
    for (const H of [2, 3, N - 1]) {
        if (H < 1 || H >= N) continue;
        const opts: StrettoSearchOptions = { ...baseOptions, targetChainLength: N };
        const phaseOne = await runPhaseOne({
            rawSubject: baseSubject, options: opts, ppq, transpositionPool: tradTranspositions, H: N
        });
        const hBounded = await runHBoundedSearch({
            rawSubject: baseSubject, options: opts, ppq, transpositionPool: tradTranspositions, H
        });
        const setA = new Set(phaseOne.prefixes.map(p => sigEntries(p.entries)));
        const setB = new Set(hBounded.chains.map(c => sigEntries(c.entries)));
        const inANotB: string[] = [];
        const inBNotA: string[] = [];
        for (const s of setA) if (!setB.has(s)) inANotB.push(s);
        for (const s of setB) if (!setA.has(s)) inBNotA.push(s);
        console.log(`  N=${N} H=${H}  PhaseOne=${setA.size}  HBounded=${setB.size}  inANotB=${inANotB.length}  inBNotA=${inBNotA.length}  frontiers=${hBounded.distinctFrontiers}  ms=${hBounded.timeMs}`);
        if (inANotB.length > 0) console.log('    example A-only:', inANotB[0]);
        if (inBNotA.length > 0) console.log('    example B-only:', inBNotA[0]);
        assert.equal(inANotB.length, 0, `H-bounded missing chains: ${inANotB.length}`);
        assert.equal(inBNotA.length, 0, `H-bounded extra chains: ${inBNotA.length}`);
    }
}

console.log('\nTest 3: every chain produced by searchStrettoChains is in H-bounded output');
for (const N of [4]) {
    for (const H of [2, 3]) {
        const opts: StrettoSearchOptions = { ...baseOptions, targetChainLength: N, maxSearchTimeMs: 60_000 };
        const oldR = await searchStrettoChains(baseSubject, opts, ppq);
        const oldFullDepth = oldR.results.filter(r => r.entries.length === N);
        const oldSigs = new Set(oldFullDepth.map(r => sigEntries(r.entries)));
        const hBounded = await runHBoundedSearch({
            rawSubject: baseSubject, options: opts, ppq, transpositionPool: tradTranspositions, H
        });
        const newSigs = new Set(hBounded.chains.map(c => sigEntries(c.entries)));
        let covered = 0;
        for (const s of oldSigs) if (newSigs.has(s)) covered++;
        console.log(`  N=${N} H=${H}  existingValid=${oldSigs.size}  HBoundedFull=${newSigs.size}  covered=${covered}/${oldSigs.size}`);
        assert.equal(covered, oldSigs.size, `H-bounded missing valid chain at H=${H}`);
    }
}

console.log('\n✓ All tests passed.');
