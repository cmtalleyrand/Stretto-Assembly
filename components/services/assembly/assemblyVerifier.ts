import { RawNote } from '../../../types';
import { parseSimpleAbc } from '../abcBridge';

export interface AssemblyHeuristicConfig {
  sequentialDurationRatioThreshold: number;
  minimumNoteCountRatio: number;
}

export interface AssemblyVerificationResult {
  errors: string[];
  generatedNotes: RawNote[];
  extractedAbc: string;
}

export const DEFAULT_ASSEMBLY_HEURISTICS: AssemblyHeuristicConfig = {
  sequentialDurationRatioThreshold: 0.8,
  minimumNoteCountRatio: 0.7,
};

export function extractAbcContent(generatedText: string): string {
  if (generatedText.includes('[ABC]')) {
    return generatedText.split('[ABC]')[1].trim();
  }

  if (generatedText.includes('X:1')) {
    const parts = generatedText.split('X:1');
    return `X:1${parts[1] ?? ''}`;
  }

  return generatedText;
}

function maxTick(notes: RawNote[]): number {
  return notes.reduce((max, note) => Math.max(max, note.ticks + note.durationTicks), 0);
}

export function verifyAssemblyOutput(input: {
  generatedText: string;
  ppq: number;
  subjectNotes: RawNote[];
  totalEntries: number;
  config?: AssemblyHeuristicConfig;
}): AssemblyVerificationResult {
  const config = input.config ?? DEFAULT_ASSEMBLY_HEURISTICS;
  const extractedAbc = extractAbcContent(input.generatedText);
  const generatedNotes = parseSimpleAbc(extractedAbc, input.ppq);
  const errors: string[] = [];

  const subjectDuration = maxTick(input.subjectNotes);
  const generatedDuration = maxTick(generatedNotes);
  const sequentialDuration = subjectDuration * input.totalEntries;

  if (
    input.totalEntries > 1 &&
    generatedDuration > sequentialDuration * config.sequentialDurationRatioThreshold
  ) {
    errors.push('Output appears sequential (too long). Ensure voices overlap.');
  }

  if (generatedNotes.length < input.subjectNotes.length * input.totalEntries * config.minimumNoteCountRatio) {
    errors.push('Output seems truncated (note count too low).');
  }

  return { errors, generatedNotes, extractedAbc };
}
