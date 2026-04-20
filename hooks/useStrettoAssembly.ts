import { useState, useCallback } from 'react';
import { StrettoCandidate, RawNote, StrettoListFilterContext } from '../types';
import { buildAssemblyPrompt } from '../components/services/assembly/assemblyPromptBuilder';
import { HttpAssemblyGateway } from '../components/services/assembly/assemblyGateway';
import {
  AssemblyPipelineState,
  runAssemblyPipeline,
} from '../components/services/assembly/assemblyPipeline';
import {
  AssemblyHeuristicConfig,
  DEFAULT_ASSEMBLY_HEURISTICS,
} from '../components/services/assembly/assemblyVerifier';

interface UseStrettoAssemblyProps {
  notes: RawNote[];
  ppq: number;
  ts?: { num: number; den: number };
}

interface AssemblyFilterContextPayload {
  filterContext?: StrettoListFilterContext | null;
}

const gateway = new HttpAssemblyGateway('/api/assembly');

export const useStrettoAssembly = ({ notes: subjectNotes, ppq, ts }: UseStrettoAssemblyProps) => {
  const [isAssembling, setIsAssembling] = useState(false);
  const [assemblyStatus, setAssemblyStatus] = useState<string>('');
  const [assemblyResult, setAssemblyResult] = useState<string>('');
  const [assemblyLog, setAssemblyLog] = useState<string[]>([]);
  const [attemptCount, setAttemptCount] = useState(0);
  const [pipelineState, setPipelineState] = useState<AssemblyPipelineState>('idle');

  const runAssembly = useCallback(
    async (
      candidates: StrettoCandidate[],
      abcInput: string,
      payload?: AssemblyFilterContextPayload,
      verificationConfig: AssemblyHeuristicConfig = DEFAULT_ASSEMBLY_HEURISTICS,
    ) => {
      if (candidates.length === 0) {
        alert('Please select at least one stretto candidate.');
        return;
      }

      setIsAssembling(true);
      setAssemblyLog([]);
      setAttemptCount(1);
      setAssemblyResult('');

      const prompt = buildAssemblyPrompt({
        candidates,
        abcInput,
        timeSignature: ts,
        filterContext: payload?.filterContext,
      });

      try {
        await runAssemblyPipeline({
          gateway,
          model: 'gemini-3-pro-preview',
          systemPrompt: prompt.systemPrompt,
          initialInput: prompt.initialInput,
          ppq,
          subjectNotes,
          totalEntries: prompt.totalEntries,
          maxAttempts: 3,
          verificationConfig,
          callbacks: {
            onStateChange: (state) => {
              setPipelineState(state);
              if (state === 'error') {
                setAssemblyStatus('Error during assembly.');
              }
            },
            onAttempt: setAttemptCount,
            onStatus: setAssemblyStatus,
            onResult: setAssemblyResult,
            onLog: (line) => setAssemblyLog((prev) => [...prev, line]),
          },
        });
      } catch (err) {
        console.error(err);
        setPipelineState('error');
        setAssemblyStatus('Error during assembly.');
        setAssemblyLog((prev) => [...prev, `Error: ${err instanceof Error ? err.message : String(err)}`]);
      } finally {
        setIsAssembling(false);
      }
    },
    [ppq, subjectNotes, ts],
  );

  return {
    isAssembling,
    assemblyStatus,
    assemblyResult,
    assemblyLog,
    attemptCount,
    pipelineState,
    setAssemblyResult,
    runAssembly,
  };
};
