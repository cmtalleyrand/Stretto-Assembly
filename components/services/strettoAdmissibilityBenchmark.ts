/**
 * Admissibility Model Benchmark
 *
 * Runs three WTC Book I subjects under three admissibility configurations:
 *   full            — current behaviour (buildEntryStateAdmissibilityModel with full transposition DFS)
 *   delay-variant   — cheaper DFS, no transposition dimension; ALL transpositions pass for reached (vA,vB,d)
 *   disabled        — no admissibility model; pairwise scans everything
 *
 * Search parameters: chain=8, inversionMode=1, truncationMode=1, thirdSixthMode=1, 20s budget.
 *
 * Hypotheses tested (see plan):
 *   b) Is admissibilityMs > pairwiseMs saved? (model costs more than it saves)
 *   c) Does delay-variant prune meaningfully at lower cost?
 *   e) Is tripletMs >> admissibilityMs? (triplet search dominates; model cost irrelevant)
 *   f) Does DAG quality (U1/U2) differ across modes? (model helps or hurts chain finding)
 *   g) Does delay-variant-only yield comparable U1 to full?
 */

import { searchStrettoChains } from './strettoGenerator';
import { computeU1, computeU2 } from './strettoTestUtils';
import type { RawNote, StrettoSearchOptions } from '../../types';
import type { StrettoAdmissibilityMode } from './strettoGenerator';

const ppq = 480;
const BUDGET_MS = 20000;

// Chain=8 with all options on — hard enough to not exhaust in budget.
function hardOptions(base: StrettoSearchOptions): StrettoSearchOptions {
    return {
        ...base,
        targetChainLength: 8,
        inversionMode: 1,
        truncationMode: 1,
        thirdSixthMode: 1,
        maxSearchTimeMs: BUDGET_MS,
    };
}

const SUBJECTS: Record<string, { subject: RawNote[]; baseOptions: StrettoSearchOptions }> = {
    // WTC I Fugue 8, Eb minor — K:Eb min (6♭), L:1/8
    wtc1_f08_ebmin: {
        subject: [
            { midi: 63, ticks: 240,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 480,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 720,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 62, ticks: 960,  durationTicks: 240, velocity: 80, name: 'D4'  },
            { midi: 63, ticks: 1200, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 65, ticks: 1440, durationTicks: 720, velocity: 80, name: 'F4'  },
            { midi: 63, ticks: 2160, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 68, ticks: 2400, durationTicks: 720, velocity: 80, name: 'Ab4' },
            { midi: 66, ticks: 3120, durationTicks: 120, velocity: 80, name: 'Gb4' },
            { midi: 65, ticks: 3240, durationTicks: 120, velocity: 80, name: 'F4'  },
            { midi: 70, ticks: 3360, durationTicks: 240, velocity: 80, name: 'Bb4' },
            { midi: 68, ticks: 3600, durationTicks: 240, velocity: 80, name: 'Ab4' },
            { midi: 66, ticks: 3840, durationTicks: 240, velocity: 80, name: 'Gb4' },
            { midi: 65, ticks: 4080, durationTicks: 240, velocity: 80, name: 'F4'  },
            { midi: 63, ticks: 4320, durationTicks: 240, velocity: 80, name: 'Eb4' },
        ],
        baseOptions: {
            ensembleTotal: 4, targetChainLength: 5, subjectVoiceIndex: 1,
            truncationMode: 'None', truncationTargetBeats: 1,
            inversionMode: 'None', useChromaticInversion: false,
            thirdSixthMode: 1, pivotMidi: 63,
            requireConsonantEnd: false, disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5, scaleRoot: 3, scaleMode: 'Natural Minor',
            maxSearchTimeMs: BUDGET_MS,
        },
    },

    // WTC I Fugue 21, Bb major — K:Bb maj (2♭), L:1/8
    wtc1_f21_bbmaj: {
        subject: [
            { midi: 72, ticks: 240,  durationTicks: 240, velocity: 80, name: 'C5'  },
            { midi: 70, ticks: 480,  durationTicks: 240, velocity: 80, name: 'Bb4' },
            { midi: 69, ticks: 720,  durationTicks: 240, velocity: 80, name: 'A4'  },
            { midi: 70, ticks: 960,  durationTicks: 240, velocity: 80, name: 'Bb4' },
            { midi: 65, ticks: 1200, durationTicks: 240, velocity: 80, name: 'F4'  },
            { midi: 62, ticks: 1440, durationTicks: 240, velocity: 80, name: 'D4'  },
            { midi: 67, ticks: 1680, durationTicks: 240, velocity: 80, name: 'G4'  },
            { midi: 65, ticks: 1920, durationTicks: 240, velocity: 80, name: 'F4'  },
            { midi: 63, ticks: 2160, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 65, ticks: 2400, durationTicks: 240, velocity: 80, name: 'F4'  },
            { midi: 62, ticks: 2640, durationTicks: 240, velocity: 80, name: 'D4'  },
            { midi: 58, ticks: 2880, durationTicks: 240, velocity: 80, name: 'Bb3' },
            { midi: 63, ticks: 3120, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 3360, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 62, ticks: 3600, durationTicks: 240, velocity: 80, name: 'D4'  },
            { midi: 62, ticks: 3840, durationTicks: 240, velocity: 80, name: 'D4'  },
            { midi: 60, ticks: 4080, durationTicks: 240, velocity: 80, name: 'C4'  },
            { midi: 60, ticks: 4320, durationTicks: 240, velocity: 80, name: 'C4'  },
            { midi: 65, ticks: 4560, durationTicks: 240, velocity: 80, name: 'F4'  },
            { midi: 65, ticks: 4800, durationTicks: 240, velocity: 80, name: 'F4'  },
            { midi: 63, ticks: 5040, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 5280, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 62, ticks: 5520, durationTicks: 240, velocity: 80, name: 'D4'  },
        ],
        baseOptions: {
            ensembleTotal: 4, targetChainLength: 5, subjectVoiceIndex: 1,
            truncationMode: 'None', truncationTargetBeats: 1,
            inversionMode: 'None', useChromaticInversion: false,
            thirdSixthMode: 1, pivotMidi: 62,
            requireConsonantEnd: false, disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5, scaleRoot: 10, scaleMode: 'Major',
            maxSearchTimeMs: BUDGET_MS,
        },
    },

    // WTC I Fugue 24, B minor — K:B min (2♯), L:1/16
    wtc1_f24_bmin: {
        subject: [
            { midi: 57, ticks: 240,  durationTicks: 120, velocity: 80, name: 'A3'  },
            { midi: 59, ticks: 360,  durationTicks: 120, velocity: 80, name: 'B3'  },
            { midi: 61, ticks: 480,  durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 59, ticks: 600,  durationTicks: 120, velocity: 80, name: 'B3'  },
            { midi: 57, ticks: 720,  durationTicks: 120, velocity: 80, name: 'A3'  },
            { midi: 61, ticks: 840,  durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 59, ticks: 960,  durationTicks: 120, velocity: 80, name: 'B3'  },
            { midi: 62, ticks: 1080, durationTicks: 120, velocity: 80, name: 'D4'  },
            { midi: 61, ticks: 1200, durationTicks: 360, velocity: 80, name: 'C#4' },
            { midi: 64, ticks: 1560, durationTicks: 120, velocity: 80, name: 'E4'  },
            { midi: 62, ticks: 1680, durationTicks: 360, velocity: 80, name: 'D4'  },
            { midi: 66, ticks: 2040, durationTicks: 120, velocity: 80, name: 'F#4' },
            { midi: 64, ticks: 2160, durationTicks: 120, velocity: 80, name: 'E4'  },
            { midi: 62, ticks: 2280, durationTicks: 120, velocity: 80, name: 'D4'  },
            { midi: 64, ticks: 2400, durationTicks: 120, velocity: 80, name: 'E4'  },
            { midi: 59, ticks: 2520, durationTicks: 120, velocity: 80, name: 'B3'  },
            { midi: 61, ticks: 2640, durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 62, ticks: 2760, durationTicks: 120, velocity: 80, name: 'D4'  },
        ],
        baseOptions: {
            ensembleTotal: 4, targetChainLength: 5, subjectVoiceIndex: 2,
            truncationMode: 'None', truncationTargetBeats: 1,
            inversionMode: 'None', useChromaticInversion: false,
            thirdSixthMode: 1, pivotMidi: 61,
            requireConsonantEnd: false, disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5, scaleRoot: 11, scaleMode: 'Natural Minor',
            maxSearchTimeMs: BUDGET_MS,
        },
    },
};

const MODES: StrettoAdmissibilityMode[] = ['full', 'delay-variant-only', 'disabled'];

function pad(s: string | number, w: number): string {
    return String(s).padStart(w);
}

for (const [subjectName, { subject, baseOptions }] of Object.entries(SUBJECTS)) {
    const opts = hardOptions(baseOptions);
    const subjectSpan = Math.max(0, Math.max(...subject.map(n => n.midi)) - Math.min(...subject.map(n => n.midi)));

    console.log(`\n${'='.repeat(90)}`);
    console.log(`=== ${subjectName}  chain=${opts.targetChainLength}  inv=${opts.inversionMode} trunc=${opts.truncationMode} 3/6=${opts.thirdSixthMode}  budget=${BUDGET_MS / 1000}s ===`);
    console.log(`${'='.repeat(90)}`);

    // Warmup (full mode only, to stabilise JIT before timing comparisons)
    await searchStrettoChains(subject, { ...opts, maxSearchTimeMs: 2000 }, ppq, undefined, { admissibilityMode: 'full' });

    const header = [
        'mode           ',
        pad('admissMs', 9), pad('pairwMs', 8), pad('tripMs', 7), pad('dagMs', 7),
        '|',
        pad('pairsScn', 9), pad('pairsCmp', 9), pad('tripAcc', 8), pad('dagNodes', 9),
        '|',
        pad('chains', 7), pad('U1', 8), pad('U2', 8),
    ].join(' ');
    console.log(header);
    console.log('-'.repeat(header.length));

    for (const mode of MODES) {
        const report = await searchStrettoChains(subject, opts, ppq, undefined, { admissibilityMode: mode });
        const st = report.stats.stageTiming!;
        const ss = report.stats.stageStats;
        const u1 = computeU1(report.results, opts.targetChainLength, subjectSpan);
        const u2 = computeU2(report.results, opts.targetChainLength, subjectSpan);

        const row = [
            (mode + ' '.repeat(15)).slice(0, 15),
            pad(st.admissibilityMs, 9), pad(st.pairwiseMs, 8), pad(st.tripletMs, 7), pad(st.dagMs, 7),
            '|',
            pad(ss?.pairwiseTotal ?? '?', 9), pad(ss?.pairwiseCompatible ?? '?', 9),
            pad(ss?.tripletCandidatesAccepted ?? ss?.harmonicallyValidTriples ?? '?', 8),
            pad(report.stats.coverage?.exploredWorkItems ?? '?', 9),
            '|',
            pad(report.results.length, 7), pad(u1.toFixed(2), 8), pad(u2.toFixed(2), 8),
        ].join(' ');
        console.log(row);
    }

    // Derived metrics (using last run = disabled, which has admissibilityMs=0 as baseline)
    console.log('');
    console.log('Derived (full vs disabled):');
    for (const mode of ['full', 'delay-variant-only'] as StrettoAdmissibilityMode[]) {
        const r = await searchStrettoChains(subject, { ...opts, maxSearchTimeMs: 3000 }, ppq, undefined, { admissibilityMode: mode });
        const rd = await searchStrettoChains(subject, { ...opts, maxSearchTimeMs: 3000 }, ppq, undefined, { admissibilityMode: 'disabled' });
        const st = r.stats.stageTiming!;
        const std = rd.stats.stageTiming!;
        const pairwiseSaved = std.pairwiseMs - st.pairwiseMs;
        const netCost = st.admissibilityMs - Math.max(0, pairwiseSaved);
        const overhead = ((st.admissibilityMs / (r.stats.timeMs || 1)) * 100).toFixed(1);
        console.log(
            `  ${mode}: admissibilityOverhead=${overhead}%  pairwiseSaved≈${pairwiseSaved}ms  netAdmissibilityCost≈${netCost}ms`
        );
    }
}

console.log('\nadmissibility benchmark complete');
