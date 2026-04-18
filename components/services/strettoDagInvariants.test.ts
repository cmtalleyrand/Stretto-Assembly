import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import { baseOptions, baseSubject, delayStep, ppq, structureSignature, tradTranspositions } from './testFixtures/strettoTraversalFixtures';

const options = {
  ...baseOptions,
  maxSearchTimeMs: 3000
};

const runA = await searchStrettoChains(baseSubject, options, ppq);
const runB = await searchStrettoChains(baseSubject, options, ppq);

delete process.env.STRETTO_DISABLE_VOICE_TRANSITION_PRECOMPUTE;
const optimizedRun = await searchStrettoChains(baseSubject, options, ppq);
process.env.STRETTO_DISABLE_VOICE_TRANSITION_PRECOMPUTE = '1';
const legacyProbeRun = await searchStrettoChains(baseSubject, options, ppq);
delete process.env.STRETTO_DISABLE_VOICE_TRANSITION_PRECOMPUTE;

// Determinism invariant: identical input must produce identical structural output.
const signaturesA = runA.results.map((r) => structureSignature(r.entries));
const signaturesB = runB.results.map((r) => structureSignature(r.entries));
assert.deepEqual(signaturesA, signaturesB, 'DAG traversal output must be deterministic for fixed input/options.');
const optimizedSignatures = optimizedRun.results.map((r) => structureSignature(r.entries));
const legacyProbeSignatures = legacyProbeRun.results.map((r) => structureSignature(r.entries));
assert.deepEqual(
  optimizedSignatures,
  legacyProbeSignatures,
  'Voice-transition probe precompute refactor must preserve accepted chain identities.'
);

const optimizedStageStats = optimizedRun.stats.stageStats;
const legacyProbeStageStats = legacyProbeRun.stats.stageStats;
assert.ok(optimizedStageStats, 'Optimized run must expose stageStats.');
assert.ok(legacyProbeStageStats, 'Legacy-probe run must expose stageStats.');
assert.ok(
  (optimizedStageStats!.voiceTransitionProbeCount ?? 0) < (legacyProbeStageStats!.voiceTransitionProbeCount ?? 0),
  'Optimized voice-transition reachability must perform fewer probe operations than legacy nested loops.'
);

// Structural invariants on each chain: strictly increasing start times, delay quantization,
// and admissible transposition membership.
for (const result of runA.results) {
  for (let i = 0; i < result.entries.length; i += 1) {
    const entry = result.entries[i];
    assert.ok(
      entry.voiceIndex >= 0 && entry.voiceIndex < options.ensembleTotal,
      `voice index must remain in [0, ensembleTotal): ${entry.voiceIndex}`
    );
    assert.ok(tradTranspositions.has(entry.transposition), `transposition must be in traditional admissible set: ${entry.transposition}`);

    if (i > 0) {
      const prev = result.entries[i - 1];
      assert.ok(entry.startBeat > prev.startBeat, 'entry starts must be strictly increasing.');
      const delayTicks = Math.round((entry.startBeat - prev.startBeat) * ppq);
      assert.ok(delayTicks > 0, 'adjacent delay must be positive.');
      assert.equal(delayTicks % delayStep, 0, 'adjacent delay must be quantized to the configured step.');
    }
  }
}

assert.ok(runA.stats.nodesVisited >= 0, 'search must terminate and expose traversal stats.');
assert.ok(runA.stats.maxDepthReached >= 1, 'search must explore at least one depth level.');
assert.ok(['Success', 'Exhausted', 'Timeout', 'NodeLimit', 'MaxResults'].includes(runA.stats.stopReason));

console.log('strettoDagInvariants.test: PASS');
