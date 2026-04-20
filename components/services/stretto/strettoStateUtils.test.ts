import assert from 'node:assert/strict';
import { computeDiscoveryDelayBounds, computeMaxDelayAutoBeats } from './delayUtils';
import { deriveInitialPivotSettings } from './pivotInitialization';
import { filterDiscoveryResults } from '../../stretto/hooks/useDiscoveryState';
import { normalizeWorkerProgress } from '../../stretto/hooks/useChainSearchState';
import { RawNote, StrettoCandidate } from '../../../types';

const subject: RawNote[] = [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 64, ticks: 480, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 67, ticks: 960, durationTicks: 480, velocity: 90, name: 'G4' },
];

const autoMax = computeMaxDelayAutoBeats(subject, 480, 4);
assert.equal(autoMax, 2, 'auto max delay should be 2 beats for 3-beat subject with 2/3 cap');

const bounds = computeDiscoveryDelayBounds({
    notes: subject,
    ppq: 480,
    meterDenominator: 4,
    minDelayBeats: 0.5,
    maxDelayBeatsInput: '3',
    stepTicks: 240,
});
assert.equal(bounds.effectiveMinDelayTicks, 240, 'minimum delay should respect step lower bound');
assert.equal(bounds.effectiveMaxDelayTicks, 960, 'maximum delay should clamp to 2/3 subject duration');

const derivedMidi = deriveInitialPivotSettings(subject, 'midi', '');
assert.ok(derivedMidi !== null, 'pivot derivation should produce a setting for non-empty subject');
assert.ok(derivedMidi!.pivotMidi >= 0 && derivedMidi!.pivotMidi <= 127, 'pivot must stay in MIDI range');

const gradeFilter = { STRONG: true, VIABLE: false, INVALID: false } as const;
const candidates = [
    { id: 'a', grade: 'STRONG', dissonanceRatio: 0.1 },
    { id: 'b', grade: 'VIABLE', dissonanceRatio: 0.1 },
    { id: 'c', grade: 'STRONG', dissonanceRatio: 0.6 },
] as unknown as StrettoCandidate[];
const filtered = filterDiscoveryResults(candidates, gradeFilter as any, 0.4);
assert.deepEqual(filtered.map((item) => item.id), ['a'], 'filter should enforce both grade enablement and dissonance threshold');

const normalized = normalizeWorkerProgress({
    ok: true,
    kind: 'progress',
    elapsedMs: 100,
    stage: 'dag',
    completedUnits: 3,
    totalUnits: 10,
    terminal: false,
    telemetry: {
        validPairs: 4,
        validTriplets: 1,
        chainsFound: 2,
        maxDepthReached: 3,
        targetChainLength: 8,
        pairwiseOperationsProcessed: 12,
        tripletOperationsProcessed: 2,
        dagNodesExpanded: 20,
        dagEdgesEvaluated: 50,
        dagExploredWorkItems: undefined,
        dagLiveFrontierWorkItems: undefined,
    },
    heartbeat: true,
});
assert.equal(normalized.telemetry.dagExploredWorkItems, 0, 'undefined explored work items should normalize to zero');
assert.equal(normalized.telemetry.dagLiveFrontierWorkItems, 0, 'undefined live frontier work items should normalize to zero');

console.log('stretto state utility tests passed');
