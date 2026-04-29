// Smoke + size benchmark for Model B.

import { buildTranspositionVoiceSequences } from './transpositionVoiceModel';

const tradTranspositions = [0, 5, -5, 7, -7, 12, -12, 17, -17, 19, -19, 24, -24, 29, -29, 31, -31];

interface Bench { ensembleTotal: number; subjectVoice: number; n: number; pool: number; count: number; capped: boolean; ms: number; }
const results: Bench[] = [];

function bench(label: string, ensembleTotal: number, subjectVoice: number, n: number, pool: number[]) {
    const t0 = Date.now();
    const r = buildTranspositionVoiceSequences({
        chainLength: n,
        ensembleTotal,
        subjectVoiceIndex: subjectVoice,
        transpositionPool: pool,
        onSequence: () => { /* count only */ },
        maxSequences: 50_000_000
    });
    const ms = Date.now() - t0;
    results.push({ ensembleTotal, subjectVoice, n, pool: pool.length, count: r.stats.sequencesEmitted, capped: r.stats.truncatedAtCap, ms });
}

for (const n of [4, 6, 8]) {
    for (const sv of [0, 1, 2, 3]) {
        bench(`E4 sv${sv} n${n}`, 4, sv, n, tradTranspositions);
    }
}

console.log('|Seq_B| benchmark — A.7 + B-rules across all temporal pairs');
console.log('ensemble  sv  n  |pool|  |Seq_B|       capped  ms');
console.log('--------  --  -  ------  ------------  ------  ----');
for (const r of results) {
    console.log(
        `${String(r.ensembleTotal).padStart(8)}  ${r.subjectVoice}   ${r.n}  ${String(r.pool).padStart(6)}  ${String(r.count).padStart(12)}  ${String(r.capped).padStart(6)}  ${String(r.ms).padStart(4)}`
    );
}
