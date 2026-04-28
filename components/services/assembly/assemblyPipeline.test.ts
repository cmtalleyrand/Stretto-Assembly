import { runAssemblyPipeline, type AssemblyPipelineState } from './assemblyPipeline';
import { buildAssemblyPrompt } from './assemblyPromptBuilder';
import { parseSimpleAbc } from '../abcBridge';
import { OVERLAPPED_2VOICE_ABC_FIXTURE, SUBJECT_ABC_FIXTURE } from './assemblyTestFixtures';
import type { AssemblyGateway } from '../contracts/gateways';
import type { StrettoCandidate } from '../../../types';

const ppq = 480;
const subjectNotes = parseSimpleAbc(SUBJECT_ABC_FIXTURE, ppq);

const candidates: StrettoCandidate[] = [
  {
    id: 'cand-1',
    intervalSemis: 7,
    intervalLabel: '+P5',
    delayBeats: 2,
    delayTicks: 960,
    grade: 'STRONG',
    errors: [],
    notes: subjectNotes,
    dissonanceRatio: 0,
    pairDissonanceScore: 0,
    endsOnDissonance: false,
  },
];

const prompt = buildAssemblyPrompt({
  abcInput: SUBJECT_ABC_FIXTURE,
  candidates,
  timeSignature: { num: 4, den: 4 },
});

let callCount = 0;
const failingGateway: AssemblyGateway = {
  async assemble() {
    callCount += 1;
    return { text: `Bad output attempt ${callCount}` };
  },
};

const transitions: Array<{ from: AssemblyPipelineState; to: AssemblyPipelineState }> = [];
const failedResult = await runAssemblyPipeline({
  assemblyGateway: failingGateway,
  systemPrompt: prompt.systemPrompt,
  initialContents: prompt.contents,
  subjectNotes,
  ppq,
  totalEntries: 2,
  maxAttempts: 3,
  verifierConfig: { sequentialDurationThresholdRatio: 0.5, noteCountThresholdRatio: 0.95 },
  onTransition: (from, to) => {
    transitions.push({ from, to });
  },
});

if (callCount !== 3) {
  throw new Error(`Retry termination must stop at maxAttempts=3. observed=${callCount}`);
}
if (failedResult.attemptCount !== 3) {
  throw new Error(`Final attemptCount must equal maxAttempts on terminal retry. observed=${failedResult.attemptCount}`);
}
if (failedResult.state !== 'complete') {
  throw new Error(`Final state must be complete after terminal retry. observed=${failedResult.state}`);
}
if (!failedResult.log[2]?.includes('Final Attempt Reached')) {
  throw new Error('Terminal retry must append final attempt log entry.');
}
if (!transitions.some((t) => t.from === 'verifying' && t.to === 'querying')) {
  throw new Error('FSM must transition verifying -> querying between retries.');
}

let successfulCalls = 0;
const successfulGateway: AssemblyGateway = {
  async assemble() {
    successfulCalls += 1;
    return { text: `[ABC]\n${OVERLAPPED_2VOICE_ABC_FIXTURE}` };
  },
};

const successResult = await runAssemblyPipeline({
  assemblyGateway: successfulGateway,
  systemPrompt: prompt.systemPrompt,
  initialContents: prompt.contents,
  subjectNotes,
  ppq,
  totalEntries: 2,
  maxAttempts: 3,
});

if (successfulCalls !== 1) {
  throw new Error(`Successful verification should terminate after a single attempt. observed=${successfulCalls}`);
}
if (successResult.state !== 'complete' || successResult.attemptCount !== 1) {
  throw new Error('Successful verification must transition to complete with attemptCount=1.');
}

console.log('assemblyPipeline retry termination and FSM transition tests passed');
