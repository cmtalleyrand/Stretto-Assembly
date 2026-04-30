// Frontier study runner. Sweeps (subject × quotas × H) and prints the
// measurement table.

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

const tradTranspositions = [-31, -29, -19, -17, -7, -5, 0, 5, 7, 17, 19, 29, 31, -24, -12, 12, 24];
const INF = 0x7fffffff;
const MAX_PREFIXES = 300_000;

// (qI, qT) cells; qRestricted = unbounded throughout.
const quotaCells: { label: string; qI: number; qT: number }[] = [
    { label: 'q0/0', qI: 0, qT: 0 },
    { label: 'q1/1', qI: 1, qT: 1 },
    { label: 'q∞/∞', qI: INF, qT: INF }
];

interface Row {
    subject: string;
    quotas: string;
    H: number;
    prefixes: number;
    capped: boolean;
    lean: number;
    comp: number;
    ratioLean: string;
    ratioComp: string;
    ms: number;
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
                qRestricted: INF,
                ensembleTotal: 4,
                subjectVoiceIndex: 1,
                transpositionPool: tradTranspositions,
                maxPairwiseDissonance: 0.5,
                fourthTreatment: 'dissonant',
                maxPrefixes: MAX_PREFIXES
            });
            rows.push({
                subject: s.name.split(':')[0],
                quotas: q.label,
                H,
                prefixes: r.prefixes,
                capped: r.cappedAtMax,
                lean: r.distinctLean,
                comp: r.distinctComp,
                ratioLean: r.ratioLean.toFixed(2),
                ratioComp: r.ratioComp.toFixed(2),
                ms: r.timeMs
            });
            // Print incrementally so partial progress is visible.
            console.log(
                `${s.name.split(':')[0].padEnd(3)}  ${q.label.padEnd(5)}  H=${H}  prefixes=${String(r.prefixes).padStart(8)}${r.cappedAtMax ? '+' : ' '}  lean=${String(r.distinctLean).padStart(8)}  comp=${String(r.distinctComp).padStart(8)}  rL=${r.ratioLean.toFixed(2).padStart(6)}  rC=${r.ratioComp.toFixed(2).padStart(6)}  ${r.timeMs}ms`
            );
            if (r.cappedAtMax) break;  // skip larger H if smaller H already capped
        }
    }
}

console.log('\nSummary table:');
console.log('Subject  Quotas  H  Prefixes      Lean         Comp         Ratio_lean  Ratio_comp  ms');
for (const r of rows) {
    console.log(
        `${r.subject.padEnd(7)}  ${r.quotas.padEnd(6)}  ${r.H}  ${String(r.prefixes).padStart(10)}${r.capped ? '+' : ' '}  ${String(r.lean).padStart(10)}  ${String(r.comp).padStart(10)}  ${r.ratioLean.padStart(10)}  ${r.ratioComp.padStart(10)}  ${String(r.ms).padStart(5)}`
    );
}
