import { parseSimpleAbc } from '../abcBridge';
import type { RawNote } from '../../../types';

export interface AssemblyVerifierConfig {
  sequentialDurationThresholdRatio: number;
  noteCountThresholdRatio: number;
}

export const DEFAULT_ASSEMBLY_VERIFIER_CONFIG: AssemblyVerifierConfig = {
  sequentialDurationThresholdRatio: 0.8,
  noteCountThresholdRatio: 0.7,
};

export interface AssemblyVerificationInput {
  generatedAbc: string;
  subjectNotes: RawNote[];
  totalEntries: number;
  ppq: number;
  config?: AssemblyVerifierConfig;
}

export interface AssemblyVerificationResult {
  ok: boolean;
  issues: string[];
  generatedNotesCount: number;
}

export function extractAbcFromModelText(generatedText: string): string {
  if (generatedText.includes('[ABC]')) {
    return generatedText.split('[ABC]')[1].trim();
  }

  if (generatedText.includes('X:1')) {
    const parts = generatedText.split('X:1');
    return `X:1${parts[1] ?? ''}`;
  }

  return generatedText;
}

export function verifyAssembly({
  generatedAbc,
  subjectNotes,
  totalEntries,
  ppq,
  config = DEFAULT_ASSEMBLY_VERIFIER_CONFIG,
}: AssemblyVerificationInput): AssemblyVerificationResult {
  const genNotes = parseSimpleAbc(generatedAbc, ppq);
  const issues: string[] = [];

  const subjectDuration = subjectNotes.reduce((max, n) => Math.max(max, n.ticks + n.durationTicks), 0);
  const generatedDuration = genNotes.reduce((max, n) => Math.max(max, n.ticks + n.durationTicks), 0);
  const sequentialDuration = subjectDuration * totalEntries;

  if (totalEntries > 1 && generatedDuration > sequentialDuration * config.sequentialDurationThresholdRatio) {
    issues.push('Output appears sequential (too long). Ensure voices overlap.');
  }

  if (genNotes.length < subjectNotes.length * totalEntries * config.noteCountThresholdRatio) {
    issues.push('Output seems truncated (note count too low).');
  }

  return {
    ok: issues.length === 0,
    issues,
    generatedNotesCount: genNotes.length,
  };
}
