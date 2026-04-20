import { RawNote } from '../../../types';
import { AssemblyGateway } from './assemblyGateway';
import {
  AssemblyHeuristicConfig,
  DEFAULT_ASSEMBLY_HEURISTICS,
  verifyAssemblyOutput,
} from './assemblyVerifier';

export type AssemblyPipelineState = 'idle' | 'querying' | 'verifying' | 'complete' | 'error';

export interface AssemblyPipelineCallbacks {
  onStateChange: (state: AssemblyPipelineState) => void;
  onAttempt: (attempt: number) => void;
  onStatus: (status: string) => void;
  onResult: (text: string) => void;
  onLog: (line: string) => void;
}

export interface RunAssemblyPipelineInput {
  gateway: AssemblyGateway;
  model: string;
  systemPrompt: string;
  initialInput: string;
  ppq: number;
  subjectNotes: RawNote[];
  totalEntries: number;
  maxAttempts: number;
  callbacks: AssemblyPipelineCallbacks;
  verificationConfig?: AssemblyHeuristicConfig;
}

export async function runAssemblyPipeline(input: RunAssemblyPipelineInput): Promise<void> {
  const verifierConfig = input.verificationConfig ?? DEFAULT_ASSEMBLY_HEURISTICS;
  let currentInput = input.initialInput;

  input.callbacks.onStateChange('idle');

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    input.callbacks.onAttempt(attempt);
    input.callbacks.onStateChange('querying');
    input.callbacks.onStatus(`Attempt ${attempt}: Querying Gemini...`);

    const response = await input.gateway.generate({
      model: input.model,
      contents: currentInput,
      systemInstruction: input.systemPrompt,
    });

    input.callbacks.onResult(response.text);
    input.callbacks.onStateChange('verifying');
    input.callbacks.onStatus(`Attempt ${attempt}: Verifying counterpoint...`);

    const verification = verifyAssemblyOutput({
      generatedText: response.text,
      ppq: input.ppq,
      subjectNotes: input.subjectNotes,
      totalEntries: input.totalEntries,
      config: verifierConfig,
    });

    if (verification.errors.length === 0 || attempt === input.maxAttempts) {
      input.callbacks.onLog(
        `Pass ${attempt}: ${verification.errors.length === 0 ? 'Verified Successful' : 'Final Attempt Reached'}`,
      );
      input.callbacks.onStateChange('complete');
      input.callbacks.onStatus('Assembly Complete');
      return;
    }

    input.callbacks.onLog(`Pass ${attempt}: Failed verification. Issues: ${verification.errors.join(', ')}`);
    currentInput = `The previous ABC had the following issues: ${verification.errors.join('. ')}. Please correct and try again. Ensure you use the FULL subject for all voices and they OVERLAP in time.\n\nPrevious Output:\n${response.text}`;
  }
}
