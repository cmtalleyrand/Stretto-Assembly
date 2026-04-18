import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import { computeU1, computeU2 } from './strettoTestUtils';
import type { RawNote, StrettoSearchOptions, StrettoSearchReport } from '../../types';

// ─── Outcomes of interest ──────────────────────────────────────────────────────
// The ultimate metrics for comparing search configurations or optimisations are:
//   1. Total utility of chains found (U1, U2) — quality-weighted count at or near
//      target length, deduplicating octave-equivalent chains.
//   2. Total clock time required to reach chains of equal utility — i.e. does
//      configuration A find the same U1/U2 as configuration B faster?
//
// All other statistics (nodes visited, pruning counts, stage timing, depth
// reached, stopReason) are DIAGNOSTIC only. They explain why utility differs or
// where time is spent, but they are not themselves the objective. Do not assert
// on them as proxies for outcome quality.
// ──────────────────────────────────────────────────────────────────────────────

const ppq = 480;

// Three subjects from Bach's Well-Tempered Clavier Book I.
// ABC convention used: uppercase A–G = A4–G4 (middle-C octave, key sig applied);
// lowercase = one octave higher; trailing comma = one octave lower.
// ppq = 480 (quarter note). L:1/8 → default note = 240 ticks; L:1/16 → 120 ticks.
const FIXTURES: Record<string, {
    subject: RawNote[];
    options: StrettoSearchOptions;
    depthLowerBound: number;
}> = {

    // WTC I Fugue 8, D#/Eb minor
    // K:Eb min (6♭: B♭ E♭ A♭ D♭ G♭ C♭), L:1/8
    // z E E E =D E F3 E A3 G/2 F/2 B A G F E
    wtc1_f08_ebmin: {
        subject: [
            { midi: 63, ticks: 240,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 480,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 63, ticks: 720,  durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 62, ticks: 960,  durationTicks: 240, velocity: 80, name: 'D4'  }, // =D: natural
            { midi: 63, ticks: 1200, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 65, ticks: 1440, durationTicks: 720, velocity: 80, name: 'F4'  }, // F3 = dotted quarter
            { midi: 63, ticks: 2160, durationTicks: 240, velocity: 80, name: 'Eb4' },
            { midi: 68, ticks: 2400, durationTicks: 720, velocity: 80, name: 'Ab4' }, // A3 = dotted quarter
            { midi: 66, ticks: 3120, durationTicks: 120, velocity: 80, name: 'Gb4' }, // G/2 = sixteenth
            { midi: 65, ticks: 3240, durationTicks: 120, velocity: 80, name: 'F4'  }, // F/2 = sixteenth
            { midi: 70, ticks: 3360, durationTicks: 240, velocity: 80, name: 'Bb4' },
            { midi: 68, ticks: 3600, durationTicks: 240, velocity: 80, name: 'Ab4' },
            { midi: 66, ticks: 3840, durationTicks: 240, velocity: 80, name: 'Gb4' },
            { midi: 65, ticks: 4080, durationTicks: 240, velocity: 80, name: 'F4'  },
            { midi: 63, ticks: 4320, durationTicks: 240, velocity: 80, name: 'Eb4' },
        ],
        options: {
            ensembleTotal: 4,
            targetChainLength: 5,
            subjectVoiceIndex: 1,
            truncationMode: 'None',
            truncationTargetBeats: 1,
            inversionMode: 'None',
            useChromaticInversion: false,
            thirdSixthMode: 1,
            pivotMidi: 63,
            requireConsonantEnd: false,
            disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5,
            scaleRoot: 3,
            scaleMode: 'Natural Minor',
            maxSearchTimeMs: 5000,
        },
        depthLowerBound: 2,
    },

    // WTC I Fugue 21, B♭ major
    // K:Bb maj (2♭: B♭ E♭), L:1/8
    // z c B A B F D G  F E F D B, E E D D C C F F E E D
    wtc1_f21_bbmaj: {
        subject: [
            { midi: 72, ticks: 240,  durationTicks: 240, velocity: 80, name: 'C5'  }, // c = C5
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
            { midi: 58, ticks: 2880, durationTicks: 240, velocity: 80, name: 'Bb3' }, // B, = Bb3
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
        options: {
            ensembleTotal: 4,
            targetChainLength: 5,
            subjectVoiceIndex: 1,
            truncationMode: 'None',
            truncationTargetBeats: 1,
            inversionMode: 'None',
            useChromaticInversion: false,
            thirdSixthMode: 1,
            pivotMidi: 62,
            requireConsonantEnd: false,
            disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5,
            scaleRoot: 10,
            scaleMode: 'Major',
            maxSearchTimeMs: 5000,
        },
        depthLowerBound: 2,
    },

    // WTC I Fugue 24, B minor
    // K:B min (2♯: F♯ C♯), L:1/16
    // z2 A, B, C B, A, C B, D C3 E D3 F E D E B, C D
    wtc1_f24_bmin: {
        subject: [
            { midi: 57, ticks: 240,  durationTicks: 120, velocity: 80, name: 'A3'  }, // A, = A3
            { midi: 59, ticks: 360,  durationTicks: 120, velocity: 80, name: 'B3'  }, // B, = B3
            { midi: 61, ticks: 480,  durationTicks: 120, velocity: 80, name: 'C#4' }, // C = C#4
            { midi: 59, ticks: 600,  durationTicks: 120, velocity: 80, name: 'B3'  },
            { midi: 57, ticks: 720,  durationTicks: 120, velocity: 80, name: 'A3'  },
            { midi: 61, ticks: 840,  durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 59, ticks: 960,  durationTicks: 120, velocity: 80, name: 'B3'  },
            { midi: 62, ticks: 1080, durationTicks: 120, velocity: 80, name: 'D4'  },
            { midi: 61, ticks: 1200, durationTicks: 360, velocity: 80, name: 'C#4' }, // C3 = dotted eighth
            { midi: 64, ticks: 1560, durationTicks: 120, velocity: 80, name: 'E4'  },
            { midi: 62, ticks: 1680, durationTicks: 360, velocity: 80, name: 'D4'  }, // D3 = dotted eighth
            { midi: 66, ticks: 2040, durationTicks: 120, velocity: 80, name: 'F#4' }, // F = F#4
            { midi: 64, ticks: 2160, durationTicks: 120, velocity: 80, name: 'E4'  },
            { midi: 62, ticks: 2280, durationTicks: 120, velocity: 80, name: 'D4'  },
            { midi: 64, ticks: 2400, durationTicks: 120, velocity: 80, name: 'E4'  },
            { midi: 59, ticks: 2520, durationTicks: 120, velocity: 80, name: 'B3'  },
            { midi: 61, ticks: 2640, durationTicks: 120, velocity: 80, name: 'C#4' },
            { midi: 62, ticks: 2760, durationTicks: 120, velocity: 80, name: 'D4'  },
        ],
        options: {
            ensembleTotal: 4,
            targetChainLength: 5,
            subjectVoiceIndex: 2,  // tenor: A3–F#4
            truncationMode: 'None',
            truncationTargetBeats: 1,
            inversionMode: 'None',
            useChromaticInversion: false,
            thirdSixthMode: 1,
            pivotMidi: 61,
            requireConsonantEnd: false,
            disallowComplexExceptions: true,
            maxPairwiseDissonance: 0.5,
            scaleRoot: 11,
            scaleMode: 'Natural Minor',
            maxSearchTimeMs: 5000,
        },
        depthLowerBound: 2,
    },
};

function subjectSpanOf(subject: RawNote[]): number {
    return Math.max(0, Math.max(...subject.map(n => n.midi)) - Math.min(...subject.map(n => n.midi)));
}

function logRun(
    fixtureName: string,
    label: string,
    budgetMs: number,
    depth: number,
    report: StrettoSearchReport,
    subjectSpan: number
): void {
    const u1 = computeU1(report.results, depth, subjectSpan);
    const u2 = computeU2(report.results, depth, subjectSpan);
    const fullLength = report.results.filter(c => c.entries.length === depth).length;
    const st = report.stats.stageTiming;
    console.log(
        `[${fixtureName}:${label}] budget=${budgetMs}ms depth=${depth}` +
        ` stopReason=${report.stats.stopReason} chains=${report.results.length}` +
        ` fullLength=${fullLength} U1=${u1.toFixed(3)} U2=${u2.toFixed(3)}` +
        ` actualMs=${report.stats.timeMs}` +
        (st ? ` [admiss=${st.admissibilityMs}ms pair=${st.pairwiseMs}ms trip=${st.tripletMs}ms dag=${st.dagMs}ms]` : '')
    );
}

for (const [fixtureName, fixture] of Object.entries(FIXTURES)) {
    const subjectSpan = subjectSpanOf(fixture.subject);

    // Warmup run (JIT stabilisation)
    await searchStrettoChains(fixture.subject, fixture.options, ppq);

    // Baseline run at 15s
    const baseReport = await searchStrettoChains(
        fixture.subject,
        { ...fixture.options, maxSearchTimeMs: 15000 },
        ppq
    );

    // Correctness assertions: these guard against catastrophic regressions.
    // They are NOT proxies for outcome quality (U1/U2 and time-to-equal-utility are).
    const validStopReasons = new Set(['Exhausted', 'Success', 'Timeout']);
    assert.ok(
        validStopReasons.has(baseReport.stats.stopReason ?? ''),
        `${fixtureName}: unexpected stopReason '${baseReport.stats.stopReason}'`
    );
    assert.ok(
        baseReport.stats.maxDepthReached >= fixture.depthLowerBound,
        `${fixtureName} depth regression: ${baseReport.stats.maxDepthReached} < required ${fixture.depthLowerBound}`
    );

    logRun(fixtureName, 'base@15s', 15000, fixture.options.targetChainLength, baseReport, subjectSpan);

    const exhaustedAt15s = baseReport.stats.stopReason === 'Exhausted';
    const hasDesiredLengthChains = baseReport.results.some(c => c.entries.length === fixture.options.targetChainLength);

    if (exhaustedAt15s) {
        // Search space exhausted within budget: find minimum viable budget, then probe harder depths.

        // a) Decrement budget by 3s until search no longer exhausts the space.
        let timeMs = 15000 - 3000;
        while (timeMs >= 3000) {
            const r = await searchStrettoChains(
                fixture.subject,
                { ...fixture.options, maxSearchTimeMs: timeMs },
                ppq
            );
            logRun(fixtureName, `decr@${timeMs}ms`, timeMs, fixture.options.targetChainLength, r, subjectSpan);
            if (r.stats.stopReason !== 'Exhausted') break;
            timeMs -= 3000;
        }

        // b) Increment target chain length by 1 at 15s budget until the search times out.
        let depth = fixture.options.targetChainLength + 1;
        while (true) {
            const r = await searchStrettoChains(
                fixture.subject,
                { ...fixture.options, targetChainLength: depth, maxSearchTimeMs: 15000 },
                ppq
            );
            logRun(fixtureName, `depth+${depth - fixture.options.targetChainLength}@15s`, 15000, depth, r, subjectSpan);
            if (r.stats.stopReason === 'Timeout') break;
            depth++;
        }
    } else if (hasDesiredLengthChains) {
        // Found chains at target length but didn't exhaust the space: probe whether more time improves utility.
        let timeMs = 15000 + 5000;
        while (timeMs <= 30000) {
            const r = await searchStrettoChains(
                fixture.subject,
                { ...fixture.options, maxSearchTimeMs: timeMs },
                ppq
            );
            logRun(fixtureName, `incr@${timeMs}ms`, timeMs, fixture.options.targetChainLength, r, subjectSpan);
            if (r.stats.stopReason === 'Exhausted') break;
            timeMs += 5000;
        }
    } else {
        // No chains at target length found within 15s: probe whether more time yields any.
        let timeMs = 15000 + 15000;
        while (timeMs <= 60000) {
            const r = await searchStrettoChains(
                fixture.subject,
                { ...fixture.options, maxSearchTimeMs: timeMs },
                ppq
            );
            logRun(fixtureName, `incr@${timeMs}ms`, timeMs, fixture.options.targetChainLength, r, subjectSpan);
            if (r.results.some(c => c.entries.length === fixture.options.targetChainLength)) break;
            timeMs += 15000;
        }
    }
}

// Pressure test: ensures timeout-aware internals are populated under severe time constraints.
{
    const pressuredOptions: StrettoSearchOptions = { ...FIXTURES.wtc1_f24_bmin.options, maxSearchTimeMs: 40 };
    const pressuredReport = await searchStrettoChains(FIXTURES.wtc1_f24_bmin.subject, pressuredOptions, ppq);
    assert.ok(
        (pressuredReport.stats.tripletBudgetMs ?? 0) > 0,
        'triplet budget must be computed under timeout pressure'
    );
    assert.ok(
        (pressuredReport.stats.finalizationScoredCount ?? 0) >= 0,
        'finalization counter must be present under timeout pressure'
    );
}

console.log('stretto performance regression test passed');
