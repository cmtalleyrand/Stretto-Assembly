import { parseSimpleAbc } from '../abcBridge';
import {
  extractAbcFromModelText,
  verifyAssembly,
  DEFAULT_ASSEMBLY_VERIFIER_CONFIG,
} from './assemblyVerifier';
import {
  OVERLAPPED_2VOICE_ABC_FIXTURE,
  SEQUENTIAL_2VOICE_ABC_FIXTURE,
  SUBJECT_ABC_FIXTURE,
  TOO_FEW_NOTES_ABC_FIXTURE,
} from './assemblyTestFixtures';

const ppq = 480;
const subjectNotes = parseSimpleAbc(SUBJECT_ABC_FIXTURE, ppq);

const bracketExtracted = extractAbcFromModelText(`Header\n[ABC]\n${OVERLAPPED_2VOICE_ABC_FIXTURE}`);
if (!bracketExtracted.startsWith('X:1')) {
  throw new Error('Bracket extraction fallback must return ABC payload from [ABC] marker.');
}

const xFieldExtracted = extractAbcFromModelText(`Preamble only\n${OVERLAPPED_2VOICE_ABC_FIXTURE}`);
if (!xFieldExtracted.startsWith('X:1')) {
  throw new Error('X-field fallback must return ABC payload from X:1 marker.');
}

const verified = verifyAssembly({
  generatedAbc: OVERLAPPED_2VOICE_ABC_FIXTURE,
  subjectNotes,
  totalEntries: 2,
  ppq,
  config: DEFAULT_ASSEMBLY_VERIFIER_CONFIG,
});
if (!verified.ok) {
  throw new Error(`Expected overlapped fixture to pass verifier, issues=${verified.issues.join('; ')}`);
}

const sequentialRejected = verifyAssembly({
  generatedAbc: SEQUENTIAL_2VOICE_ABC_FIXTURE,
  subjectNotes,
  totalEntries: 2,
  ppq,
  config: { sequentialDurationThresholdRatio: 0.6, noteCountThresholdRatio: 0.3 },
});
if (!sequentialRejected.issues.some((issue) => issue.includes('sequential'))) {
  throw new Error('Expected sequential fixture to trigger sequential-duration rejection.');
}

const sparseRejected = verifyAssembly({
  generatedAbc: TOO_FEW_NOTES_ABC_FIXTURE,
  subjectNotes,
  totalEntries: 2,
  ppq,
  config: { sequentialDurationThresholdRatio: 1.5, noteCountThresholdRatio: 0.9 },
});
if (!sparseRejected.issues.some((issue) => issue.includes('note count'))) {
  throw new Error('Expected sparse fixture to trigger note-count rejection.');
}

console.log('assemblyVerifier parse fallback and verification decision tests passed');
