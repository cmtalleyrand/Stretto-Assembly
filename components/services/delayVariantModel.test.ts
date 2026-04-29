// Smoke + size benchmark for Model A.
// Run: node --import tsx components/services/delayVariantModel.test.ts

import assert from 'node:assert/strict';
import { buildDelayVariantSequences } from './delayVariantModel';
import type { SubjectVariant } from './strettoScoring';
import type { StrettoSearchOptions } from '../../types';

const ppq = 480;
const delayStep = ppq / 2;

// Build a synthetic variant list at a given subject length (ticks).
function makeVariants(subjectLengthTicks: number, includeInv: boolean, includeTrunc: boolean, truncBeats: number): SubjectVariant[] {
    const base: SubjectVariant = {
        type: 'N',
        truncationBeats: 0,
        notes: [],
        lengthTicks: subjectLengthTicks
    };
    const variants: SubjectVariant[] = [base];
    if (includeInv) {
        variants.push({ type: 'I', truncationBeats: 0, notes: [], lengthTicks: subjectLengthTicks });
    }
    if (includeTrunc) {
        variants.push({
            type: 'N', truncationBeats: truncBeats, notes: [],
            lengthTicks: subjectLengthTicks - Math.round(truncBeats * ppq)
        });
    }
    return variants;
}

const baseOptions: StrettoSearchOptions = {
    ensembleTotal: 4,
    targetChainLength: 0, // overridden per-call
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

interface Bench { Sb: number; n: number; quotas: string; count: number; states: number; ms: number; }

const results: Bench[] = [];

const SEQUENCE_CAP = 20_000_000;

async function bench(SbBeats: number, n: number, label: string, opts: Partial<StrettoSearchOptions>, includeInv: boolean, includeTrunc: boolean) {
    const Sb = SbBeats * ppq;
    const variants = makeVariants(Sb, includeInv, includeTrunc, 1);
    const t0 = Date.now();
    const res = await buildDelayVariantSequences(
        variants, delayStep, n,
        { ...baseOptions, ...opts, targetChainLength: n },
        { onSequence: () => { /* count only, do not retain */ }, maxSequences: SEQUENCE_CAP }
    );
    const ms = Date.now() - t0;
    const cappedTag = res.stats.truncatedAtCap ? '+' : ' ';
    results.push({ Sb: SbBeats, n, quotas: label + cappedTag, count: res.stats.sequencesEmitted, states: res.stats.statesVisited, ms });
}

// Sanity: single-step chain at small Sb yields a small countable set.
{
    const variants = makeVariants(4 * ppq, false, false, 1);
    const res = await buildDelayVariantSequences(variants, delayStep, 2, { ...baseOptions, targetChainLength: 2 });
    // For Sb=4 beats, n=2, no inv/trunc: delays from Sb/2=2 beats up to 2Sb/3=2.67 beats stepped by 0.5 → {2, 2.5}.
    // (2.67 floor to 2.5.) Variant choice: only N (variant 0). So count = 2.
    assert.equal(res.stats.sequencesEmitted, 2, `expected 2 sequences, got ${res.stats.sequencesEmitted}`);
}

// Benchmark grid.
const targets: { Sb: number; n: number }[] = [
    { Sb: 4, n: 4 }, { Sb: 4, n: 6 }, { Sb: 4, n: 8 },
    { Sb: 8, n: 4 }, { Sb: 8, n: 6 }, { Sb: 8, n: 8 },
    { Sb: 12, n: 4 }, { Sb: 12, n: 6 }, { Sb: 12, n: 8 },
    { Sb: 16, n: 4 }, { Sb: 16, n: 6 }, { Sb: 16, n: 8 }
];

for (const t of targets) {
    await bench(t.Sb, t.n, 'N-only', {}, false, false);
}
for (const t of targets) {
    await bench(t.Sb, t.n, 'N+I unlimited', { inversionMode: 'Unlimited' }, true, false);
}
for (const t of targets) {
    await bench(t.Sb, t.n, 'N+I+T unlimited', { inversionMode: 'Unlimited', truncationMode: 'Unlimited' }, true, true);
}
for (const t of targets) {
    await bench(t.Sb, t.n, 'nInv=1 nTrunc=1', { inversionMode: 1, truncationMode: 1 }, true, true);
}
for (const t of targets) {
    await bench(t.Sb, t.n, 'nInv=2 nTrunc=2', { inversionMode: 2, truncationMode: 2 }, true, true);
}

console.log('\n|Seq_A| benchmark — delayStep = ppq/2, ppq=480');
console.log('Sb(beats)  n  quotas              count       states     ms');
console.log('---------  -  ------------------  ----------  ---------  -----');
for (const r of results) {
    console.log(
        `${String(r.Sb).padStart(8)}   ${r.n}  ${r.quotas.padEnd(18)}  ${String(r.count).padStart(10)}  ${String(r.states).padStart(9)}  ${String(r.ms).padStart(5)}`
    );
}
console.log('');
