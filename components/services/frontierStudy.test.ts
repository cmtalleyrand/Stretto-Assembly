// Frontier study runner. Sweeps (subject × quotas × H) and prints the
// measurement table.
//
// |prefixes| is sourced from searchStrettoChains (the full pipeline,
// every rule applied), so it is the rigorous count of valid chains of
// length H — not a custom truncated rule-applier.

import { runFrontierStudy, type FrontierStudySubject } from './frontierStudy';

const subjects: FrontierStudySubject[] = [
    {
        name: 'S1: 4-beat C-major stepwise',
        SbBeats: 4, pivotMidi: 64, scaleRoot: 0, scaleMode: 'Major',
        notes: [
            { pitch: 60, relBeat: 0, durBeat: 1 },
            { pitch: 62, relBeat: 1, durBeat: 1 },
            { pitch: 64, relBeat: 2, durBeat: 1 },
            { pitch: 65, relBeat: 3, durBeat: 1 }
        ]
    },
    {
        name: 'S2: 8-beat with leap and rhythmic variety',
        SbBeats: 8, pivotMidi: 65, scaleRoot: 0, scaleMode: 'Major',
        notes: [
            { pitch: 60, relBeat: 0, durBeat: 1 },
            { pitch: 64, relBeat: 1, durBeat: 0.5 },
            { pitch: 67, relBeat: 1.5, durBeat: 0.5 },
            { pitch: 65, relBeat: 2, durBeat: 1 },
            { pitch: 64, relBeat: 3, durBeat: 1 },
            { pitch: 62, relBeat: 4, durBeat: 1 },
            { pitch: 60, relBeat: 5, durBeat: 2 },
            { pitch: 64, relBeat: 7, durBeat: 1 }
        ]
    },
    {
        name: 'S3: 12-beat over 3 measures',
        SbBeats: 12, pivotMidi: 67, scaleRoot: 0, scaleMode: 'Major',
        notes: [
            { pitch: 60, relBeat: 0, durBeat: 0.5 },
            { pitch: 64, relBeat: 0.5, durBeat: 0.5 },
            { pitch: 67, relBeat: 1, durBeat: 1 },
            { pitch: 65, relBeat: 2, durBeat: 1 },
            { pitch: 64, relBeat: 3, durBeat: 1 },
            { pitch: 67, relBeat: 4, durBeat: 0.5 },
            { pitch: 71, relBeat: 4.5, durBeat: 0.5 },
            { pitch: 72, relBeat: 5, durBeat: 1 },
            { pitch: 71, relBeat: 6, durBeat: 1 },
            { pitch: 69, relBeat: 7, durBeat: 1 },
            { pitch: 67, relBeat: 8, durBeat: 1 },
            { pitch: 65, relBeat: 9, durBeat: 1 },
            { pitch: 64, relBeat: 10, durBeat: 1 },
            { pitch: 60, relBeat: 11, durBeat: 1 }
        ]
    }
];

const quotaCells: { label: string; qI: 'None' | 'Unlimited' | number; qT: 'None' | 'Unlimited' | number }[] = [
    { label: 'q0/0',  qI: 'None',      qT: 'None' },
    { label: 'q1/1',  qI: 1,           qT: 1 },
    { label: 'q∞/∞',  qI: 'Unlimited', qT: 'Unlimited' }
];

interface Row {
    subject: string;
    quotas: string;
    H: number;
    prefixes: number;
    lean: number;
    comp: number;
    ratioLean: string;
    ratioComp: string;
    ms: number;
    stop: string;
}

const rows: Row[] = [];

for (const s of subjects) {
    for (const q of quotaCells) {
        for (const H of [3, 4, 5, 6, 7]) {
            const r = await runFrontierStudy({
                subject: s,
                H,
                qI: q.qI,
                qT: q.qT,
                qRestricted: 'None',
                ensembleTotal: 4,
                subjectVoiceIndex: 1,
                maxPairwiseDissonance: 0.5,
                disallowComplexExceptions: true,
                maxSearchTimeMs: 60_000
            });
            rows.push({
                subject: s.name.split(':')[0],
                quotas: q.label,
                H,
                prefixes: r.prefixes,
                lean: r.distinctLean,
                comp: r.distinctComp,
                ratioLean: r.ratioLean.toFixed(2),
                ratioComp: r.ratioComp.toFixed(2),
                ms: r.timeMs,
                stop: r.stopReason
            });
            console.log(
                `${s.name.split(':')[0].padEnd(3)}  ${q.label.padEnd(5)}  H=${H}  prefixes=${String(r.prefixes).padStart(8)}  lean=${String(r.distinctLean).padStart(8)}  comp=${String(r.distinctComp).padStart(8)}  rL=${r.ratioLean.toFixed(2).padStart(6)}  rC=${r.ratioComp.toFixed(2).padStart(6)}  ${r.stopReason.padEnd(10)}  ${r.timeMs}ms`
            );
            const fc = r.featureCardinalities;
            console.log(
                `       feature cardinalities:  d_H=${fc.d_H}  d_Hm1=${fc.d_Hm1}  var_H=${fc.var_H}  t_H=${fc.t_H}  v_H=${fc.v_H}  perVoice=${fc.perVoice}  tail=${fc.tail}  U=${fc.U}  |U|=${fc.U_size}`
            );
            if (r.stopReason === 'Timeout' || r.stopReason === 'NodeLimit') break;
        }
    }
}

console.log('\nSummary table:');
console.log('Subject  Quotas  H  Prefixes      Lean         Comp         Ratio_lean  Ratio_comp  Stop        ms');
for (const r of rows) {
    console.log(
        `${r.subject.padEnd(7)}  ${r.quotas.padEnd(6)}  ${r.H}  ${String(r.prefixes).padStart(10)}  ${String(r.lean).padStart(10)}  ${String(r.comp).padStart(10)}  ${r.ratioLean.padStart(10)}  ${r.ratioComp.padStart(10)}  ${r.stop.padEnd(10)}  ${String(r.ms).padStart(5)}`
    );
}
