import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import { baseOptions, baseSubject, delayStep, ppq, structureSignature } from './testFixtures/strettoTraversalFixtures';

const expectedStopReasons = new Set(['Success', 'Exhausted', 'Timeout']);

async function runFixtureWithStageCapture(): Promise<{
  report: Awaited<ReturnType<typeof searchStrettoChains>>;
  stages: Set<string>;
}> {
  const stages = new Set<string>();
  const report = await searchStrettoChains(
    baseSubject,
    baseOptions,
    ppq,
    (progress) => {
      stages.add(progress.stage);
    }
  );
  return { report, stages };
}

const baselineRun = await runFixtureWithStageCapture();
const repeatRun = await runFixtureWithStageCapture();

assert.ok(expectedStopReasons.has(baselineRun.report.stats.stopReason), `unexpected stopReason ${baselineRun.report.stats.stopReason}`);
assert.ok(baselineRun.report.stats.maxDepthReached >= 1, 'search must advance past depth zero for the baseline fixture.');
assert.ok(baselineRun.report.stats.stageStats, 'stageStats telemetry must be present.');
assert.ok((baselineRun.report.stats.stageStats?.pairwiseTotal ?? 0) >= (baselineRun.report.stats.stageStats?.pairwiseCompatible ?? 0));
assert.ok((baselineRun.report.stats.stageStats?.tripletAcceptedTotal ?? 0) >= 0);
assert.ok(baselineRun.stages.has('pairwise'), 'progress stream must include pairwise stage.');
assert.ok(baselineRun.stages.has('triplet'), 'progress stream must include triplet stage.');
assert.ok(baselineRun.stages.has('dag'), 'progress stream must include dag stage.');

const baselineSignatures = baselineRun.report.results.map((result) => structureSignature(result.entries));
const repeatSignatures = repeatRun.report.results.map((result) => structureSignature(result.entries));
assert.deepEqual(baselineSignatures, repeatSignatures, 'identical inputs must produce deterministic chain ordering.');

for (const result of baselineRun.report.results) {
  for (let i = 1; i < result.entries.length; i++) {
    const previous = result.entries[i - 1];
    const current = result.entries[i];
    assert.ok(current.startBeat > previous.startBeat, 'entry start times must be strictly increasing.');
    const delayTicks = Math.round((current.startBeat - previous.startBeat) * ppq);
    assert.ok(delayTicks > 0 && delayTicks % delayStep === 0, 'inter-entry delay must align to the search delay lattice.');
  }
}

{
  const priorFlag = process.env.STRETTO_ENABLE_ADMISSIBILITY;
  try {
    process.env.STRETTO_ENABLE_ADMISSIBILITY = '1';
    const report = await searchStrettoChains(baseSubject, baseOptions, ppq);
    assert.ok(expectedStopReasons.has(report.stats.stopReason), `admissibility-enabled run produced unexpected stopReason ${report.stats.stopReason}`);
    assert.ok(report.stats.stageStats, 'admissibility-enabled run must retain stage telemetry.');
  } finally {
    if (priorFlag === undefined) {
      delete process.env.STRETTO_ENABLE_ADMISSIBILITY;
    } else {
      process.env.STRETTO_ENABLE_ADMISSIBILITY = priorFlag;
    }
  }
}

console.log('stretto DAG invariants test passed');
