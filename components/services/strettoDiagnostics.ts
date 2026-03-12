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
    name: 'Baseline request yields coherent stage statistics (targetChainLength = 4)',
    options: { ...BASE_OPTIONS, targetChainLength: 4, inversionMode: 1, thirdSixthMode: 1 },
    expectation: (result) => {
      assert.ok(result.stats.stageStats, 'Expected stageStats payload to be present.');
      assert.ok(result.stats.nodesVisited >= 0, 'Expected non-negative visited node count.');
      assert.ok(result.stats.maxDepthReached >= 0, 'Expected non-negative depth.');
      assert.ok(result.stats.stageStats!.pairwiseTotal >= result.stats.stageStats!.pairwiseCompatible, 'Pairwise compatible count cannot exceed total pairwise combinations.');
      assert.ok(result.stats.stageStats!.tripleCandidates >= result.stats.stageStats!.harmonicallyValidTriples, 'Harmonically valid triples cannot exceed triple candidates.');
      assert.ok(
        result.stats.stageStats!.tripletStageRejected >= result.stats.stageStats!.triplePairwiseRejected + result.stats.stageStats!.tripleLowerBoundRejected,
        'Triplet-stage reject counter must dominate categorized triplet rejection causes.'
      );
      assert.ok(
        result.stats.stageStats!.transitionsReturned >= result.stats.stageStats!.candidateTransitionsEnumerated,
        'Returned transition-window rows must dominate enumerated candidate transitions because each candidate is selected from a returned row set.'
      );
    }
  },
  {
    name: 'Higher target depth preserves transition enumeration accounting (targetChainLength = 8)',
    options: { ...BASE_OPTIONS, targetChainLength: 8, inversionMode: 1, thirdSixthMode: 1 },
    isSlow: true,
    expectation: (result) => {
      assert.ok(result.stats.stageStats, 'Expected stageStats payload to be present.');
      assert.ok(
        result.stats.stageStats!.transitionsReturned >= result.stats.stageStats!.candidateTransitionsEnumerated,
        'Transition-window retrieval count should be at least the candidate-transition enumeration count in deep-search configuration.'
      );
    }
  },
  {
    name: 'Reduced branching still reports coherent triplet rejection accounting',
    options: { ...BASE_OPTIONS, targetChainLength: 8, inversionMode: 'None', thirdSixthMode: 'None' },
    expectation: (result) => {
      assert.ok(result.stats.stageStats, 'Expected stageStats payload to be present.');
      assert.ok(
        result.stats.stageStats!.tripletStageRejected >= result.stats.stageStats!.triplePairwiseRejected + result.stats.stageStats!.tripleLowerBoundRejected,
        'Categorized triplet rejects cannot exceed aggregate triplet-stage reject count.'
      );
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
