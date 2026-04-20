import assert from 'node:assert/strict';
import { RawNote } from '../../../types';
import { runAssemblyPipeline, AssemblyPipelineState } from './assemblyPipeline';
import { AssemblyGateway } from './assemblyGateway';
import {
  DEFAULT_ASSEMBLY_HEURISTICS,
  extractAbcContent,
  verifyAssemblyOutput,
} from './assemblyVerifier';

class QueueGateway implements AssemblyGateway {
  private index = 0;

  constructor(private readonly responses: string[]) {}

  async generate(): Promise<{ text: string }> {
    const text = this.responses[Math.min(this.index, this.responses.length - 1)] ?? '';
    this.index += 1;
    return { text };
  }
}

function createSubjectFixture(): RawNote[] {
  return [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 100, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 100, name: 'D4' },
  ];
}

function createStateRecorder() {
  const states: AssemblyPipelineState[] = [];
  const logs: string[] = [];

  return {
    states,
    logs,
    callbacks: {
      onStateChange: (state: AssemblyPipelineState) => states.push(state),
      onAttempt: () => undefined,
      onStatus: () => undefined,
      onResult: () => undefined,
      onLog: (line: string) => logs.push(line),
    },
  };
}

async function testRetryTermination() {
  const recorder = createStateRecorder();
  const gateway = new QueueGateway([
    'X:1\nM:4/4\nL:1/8\nK:C\nV:1\nC D|\nV:2\nz8 C D|',
    'X:1\nM:4/4\nL:1/8\nK:C\nV:1\nC D|\nV:2\nz8 C D|',
    'X:1\nM:4/4\nL:1/8\nK:C\nV:1\nC D|\nV:2\nz8 C D|',
  ]);

  await runAssemblyPipeline({
    gateway,
    model: 'fixture-model',
    systemPrompt: 'fixture',
    initialInput: 'fixture',
    ppq: 480,
    subjectNotes: createSubjectFixture(),
    totalEntries: 3,
    maxAttempts: 3,
    callbacks: recorder.callbacks,
    verificationConfig: {
      ...DEFAULT_ASSEMBLY_HEURISTICS,
      sequentialDurationRatioThreshold: 0.1,
      minimumNoteCountRatio: 5,
    },
  });

  assert.equal(
    recorder.states.filter((state) => state === 'querying').length,
    3,
    'pipeline must terminate exactly at maxAttempts when all attempts fail verification',
  );
  assert.equal(recorder.states.at(-1), 'complete');
  assert.match(recorder.logs.at(-1) ?? '', /Final Attempt Reached/);
}

function testParseFallbackExtraction() {
  const abcTagged = 'some text\n[ABC]\nX:1\nK:C\nC D';
  const xPrefixed = 'narrative\nX:1\nK:C\nC D';

  assert.equal(extractAbcContent(abcTagged), 'X:1\nK:C\nC D');
  assert.equal(extractAbcContent(xPrefixed), 'X:1\nK:C\nC D');
}

function testVerifierDecisions() {
  const subject = createSubjectFixture();
  const valid = verifyAssemblyOutput({
    generatedText: 'X:1\nM:4/4\nL:1/8\nK:C\nV:1\nC D|\nV:2\nz2 C D|',
    ppq: 480,
    subjectNotes: subject,
    totalEntries: 2,
    config: {
      sequentialDurationRatioThreshold: 0.95,
      minimumNoteCountRatio: 0.25,
    },
  });

  const invalid = verifyAssemblyOutput({
    generatedText: 'X:1\nM:4/4\nL:1/8\nK:C\nV:1\nC D E F G A B c|',
    ppq: 480,
    subjectNotes: subject,
    totalEntries: 3,
    config: {
      sequentialDurationRatioThreshold: 0.1,
      minimumNoteCountRatio: 3,
    },
  });

  assert.equal(valid.errors.length, 0, 'fixture should satisfy overlap and note-count heuristics');
  assert.equal(invalid.errors.length, 2, 'fixture should violate both overlap and note-count heuristics');
}

async function run() {
  testParseFallbackExtraction();
  testVerifierDecisions();
  await testRetryTermination();
  console.log('assemblyPipeline.test.ts passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
