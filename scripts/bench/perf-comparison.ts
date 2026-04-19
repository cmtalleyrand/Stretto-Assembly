/**
 * Focused performance comparison benchmark.
 * Measures: U1, U2, tripletMs, tripletRejectedTotal, tripletRejectPrefixRunBound,
 * chainsFound, and time-per-useful-chain.
 * Usage: node --import tsx scripts/bench/perf-comparison.ts
 */
import { searchStrettoChains } from '../../components/services/strettoGenerator';
import { computeU1, computeU2 } from '../../components/services/strettoTestUtils';
import type { RawNote, StrettoSearchOptions } from '../../types';

const ppq = 480;
const BUDGET_MS = 12000;
const WARMUP_MS = 3000;

const FIXTURES: Array<{ name: string; subject: RawNote[]; options: StrettoSearchOptions }> = [
    {
        name: 'wtc1_f08_ebmin (chain=5)',
        subject: [
            { midi: 63, ticks: 240,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 480,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 720,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 62, ticks: 960,  durationTicks: 240, velocity: 80, name: 'D4' },
            { midi: 63, ticks: 1200, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 65, ticks: 1440, durationTicks: 720, velocity: 80, name: 'F4' },
            { midi: 63, ticks: 2160, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 68, ticks: 2400, durationTicks: 720, velocity: 80, name: 'Ab4' },
            { midi: 66, ticks: 3120, durationTicks: 120, velocity: 80, name: 'Gb4' },
            { midi: 65, ticks: 3240, durationTicks: 120, velocity: 80, name: 'F4' },
            { midi: 70, ticks: 3360, durationTicks: 240, velocity: 80, name: 'Bb4' },
            { midi: 68, ticks: 3600, durationTicks: 240, velocity: 80, name: 'Ab4' },
            { midi: 66, ticks: 3840, durationTicks: 240, velocity: 80, name: 'Gb4' },
            { midi: 65, ticks: 4080, durationTicks: 240, velocity: 80, name: 'F4' },
            { midi: 63, ticks: 4320, durationTicks: 240, velocity: 80, name: 'Eb4' },
        ],
        options: {
            ensembleTotal: 4, targetChainLength: 5, subjectVoiceIndex: 1,
            truncationMode: 'None', truncationTargetBeats: 1,
            inversionMode: 'None', useChromaticInversion: false,
            thirdSixthMode: 1, pivotMidi: 63,
            requireConsonantEnd: false, disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5, scaleRoot: 3, scaleMode: 'Natural Minor',
            maxSearchTimeMs: BUDGET_MS,
        },
    },
    {
        name: 'wtc1_f24_bmin (chain=5)',
        subject: [
            { midi: 59, ticks: 120,  durationTicks: 120, velocity: 80, name: 'B3' },
            { midi: 61, ticks: 240,  durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 62, ticks: 360,  durationTicks: 120, velocity: 80, name: 'D4' },
            { midi: 64, ticks: 480,  durationTicks: 120, velocity: 80, name: 'E4' },
            { midi: 66, ticks: 600,  durationTicks: 120, velocity: 80, name: 'F#4' },
            { midi: 64, ticks: 720,  durationTicks: 120, velocity: 80, name: 'E4' },
            { midi: 62, ticks: 840,  durationTicks: 120, velocity: 80, name: 'D4' },
            { midi: 61, ticks: 960,  durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 59, ticks: 1080, durationTicks: 120, velocity: 80, name: 'B3' },
            { midi: 57, ticks: 1200, durationTicks: 120, velocity: 80, name: 'A3' },
            { midi: 59, ticks: 1320, durationTicks: 120, velocity: 80, name: 'B3' },
            { midi: 61, ticks: 1440, durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 62, ticks: 1560, durationTicks: 120, velocity: 80, name: 'D4' },
            { midi: 61, ticks: 1680, durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 59, ticks: 1800, durationTicks: 120, velocity: 80, name: 'B3' },
            { midi: 57, ticks: 1920, durationTicks: 480, velocity: 80, name: 'A3' },
        ],
        options: {
            ensembleTotal: 4, targetChainLength: 5, subjectVoiceIndex: 1,
            truncationMode: 'None', truncationTargetBeats: 1,
            inversionMode: 'None', useChromaticInversion: false,
            thirdSixthMode: 1, pivotMidi: 59,
            requireConsonantEnd: false, disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5, scaleRoot: 11, scaleMode: 'Natural Minor',
            maxSearchTimeMs: BUDGET_MS,
        },
    },
    {
        name: 'wtc1_f08_ebmin (chain=6 harder)',
        subject: [
            { midi: 63, ticks: 240,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 480,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 720,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 62, ticks: 960,  durationTicks: 240, velocity: 80, name: 'D4' },
            { midi: 63, ticks: 1200, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 65, ticks: 1440, durationTicks: 720, velocity: 80, name: 'F4' },
            { midi: 63, ticks: 2160, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 68, ticks: 2400, durationTicks: 720, velocity: 80, name: 'Ab4' },
            { midi: 66, ticks: 3120, durationTicks: 120, velocity: 80, name: 'Gb4' },
            { midi: 65, ticks: 3240, durationTicks: 120, velocity: 80, name: 'F4' },
            { midi: 70, ticks: 3360, durationTicks: 240, velocity: 80, name: 'Bb4' },
            { midi: 68, ticks: 3600, durationTicks: 240, velocity: 80, name: 'Ab4' },
            { midi: 66, ticks: 3840, durationTicks: 240, velocity: 80, name: 'Gb4' },
            { midi: 65, ticks: 4080, durationTicks: 240, velocity: 80, name: 'F4' },
            { midi: 63, ticks: 4320, durationTicks: 240, velocity: 80, name: 'Eb4' },
        ],
        options: {
            ensembleTotal: 4, targetChainLength: 6, subjectVoiceIndex: 1,
            truncationMode: 'None', truncationTargetBeats: 1,
            inversionMode: 1, useChromaticInversion: false,
            thirdSixthMode: 1, pivotMidi: 63,
            requireConsonantEnd: false, disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5, scaleRoot: 3, scaleMode: 'Natural Minor',
            maxSearchTimeMs: BUDGET_MS,
        },
    },
];

function subjectSpan(subject: RawNote[]): number {
    const midis = subject.map(n => n.midi);
    return Math.max(...midis) - Math.min(...midis);
}

function fmtNum(n: number | undefined): string {
    if (n === undefined) return 'n/a';
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return String(n);
}

interface Row {
    fixture: string;
    stopReason: string;
    elapsedMs: number;
    tripletMs: number;
    dagMs: number;
    tripletCandidates: number;
    tripletRejectedTotal: number;
    prefixRunBound: number;
    prefixRunBoundPct: string;
    tripletAccepted: number;
    chainsFound: number;
    targetLengthChains: number;
    U1: number;
    U2: number;
}

const rows: Row[] = [];

for (const fixture of FIXTURES) {
    const span = subjectSpan(fixture.subject);
    // Warmup
    await searchStrettoChains(fixture.subject, { ...fixture.options, maxSearchTimeMs: WARMUP_MS }, ppq);

    const t0 = Date.now();
    const report = await searchStrettoChains(fixture.subject, fixture.options, ppq);
    const elapsed = Date.now() - t0;

    const ss = report.stats.stageStats as (typeof report.stats.stageStats & { tripletRejectPrefixRunBound?: number }) | undefined;
    const prefixRunBound = (ss as any)?.tripletRejectPrefixRunBound ?? 0;
    const tripletCandidates = ss?.tripleCandidates ?? 0;
    const tripletRejectedTotal = ss?.tripletRejectedTotal ?? 0;
    const tripletAccepted = ss?.tripletCandidatesAccepted ?? 0;
    const pct = tripletCandidates > 0 ? ((prefixRunBound / tripletCandidates) * 100).toFixed(1) + '%' : 'n/a';

    const targetLen = fixture.options.targetChainLength;
    const targetChains = report.results.filter(c => c.entries.length === targetLen).length;
    const u1 = computeU1(report.results, targetLen, span);
    const u2 = computeU2(report.results, targetLen, span);

    rows.push({
        fixture: fixture.name,
        stopReason: report.stats.stopReason,
        elapsedMs: elapsed,
        tripletMs: report.stats.stageTiming?.tripletMs ?? 0,
        dagMs: report.stats.stageTiming?.dagMs ?? 0,
        tripletCandidates,
        tripletRejectedTotal,
        prefixRunBound,
        prefixRunBoundPct: pct,
        tripletAccepted,
        chainsFound: report.results.length,
        targetLengthChains: targetChains,
        U1: u1,
        U2: u2,
    });
}

// Print table
console.log('\n=== PERFORMANCE BENCHMARK RESULTS ===\n');
for (const r of rows) {
    console.log(`Fixture: ${r.fixture}`);
    console.log(`  Stop: ${r.stopReason}  |  Elapsed: ${r.elapsedMs}ms  |  tripletMs: ${r.tripletMs}ms  |  dagMs: ${r.dagMs}ms`);
    console.log(`  Triplet candidates: ${fmtNum(r.tripletCandidates)}  rejected: ${fmtNum(r.tripletRejectedTotal)}  accepted: ${fmtNum(r.tripletAccepted)}`);
    console.log(`  prefixRunBound rejections: ${fmtNum(r.prefixRunBound)} (${r.prefixRunBoundPct} of candidates)`);
    console.log(`  Chains found: ${r.chainsFound}  |  at target length: ${r.targetLengthChains}`);
    console.log(`  U1: ${r.U1.toFixed(4)}  |  U2: ${r.U2.toFixed(4)}`);
    console.log();
}
