import assert from 'node:assert/strict';
import { searchStrettoChains } from './strettoGenerator';
import { baseOptions, baseSubject, ppq, structureSignature } from './testFixtures/strettoTraversalFixtures';

const mapReport = await searchStrettoChains(baseSubject, baseOptions, ppq, undefined, { backend: 'map' });
const denseReport = await searchStrettoChains(baseSubject, baseOptions, ppq, undefined, { backend: 'dense' });

const mapSignatures = mapReport.results.map((result) => structureSignature(result.entries));
const denseSignatures = denseReport.results.map((result) => structureSignature(result.entries));

assert.deepEqual(
  denseSignatures,
  mapSignatures,
  'dense precompute backend must preserve result ordering and membership relative to map backend.'
);

const mapStage = mapReport.stats.stageStats;
const denseStage = denseReport.stats.stageStats;
assert.ok(mapStage && denseStage, 'both backend runs must expose stageStats telemetry.');
assert.equal(
  denseStage?.pairwiseCompatible,
  mapStage?.pairwiseCompatible,
  'pairwise compatibility cardinality must match across precompute backends.'
);
assert.equal(
  denseStage?.harmonicallyValidTriples,
  mapStage?.harmonicallyValidTriples,
  'triplet compatibility cardinality must match across precompute backends.'
);

console.log('stretto precompute backend regression test passed');
