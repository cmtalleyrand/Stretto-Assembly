import type { AssemblyGateway } from '../contracts/gateways';
import type { RawNote } from '../../../types';
import { buildRetryPrompt } from './assemblyPromptBuilder';
import { extractAbcFromModelText, verifyAssembly, type AssemblyVerifierConfig } from './assemblyVerifier';

export type AssemblyPipelineState = 'idle' | 'querying' | 'verifying' | 'complete' | 'error';

const VALID_TRANSITIONS: Readonly<Record<AssemblyPipelineState, ReadonlySet<AssemblyPipelineState>>> = {
  idle: new Set(['querying']),
  querying: new Set(['verifying', 'error']),
  verifying: new Set(['querying', 'complete', 'error']),
  complete: new Set(),
  error: new Set(),
};

export interface AssemblyPipelineInput {
  assemblyGateway: AssemblyGateway;
  systemPrompt: string;
  initialContents: string;
  subjectNotes: RawNote[];
  ppq: number;
  totalEntries: number;
  maxAttempts?: number;
  verifierConfig?: AssemblyVerifierConfig;
  onTransition?: (from: AssemblyPipelineState, to: AssemblyPipelineState) => void;
}

export interface AssemblyPipelineResult {
  state: Extract<AssemblyPipelineState, 'complete' | 'error'>;
  attemptCount: number;
  generatedText: string;
  log: string[];
  status: string;
}

function transitionState(
  from: AssemblyPipelineState,
  to: AssemblyPipelineState,
  onTransition?: (from: AssemblyPipelineState, to: AssemblyPipelineState) => void
): AssemblyPipelineState {
  if (!VALID_TRANSITIONS[from].has(to)) {
    throw new Error(`Invalid assembly pipeline transition: ${from} -> ${to}`);
  }
  onTransition?.(from, to);
  return to;
}

export async function runAssemblyPipeline({
  assemblyGateway,
  systemPrompt,
  initialContents,
  subjectNotes,
  ppq,
  totalEntries,
  maxAttempts = 3,
  verifierConfig,
  onTransition,
}: AssemblyPipelineInput): Promise<AssemblyPipelineResult> {
  let state: AssemblyPipelineState = 'idle';
  const log: string[] = [];
  let contents = initialContents;
  let generatedText = '';

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (state !== 'querying') {
        state = transitionState(state, 'querying', onTransition);
      }

      const responseBody = await assemblyGateway.assemble({
        model: 'gemini-3-pro-preview',
        contents,
        systemInstruction: systemPrompt,
      });

      generatedText = responseBody.text || '';
      const generatedAbc = extractAbcFromModelText(generatedText);

      state = transitionState(state, 'verifying', onTransition);
      const verification = verifyAssembly({
        generatedAbc,
        subjectNotes,
        totalEntries,
        ppq,
        config: verifierConfig,
      });

      if (verification.ok) {
        state = transitionState(state, 'complete', onTransition);
        log.push(`Pass ${attempt}: Verified Successful`);
        return {
          state: 'complete',
          attemptCount: attempt,
          generatedText,
          log,
          status: 'Assembly Complete',
        };
      }

      if (attempt === maxAttempts) {
        state = transitionState(state, 'complete', onTransition);
        log.push(`Pass ${attempt}: Final Attempt Reached`);
        return {
          state: 'complete',
          attemptCount: attempt,
          generatedText,
          log,
          status: 'Assembly Complete',
        };
      }

      log.push(`Pass ${attempt}: Failed verification. Issues: ${verification.issues.join(', ')}`);
      contents = buildRetryPrompt({
        previousOutput: generatedText,
        issues: verification.issues,
      });
      state = transitionState(state, 'querying', onTransition);
    }
  } catch (error) {
    state = transitionState(state, 'error', onTransition);
    const errorText = error instanceof Error ? error.message : String(error);
    log.push(`Error: ${errorText}`);

    return {
      state: 'error',
      attemptCount: 0,
      generatedText,
      log,
      status: 'Error during assembly.',
    };
  }

  return {
    state: 'error',
    attemptCount: 0,
    generatedText,
    log,
    status: 'Error during assembly.',
  };
}
