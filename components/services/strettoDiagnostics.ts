import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import type { RawNote, StrettoSearchOptions } from '../../types';

interface DiagnosticCase {
  name: string;
  options: StrettoSearchOptions;
  expectation: (result: Awaited<ReturnType<typeof searchStrettoChains>>) => void;
  isSlow?: boolean;
}

const SIMPLE_SUBJECT: RawNote[] = [
  { midi: 60, ticks: 0, durationTicks: 480, velocity: 0.9, name: 'C4' },
  { midi: 62, ticks: 480, durationTicks: 480, velocity: 0.9, name: 'D4' },
  { midi: 64, ticks: 960, durationTicks: 480, velocity: 0.9, name: 'E4' },
  { midi: 65, ticks: 1440, durationTicks: 480, velocity: 0.9, name: 'F4' }
];

const BASE_OPTIONS: Omit<StrettoSearchOptions, 'targetChainLength' | 'inversionMode' | 'thirdSixthMode'> = {
  ensembleTotal: 4,
  subjectVoiceIndex: 2,
  truncationMode: 'None',
  truncationTargetBeats: 4,
  useChromaticInversion: false,
  pivotMidi: 60,
  requireConsonantEnd: true,
  disallowComplexExceptions: false,
  maxPairwiseDissonance: 1,
  scaleRoot: 0,
  scaleMode: 'Major'
};

const DIAGNOSTIC_CASES: DiagnosticCase[] = [
  {
    name: 'Baseline reachable target depth succeeds (targetChainLength = 4)',
    options: { ...BASE_OPTIONS, targetChainLength: 4, inversionMode: 1, thirdSixthMode: 1 },
    expectation: (result) => {
      assert.equal(result.stats.stopReason, 'Success');
      assert.ok(result.results.length > 0, 'Expected at least one chain when target depth is modest.');
      assert.ok(result.stats.maxDepthReached >= 4, 'Expected solver to reach target depth 4.');
      assert.ok(result.stats.stageStats, 'Expected stageStats payload to be present.');
      assert.ok(result.stats.stageStats!.pairwiseTotal >= result.stats.stageStats!.pairwiseCompatible, 'Pairwise compatible count cannot exceed total pairwise combinations.');
      assert.ok(result.stats.stageStats!.tripleCandidates >= result.stats.stageStats!.harmonicallyValidTriples, 'Harmonically valid triples cannot exceed triple candidates.');
    }
  },
  {
    name: 'UI default-like request times out before target depth (targetChainLength = 8)',
    options: { ...BASE_OPTIONS, targetChainLength: 8, inversionMode: 1, thirdSixthMode: 1 },
    isSlow: true,
    expectation: (result) => {
      assert.equal(result.stats.stopReason, 'Timeout');
      assert.ok(result.stats.maxDepthReached < 8, 'Expected solver to fail to reach depth 8 before time limit.');
    }
  },
  {
    name: 'Even with reduced branching, structural constraints exhaust before depth 8',
    options: { ...BASE_OPTIONS, targetChainLength: 8, inversionMode: 'None', thirdSixthMode: 'None' },
    expectation: (result) => {
      assert.equal(result.stats.stopReason, 'Exhausted');
      assert.ok(result.stats.maxDepthReached < 8, 'Expected structural delay constraints to cap reachable depth below 8.');
    }
  }
];

async function runDiagnostics() {
  const runSlowDiagnostics = process.env.STRETTO_DIAGNOSTIC_FULL === '1';
  const selectedCases = DIAGNOSTIC_CASES.filter((testCase) => runSlowDiagnostics || !testCase.isSlow);

  console.log('=== STRETTO DIAGNOSTIC SUITE ===');
  console.log(`Running ${selectedCases.length}/${DIAGNOSTIC_CASES.length} cases (full=${runSlowDiagnostics ? 'enabled' : 'disabled'})`);

  for (const testCase of selectedCases) {
    const startedAt = Date.now();
    const result = await searchStrettoChains(SIMPLE_SUBJECT, testCase.options, 480);
    const elapsedMs = Date.now() - startedAt;

    testCase.expectation(result);

    console.log(`PASS: ${testCase.name}`);
    console.log(`  stopReason=${result.stats.stopReason} maxDepth=${result.stats.maxDepthReached} nodes=${result.stats.nodesVisited} results=${result.results.length} elapsedMs=${elapsedMs}`);
    const stats = result.stats as any;
    if (stats.stageStats) {
      console.log(`  stage(pair/triplet/global rejects)=${stats.stageStats.pairStageRejected}/${stats.stageStats.tripletStageRejected}/${stats.stageStats.globalLineageStageRejected}`);
      console.log(`  triplet failures(pairwise/lower/parallel/voice/p4bass)=${stats.stageStats.triplePairwiseRejected}/${stats.stageStats.tripleLowerBoundRejected}/${stats.stageStats.tripleParallelRejected}/${stats.stageStats.tripleVoiceRejected}/${stats.stageStats.tripleP4BassRejected}`);
      console.log(`  compatible pairs=${stats.stageStats.pairwiseCompatible}/${stats.stageStats.pairwiseTotal} harmonicTriples=${stats.stageStats.harmonicallyValidTriples}/${stats.stageStats.tripleCandidates} scans=${stats.stageStats.structuralScanInvocations}`);
    }
    if (stats.coverage) {
      console.log(`  coverage(nodeBudget/completionLowerBound/maxFrontier/classes)=${stats.coverage.nodeBudgetUsedPercent}%/${stats.coverage.completionRatioLowerBound}%/${stats.coverage.maxFrontierSize}/${stats.coverage.maxFrontierClassCount}`);
    }
  }

  console.log('=== DIAGNOSTIC SUITE COMPLETE ===');
}

runDiagnostics().catch((error) => {
  console.error('Diagnostic failure:', error);
  process.exit(1);
});
