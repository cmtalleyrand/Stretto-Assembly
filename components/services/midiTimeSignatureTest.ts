import assert from 'node:assert/strict';
import { resolveMidiTimeSignatureAtTick } from './midiTimeSignature';

const events = [
  { ticks: 960, timeSignature: [3, 4] },
  { ticks: 0, timeSignature: [4, 4] },
  { ticks: 1920, timeSignature: [5, 8] },
];

assert.deepEqual(
  resolveMidiTimeSignatureAtTick(events, 0),
  [4, 4],
  'At tick 0, resolver must return the active initial meter.'
);

assert.deepEqual(
  resolveMidiTimeSignatureAtTick(events, 1200),
  [3, 4],
  'Resolver must select the latest event at or before the query tick after sorting by tick.'
);

assert.deepEqual(
  resolveMidiTimeSignatureAtTick(events, 2400),
  [5, 8],
  'Resolver must track later meter changes when query tick crosses their onset.'
);

assert.deepEqual(
  resolveMidiTimeSignatureAtTick([{ ticks: 0, timeSignature: [0, 4] }], 0),
  [4, 4],
  'Invalid meter payloads must fall back to 4/4.'
);

assert.deepEqual(
  resolveMidiTimeSignatureAtTick(undefined, 0),
  [4, 4],
  'Missing time-signature metadata must fall back to 4/4.'
);

console.log('midiTimeSignatureTest passed');
