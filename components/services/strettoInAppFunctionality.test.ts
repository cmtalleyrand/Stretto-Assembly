import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { RawNote, StrettoSearchOptions } from '../../types';
import { parseSimpleAbc } from './abcBridge';
import { searchStrettoChains } from './strettoGenerator';
import StrettoResultsList from '../stretto/StrettoResultsList';

const PPQ = 480;
const DEFAULT_ABC_SUBJECT = "M:4/4\nL:1/4\nQ:120\nK:C\nc2 G c d e f g3 a b c'2";

interface WorkerRequest {
  subject: RawNote[];
  options: StrettoSearchOptions;
  ppq: number;
}

interface WorkerProgressMessage {
  ok: true;
  kind: 'progress';
  heartbeat: boolean;
}

interface WorkerResultMessage {
  ok: true;
  kind: 'result';
  report: Awaited<ReturnType<typeof searchStrettoChains>>;
}

interface WorkerFailureMessage {
  ok: false;
  error: string;
}

type WorkerMessage = WorkerProgressMessage | WorkerResultMessage | WorkerFailureMessage;

function renderResultsMarkup(results: Awaited<ReturnType<typeof searchStrettoChains>>['results']): string {
  return renderToStaticMarkup(
    React.createElement(StrettoResultsList, {
      results,
      selectedId: null,
      onSelect: () => undefined,
      voiceNames: undefined
    })
  );
}

function assertPopulatedResultsMarkup(markup: string, fixtureLabel: string): void {
  assert.ok(
    markup.includes('Chain #1'),
    `${fixtureLabel}: expected non-empty results list render to include at least one chain row label`
  );
  assert.ok(
    !markup.includes('No chains found yet. Run the search to begin.'),
    `${fixtureLabel}: expected populated results render, not empty-state placeholder`
  );
}

async function runSearchThroughWorker(request: WorkerRequest): Promise<{ report: Awaited<ReturnType<typeof searchStrettoChains>>; messages: WorkerMessage[] }> {
  const originalSelf = (globalThis as { self?: unknown }).self;
  const messages: WorkerMessage[] = [];

  const mockSelf = {
    onmessage: null as ((event: { data: WorkerRequest }) => Promise<void>) | null,
    postMessage: (payload: WorkerMessage) => {
      messages.push(payload);
    }
  };

  (globalThis as { self?: typeof mockSelf }).self = mockSelf;

  try {
    await import(`../workers/strettoSearchWorker.ts?testWorkerPath=${Date.now()}`);
    assert.ok(mockSelf.onmessage, 'worker harness: expected worker module to register self.onmessage handler.');
    await mockSelf.onmessage!({ data: request });
  } finally {
    (globalThis as { self?: unknown }).self = originalSelf;
  }

  const failureMessage = messages.find((m) => !m.ok) as WorkerFailureMessage | undefined;
  if (failureMessage) {
    throw new Error(`worker harness failure: ${failureMessage.error}`);
  }

  const resultMessage = messages.find((m) => m.ok && m.kind === 'result') as WorkerResultMessage | undefined;
  assert.ok(resultMessage, 'worker harness: expected terminal result message.');

  return { report: resultMessage.report, messages };
}

const abcSubject = parseSimpleAbc(DEFAULT_ABC_SUBJECT, PPQ);

// A) Baseline in-app path: execute through worker protocol + results rendering.
{
  const options: StrettoSearchOptions = {
    ensembleTotal: 3,
    targetChainLength: 3,
    subjectVoiceIndex: 1,
    truncationMode: 'None',
    truncationTargetBeats: 4,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 0.8,
    scaleRoot: 0,
    scaleMode: 'Major',
    maxSearchTimeMs: 4000,
    meterNumerator: 4,
    meterDenominator: 4
  };

  const { report, messages } = await runSearchThroughWorker({ subject: abcSubject, options, ppq: PPQ });
  assert.ok(report.results.length > 0, 'fixture-A: expected baseline worker search to return at least one chain.');
  assert.ok(messages.some((m) => m.ok && m.kind === 'progress'), 'fixture-A: expected worker to emit progress messages.');

  const markup = renderResultsMarkup(report.results);
  assertPopulatedResultsMarkup(markup, 'fixture-A');
  console.log(`[in-app:fixture-A] stopReason=${report.stats.stopReason} chains=${report.results.length} workerMessages=${messages.length}`);
}

// B) Truncation + inversion + third/sixth constraints enabled.
{
  const options: StrettoSearchOptions = {
    ensembleTotal: 4,
    targetChainLength: 4,
    subjectVoiceIndex: 2,
    truncationMode: 1,
    truncationTargetBeats: 4,
    inversionMode: 1,
    useChromaticInversion: false,
    thirdSixthMode: 1,
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 1.0,
    scaleRoot: 0,
    scaleMode: 'Major',
    maxSearchTimeMs: 8000,
    meterNumerator: 4,
    meterDenominator: 4
  };

  const report = await searchStrettoChains(abcSubject, options, PPQ);
  if (report.results.length === 0) {
    assert.equal(
      report.stats.completionDiagnostics?.scoringValidChainsFound ?? 0,
      0,
      'fixture-B: empty result set is only valid when no scoring-valid chains are finalized.'
    );
  } else {
    const markup = renderResultsMarkup(report.results);
    assertPopulatedResultsMarkup(markup, 'fixture-B');
  }
  console.log(`[in-app:fixture-B] stopReason=${report.stats.stopReason} chains=${report.results.length}`);
}

// C) If full-length chains are unavailable under a constrained topology, longest admissible partials must be surfaced.
{
  const constrainedSubject: RawNote[] = [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' }
  ];

  const options: StrettoSearchOptions = {
    ensembleTotal: 3,
    targetChainLength: 7,
    subjectVoiceIndex: 1,
    truncationMode: 'None',
    truncationTargetBeats: 1,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 0.75,
    maxSearchTimeMs: 4000,
    scaleRoot: 0,
    scaleMode: 'Major'
  };

  const report = await searchStrettoChains(constrainedSubject, options, PPQ);
  const longestReported = report.results.reduce((maxLen, chain) => Math.max(maxLen, chain.entries.length), 0);

  assert.equal(report.stats.stopReason, 'Exhausted', 'fixture-C: expected constrained search to exhaust finite search space.');
  assert.ok(
    report.stats.maxDepthReached < options.targetChainLength,
    `fixture-C: expected maxDepthReached (${report.stats.maxDepthReached}) below targetChainLength (${options.targetChainLength})`
  );
  assert.ok(report.results.length > 0, 'fixture-C: expected fallback reporting to emit longest admissible partial chains.');
  assert.ok(
    longestReported < options.targetChainLength,
    `fixture-C: expected reported longest chain (${longestReported}) to remain below requested target length (${options.targetChainLength})`
  );

  const markup = renderResultsMarkup(report.results);
  assertPopulatedResultsMarkup(markup, 'fixture-C');
  console.log(`[in-app:fixture-C] stopReason=${report.stats.stopReason} chains=${report.results.length} maxDepth=${report.stats.maxDepthReached} longestReported=${longestReported}`);
}

// D) Time budgeting: triplet enumeration is truncated AND desired-depth chains are still returned.
{
  const options: StrettoSearchOptions = {
    ensembleTotal: 4,
    targetChainLength: 4,
    subjectVoiceIndex: 2,
    truncationMode: 'None',
    truncationTargetBeats: 4,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 1.0,
    maxSearchTimeMs: 1200,
    scaleRoot: 0,
    scaleMode: 'Major',
    meterNumerator: 4,
    meterDenominator: 4
  };

  const report = await searchStrettoChains(abcSubject, options, PPQ);
  const longestReported = report.results.reduce((maxLen, chain) => Math.max(maxLen, chain.entries.length), 0);

  assert.ok((report.stats.tripletBudgetMs ?? 0) > 0, 'fixture-D: expected positive triplet budget under bounded runtime.');
  assert.equal(report.stats.tripletEnumerationTruncated, true, 'fixture-D: expected triplet enumeration truncation under bounded runtime.');
  assert.ok(report.results.length > 0, 'fixture-D: expected non-zero chains despite truncated triplet enumeration.');
  assert.equal(
    longestReported,
    options.targetChainLength,
    `fixture-D: expected returned chains to include desired target depth ${options.targetChainLength}, got longest=${longestReported}`
  );

  const markup = renderResultsMarkup(report.results);
  assertPopulatedResultsMarkup(markup, 'fixture-D');

  console.log(`[in-app:fixture-D] stopReason=${report.stats.stopReason} chains=${report.results.length} longestReported=${longestReported} tripletBudgetMs=${report.stats.tripletBudgetMs} truncated=${report.stats.tripletEnumerationTruncated}`);
}


// E) UI-parity fixture (4 voices, target=8, disallow exceptions, max pairwise dissonance 50%).
// On timeout, finalization must surface scoring-valid chains; if full-length valid chains are absent,
// shorter scoring-valid chains must be returned (never invalid fallback chains).
{
  const options: StrettoSearchOptions = {
    ensembleTotal: 4,
    targetChainLength: 8,
    subjectVoiceIndex: 2,
    truncationMode: 'None',
    truncationTargetBeats: 4,
    inversionMode: 'None',
    useChromaticInversion: false,
    thirdSixthMode: 'None',
    pivotMidi: 60,
    requireConsonantEnd: false,
    disallowComplexExceptions: true,
    maxPairwiseDissonance: 0.5,
    maxSearchTimeMs: 12000,
    scaleRoot: 0,
    scaleMode: 'Major',
    meterNumerator: 4,
    meterDenominator: 4
  };

  const report = await searchStrettoChains(abcSubject, options, PPQ);
  assert.ok(
    report.stats.stopReason === 'Timeout' || report.stats.stopReason === 'Success',
    `fixture-E: expected Timeout|Success under bounded budget at target depth 8, got ${report.stats.stopReason}.`
  );
  assert.ok(
    report.stats.maxDepthReached >= Math.min(4, options.targetChainLength),
    `fixture-E: expected traversal depth to reach at least 4 levels, got ${report.stats.maxDepthReached}.`
  );
  assert.ok(report.results.length > 0, 'fixture-E: timeout path must surface scoring-valid chains, including shorter chains when needed.');
  for (const chain of report.results) {
    assert.equal(
      chain.warnings.some((warning) => warning.startsWith('Timeout fallback:')),
      false,
      'fixture-E: timeout path must not emit invalid fallback warning chains.'
    );
    assert.equal(chain.isValid, true, 'fixture-E: timeout path must only emit scoring-valid chains.');
  }
  if (report.stats.maxDepthReached >= options.targetChainLength) {
    assert.ok(
      (report.stats.completionDiagnostics?.structurallyCompleteChainsFound ?? 0) > 0,
      'fixture-E: once target depth is reached, structurally complete chains must be discovered.'
    );
  }

  if (report.results.length > 0) {
    const markup = renderResultsMarkup(report.results);
    assertPopulatedResultsMarkup(markup, 'fixture-E');
  }

  console.log(`[in-app:fixture-E] stopReason=${report.stats.stopReason} chains=${report.results.length} maxDepth=${report.stats.maxDepthReached} structured=${report.stats.completionDiagnostics?.structurallyCompleteChainsFound ?? 0} scoringValid=${report.stats.completionDiagnostics?.scoringValidChainsFound ?? 0}`);
}

console.log('stretto in-app functionality test passed');
