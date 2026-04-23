import assert from 'node:assert/strict';
import { INTERVALS } from './strettoConstants';
import { searchStrettoChains } from './strettoGenerator';
import {
  baseOptions,
  baseSubject,
  delayStep,
  normalizeChainSignatureSet,
  ppq,
  structureSignature,
  thirdSixthTranspositions,
  tradTranspositions,
  traversalFixtures
} from './testFixtures/strettoTraversalFixtures';

const reportA = await searchStrettoChains(baseSubject, baseOptions, ppq);
const reportB = await searchStrettoChains(baseSubject, baseOptions, ppq);
const timeoutNearCompletionReport = await searchStrettoChains(baseSubject, { ...baseOptions, maxSearchTimeMs: 1 }, ppq);

const signaturesA = reportA.results.map((r) => structureSignature(r.entries));
const signaturesB = reportB.results.map((r) => structureSignature(r.entries));
assert.deepEqual(signaturesA, signaturesB, 'DAG traversal ordering must be deterministic for identical input.');

for (const result of reportA.results) {
  for (let i = 0; i < result.entries.length; i++) {
    const entry = result.entries[i];
    assert.ok(entry.voiceIndex >= 0 && entry.voiceIndex < baseOptions.ensembleTotal);
    if (i > 0) {
      const prev = result.entries[i - 1];
      assert.ok(entry.startBeat > prev.startBeat);
      const delayTicks = Math.round((entry.startBeat - prev.startBeat) * ppq);
      assert.ok(delayTicks > 0 && delayTicks % delayStep === 0);
    }
    assert.ok(tradTranspositions.has(entry.transposition));
  }
}

assert.ok(['Success', 'Exhausted', 'Timeout', 'MaxResults'].includes(reportA.stats.stopReason));
assert.ok(reportA.stats.maxDepthReached >= 1);
assert.notEqual(timeoutNearCompletionReport.stats.maxDepthReached >= baseOptions.targetChainLength && timeoutNearCompletionReport.results.length === 0, true);

process.env.STRETTO_DISABLE_PREFIX_ADMISSIBILITY = '1';
const noPrefixPruningReport = await searchStrettoChains(baseSubject, baseOptions, ppq);
delete process.env.STRETTO_DISABLE_PREFIX_ADMISSIBILITY;
const maxScoringValidDepthWithPruning = reportA.results.reduce((max, result) => Math.max(max, result.entries.length), 0);
const maxScoringValidDepthWithoutPruning = noPrefixPruningReport.results.reduce((max, result) => Math.max(max, result.entries.length), 0);
assert.ok(
  reportA.stats.stageStats!.prunedByPrefixAdmissibility >= 0,
  'prefix-pruning telemetry must be exposed in stageStats.'
);
assert.ok(
  reportA.stats.nodesVisited <= noPrefixPruningReport.stats.nodesVisited,
  'enabling prefix admissibility pruning must not increase expanded traversal volume for the fixed fixture.'
);
assert.ok(
  maxScoringValidDepthWithPruning >= maxScoringValidDepthWithoutPruning,
  'prefix admissibility pruning must preserve or improve maximum scoring-valid depth.'
);

const transformConstrainedOptions = {
  ...baseOptions,
  subjectVoiceIndex: 0,
  inversionMode: 'Unlimited' as const,
  truncationMode: 'Unlimited' as const,
  truncationTargetBeats: 2,
  thirdSixthMode: 'Unlimited' as const,
  useChromaticInversion: true,
  maxPairwiseDissonance: 0.5,
  targetChainLength: 4
};
const transformAdmissibleTranspositions = new Set<number>([
  ...Array.from(INTERVALS.TRAD_TRANSPOSITIONS),
  ...Array.from(INTERVALS.THIRD_SIXTH_TRANSPOSITIONS)
]);

const transformConstrainedReport = await searchStrettoChains(baseSubject, transformConstrainedOptions, ppq);
if (transformConstrainedReport.results.length === 0) {
  console.warn('[transform-adjacency] no candidates produced; invariants skipped for this fixture');
}

for (const result of transformConstrainedReport.results) {
  for (let i = 1; i < result.entries.length; i++) {
    const prev = result.entries[i - 1];
    const curr = result.entries[i];

    assert.notEqual(prev.type === 'I' && curr.type === 'I', true);

    const prevIsTruncated = prev.length < ppq * 4;
    const currIsTruncated = curr.length < ppq * 4;
    assert.notEqual((prev.type === 'I' || prevIsTruncated) && (curr.type === 'I' || currIsTruncated), true);

    assert.ok(transformAdmissibleTranspositions.has(curr.transposition));
    assert.ok(Math.abs(curr.transposition - prev.transposition) >= 5);

    if (i >= 2) {
      const prevPrev = result.entries[i - 2];
      const prevDelay = prev.startBeat - prevPrev.startBeat;
      const currDelay = curr.startBeat - prev.startBeat;
      const subjectLengthBeats = prev.length / ppq;

      if (prevDelay >= subjectLengthBeats / 2 || currDelay >= subjectLengthBeats / 2) {
        assert.ok(currDelay < prevDelay);
      }

      assert.ok(prevDelay - currDelay <= subjectLengthBeats / 4);
    }
  }
}

for (const fixture of traversalFixtures) {
  const report = await searchStrettoChains(fixture.subject, fixture.options, ppq);

  assert.ok(report.stats.nodesVisited >= 0, `search must complete without error for fixture ${fixture.name}`);

  const useThirdSixth = fixture.options.thirdSixthMode !== 'None';
  const validTranspositionsForFixture = useThirdSixth
    ? new Set([...tradTranspositions, ...thirdSixthTranspositions])
    : tradTranspositions;

  for (const result of report.results) {
    for (let i = 0; i < result.entries.length; i++) {
      const entry = result.entries[i];
      assert.ok(entry.voiceIndex >= 0 && entry.voiceIndex < fixture.options.ensembleTotal);
      if (i > 0) {
        const prev = result.entries[i - 1];
        assert.ok(entry.startBeat > prev.startBeat);
        const delayTicks = Math.round((entry.startBeat - prev.startBeat) * ppq);
        assert.ok(delayTicks > 0 && delayTicks % delayStep === 0);
      }
      assert.ok(validTranspositionsForFixture.has(entry.transposition));
    }
  }

  const signatures = normalizeChainSignatureSet(report);
  const coverage = report.stats.coverage;
  if (coverage) {
    assert.equal(coverage.nodeBudgetUsedPercent, null);
    assert.ok(coverage.exploredWorkItems >= 0);
    assert.ok(coverage.liveFrontierWorkItems >= 0);
    assert.ok(coverage.completionLowerBound == null || (coverage.completionLowerBound >= 0 && coverage.completionLowerBound <= 1));
    if (coverage.completionLowerBound != null) {
      const expected = coverage.exploredWorkItems / Math.max(1, coverage.exploredWorkItems + coverage.liveFrontierWorkItems);
      assert.ok(Math.abs(coverage.completionLowerBound - expected) < 1e-12);
    }
  }

  console.log(`[traversal:${fixture.name}] stopReason=${report.stats.stopReason} nodes=${report.stats.nodesVisited} maxDepth=${report.stats.maxDepthReached} chains=${signatures.size}`);
}

console.log('stretto heavy traversal fixtures passed');
