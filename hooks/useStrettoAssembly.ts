import { useState, useCallback } from 'react';
import type { StrettoCandidate, RawNote } from '../types';
import type { AssemblyFilterContextPayload, AssemblyGateway } from '../components/services/contracts/gateways';
import { defaultAssemblyGateway } from '../components/services/gateways/defaultGateways';
import { buildAssemblyPrompt } from '../components/services/assembly/assemblyPromptBuilder';
import { runAssemblyPipeline } from '../components/services/assembly/assemblyPipeline';

export interface UseStrettoAssemblyProps {
  notes: RawNote[];
  ppq: number;
  ts?: { num: number; den: number };
  assemblyGateway?: AssemblyGateway;
}

export const useStrettoAssembly = ({ notes: subjectNotes, ppq, ts, assemblyGateway = defaultAssemblyGateway }: UseStrettoAssemblyProps) => {
  const [isAssembling, setIsAssembling] = useState(false);
  const [assemblyStatus, setAssemblyStatus] = useState<string>('');
  const [assemblyResult, setAssemblyResult] = useState<string>('');
  const [assemblyLog, setAssemblyLog] = useState<string[]>([]);
  const [attemptCount, setAttemptCount] = useState(0);

  const runAssembly = useCallback(
    async (candidates: StrettoCandidate[], abcInput: string, payload?: AssemblyFilterContextPayload) => {
      if (candidates.length === 0) {
        alert('Please select at least one stretto candidate.');
        return;
      }

      setIsAssembling(true);
      setAssemblyLog([]);
      setAttemptCount(1);
      setAssemblyResult('');

      const prompt = buildAssemblyPrompt({
        abcInput,
        candidates,
        timeSignature: ts ?? { num: 4, den: 4 },
        payload,
      });

      try {
        const result = await runAssemblyPipeline({
          assemblyGateway,
          systemPrompt: prompt.systemPrompt,
          initialContents: prompt.contents,
          subjectNotes,
          ppq,
          totalEntries: candidates.length + 1,
        });

        setAssemblyStatus(result.status);
        setAssemblyLog(result.log);
        setAssemblyResult(result.generatedText);
        setAttemptCount(result.attemptCount);
      } catch (err) {
        console.error(err);
        setAssemblyStatus('Error during assembly.');
        setAssemblyLog((prev) => [...prev, `Error: ${err instanceof Error ? err.message : String(err)}`]);
      } finally {
        setIsAssembling(false);
      }
    },
    [assemblyGateway, ppq, subjectNotes, ts]
  );

  return {
    isAssembling,
    assemblyStatus,
    assemblyResult,
    assemblyLog,
    attemptCount,
    setAssemblyResult,
    runAssembly,
  };
};
