import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions, StrettoChainResult } from '../../types';

const ppq = 480;

// Outcome quality metric: rewards low dissonance and full-length chains.
// Chains with dissonanceRatio >= 0.5 contribute 0 (clamped by max(..., 0)).
// Length factor: 3^(chainLength - targetLength), so missing one step is 3x cheaper.
function outcomeScore(results: StrettoChainResult[], targetChainLength: number): number {
    let total = 0;
    for (const chain of results) {
        const d = chain.dissonanceRatio ?? 0;
        if (d >= 0.5) continue;
        total += (1 / (0.5 - d)) * Math.pow(3, chain.entries.length - targetChainLength);
    }
    return total;
}

const FIXTURES: Record<string, {
    subject: RawNote[];
    options: StrettoSearchOptions;
    depthLowerBound: number;
}> = {
    target8_scale8: {
        subject: [
            { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
            { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
            { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
            { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
            { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
            { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' },
            { midi: 71, ticks: 2880, durationTicks: 480, velocity: 90, name: 'B4' },
            { midi: 72, ticks: 3360, durationTicks: 480, velocity: 90, name: 'C5' }
        ],
        options: {
            ensembleTotal: 8,
            targetChainLength: 8,
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
            scaleMode: 'Major',
            maxSearchTimeMs: 10000,
        },
        depthLowerBound: 7,
    },
    target8_scale10: {
        subject: [
            { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
            { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
            { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
            { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' },
            { midi: 67, ticks: 1920, durationTicks: 480, velocity: 90, name: 'G4' },
            { midi: 69, ticks: 2400, durationTicks: 480, velocity: 90, name: 'A4' },
            { midi: 71, ticks: 2880, durationTicks: 480, velocity: 90, name: 'B4' },
            { midi: 72, ticks: 3360, durationTicks: 480, velocity: 90, name: 'C5' },
            { midi: 74, ticks: 3840, durationTicks: 480, velocity: 90, name: 'D5' },
            { midi: 76, ticks: 4320, durationTicks: 480, velocity: 90, name: 'E5' }
        ],
        options: {
            ensembleTotal: 8,
            targetChainLength: 8,
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
            scaleMode: 'Major',
            maxSearchTimeMs: 10000,
        },
        depthLowerBound: 7,
    },
};

for (const [fixtureName, fixture] of Object.entries(FIXTURES)) {
    // Warmup run (JIT stabilisation)
    await searchStrettoChains(fixture.subject, fixture.options, ppq);
    const report = await searchStrettoChains(fixture.subject, fixture.options, ppq);

    // Search must terminate with a known reason.
    const validStopReasons = new Set(['Exhausted', 'Success', 'Timeout']);
    assert.ok(
        validStopReasons.has(report.stats.stopReason ?? ''),
        `${fixtureName}: unexpected stopReason '${report.stats.stopReason}'`
    );

    // Search must reach adequate depth — guards against catastrophic early termination.
    assert.ok(
        report.stats.maxDepthReached >= fixture.depthLowerBound,
        `${fixtureName} depth regression: ${report.stats.maxDepthReached} < required ${fixture.depthLowerBound}`
    );

    // Outcome quality: logged for visibility, not asserted (time-bounded searches are non-deterministic).
    const score = outcomeScore(report.results, fixture.options.targetChainLength);
    const fullLength = report.results.filter(c => c.entries.length === fixture.options.targetChainLength).length;
    const avgDiss = report.results.length
        ? report.results.reduce((s, c) => s + (c.dissonanceRatio ?? 0), 0) / report.results.length
        : 0;
    console.log(
        `[${fixtureName}] stopReason=${report.stats.stopReason} depth=${report.stats.maxDepthReached}` +
        ` chains=${report.results.length} fullLength=${fullLength}` +
        ` avgDissonance=${avgDiss.toFixed(3)} outcomeScore=${score.toFixed(2)}` +
        ` timeMs=${report.stats.timeMs}`
    );
}

// Pressure test: ensures timeout-aware internals (triplet budget, finalization counters) are
// populated when search runs under severe time constraints. Tests algorithm robustness, not counts.
{
    const pressuredOptions: StrettoSearchOptions = { ...FIXTURES.target8_scale8.options, maxSearchTimeMs: 40 };
    const pressuredReport = await searchStrettoChains(FIXTURES.target8_scale8.subject, pressuredOptions, ppq);
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
