// Frontier study runner.

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

console.log('Subject  Quotas  H  StructComplete  PrefixAdmis  Distinct  RatioStruct  RatioAdmis  DAGmerge   Stop        ms');

for (const s of subjects) {
    for (const q of quotaCells) {
        for (const H of [3, 4, 5, 6, 7, 8]) {
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
            console.log(
                `${s.name.split(':')[0].padEnd(7)}  ${q.label.padEnd(6)}  ${H}  ${String(r.structurallyComplete).padStart(14)}  ${String(r.prefixAdmissible).padStart(11)}  ${String(r.distinctStructural).padStart(8)}  ${r.ratioStructural.toFixed(2).padStart(11)}  ${r.ratioPrefixAdmissible.toFixed(2).padStart(10)}  ${String(r.deterministicDagMergedNodes ?? 0).padStart(8)}   ${r.stopReason.padEnd(10)}  ${String(r.timeMs).padStart(5)}`
            );
            if (r.stopReason === 'Timeout') break;
        }
    }
}
