import type { StrettoCandidate } from '../../../types';
import type { AssemblyFilterContextPayload } from '../contracts/gateways';

export interface BuildAssemblyPromptInput {
  abcInput: string;
  candidates: StrettoCandidate[];
  timeSignature: { num: number; den: number };
  payload?: AssemblyFilterContextPayload;
}

export interface RetryPromptInput {
  previousOutput: string;
  issues: string[];
}

export interface AssemblyPrompt {
  systemPrompt: string;
  contents: string;
}

export function buildAssemblyPrompt({ abcInput, candidates, timeSignature, payload }: BuildAssemblyPromptInput): AssemblyPrompt {
  const totalEntries = candidates.length + 1;
  const timeSigStr = `${timeSignature.num}/${timeSignature.den}`;
  const systemPrompt = `You are a master of fugal counterpoint. 
Task: Assemble a ${totalEntries}-voice STRETTO (overlapping canon) in ABC notation.

CRITICAL INSTRUCTIONS:
1. **OVERLAP IS MANDATORY**: This is a Stretto. Voices MUST enter while previous voices are still playing. Do NOT chain them sequentially (do not wait for one to finish before starting the next).
2. **ENTRY TIMING**: Adhere strictly to the "Start Beat" specified for each voice. All Start Beats are relative to the beginning of the piece (Beat 0).
3. **FULL SUBJECT**: Where possible, let every voice play the ENTIRE subject duration. Do not truncate early unless necessary for a final cadence.
4. **Original Subject**: Voice 1 is always the Original Subject (P1) starting at Beat 0.
5. **Format**: Use standard ABC notation with multiple voices (V:1, V:2...).
6. **Spacing**: Ensure the "z" (rest) duration at the start of each voice perfectly matches the requested Start Beat.

Output Format:
[ASSEMBLY ORDER]
1. Voice 1: Original Subject at Beat 0
2. Voice 2: [Interval] at Beat [X]
...

[ABC]
X:1
T: Stretto Assembly
M: ${timeSigStr}
L: 1/8
K: C
V:1 name="Subject"
...
`;

  const candidateList = candidates
    .map((candidate, index) => {
      const startBeat = candidate.delayBeats;
      return `Voice ${index + 2}: Transpose ${candidate.intervalLabel}. START BEAT: ${startBeat} (This voice enters ${startBeat} beats after the beginning of the piece).`;
    })
    .join('\n');

  const filterContext = payload?.filterContext;
  const filterContextText = filterContext
    ? [
        'Discovery Filter Context (hard constraints from user intent):',
        `- Visible candidate subset size: ${filterContext.visibleCount}/${filterContext.totalCount}`,
        `- Selected intervals: ${filterContext.selectedIntervals.length > 0 ? filterContext.selectedIntervals.join(', ') : 'ALL'}`,
        `- Selected delays: ${filterContext.selectedDelays.length > 0 ? filterContext.selectedDelays.join(', ') : 'ALL'}`,
        `- Selected entry pitch classes: ${filterContext.selectedPitches.length > 0 ? filterContext.selectedPitches.join(', ') : 'ALL'}`,
        `- Dissonance cap (%): ${filterContext.maxDissonance}`,
        `- Require resolved ending: ${filterContext.onlyResolved ? 'YES' : 'NO'}`,
        `- Discovery sorting context: ${filterContext.sortKey} (${filterContext.sortDir})`,
        'Constraint: preserve the supplied candidate order exactly; do not introduce unlisted transformations or delays.',
      ].join('\n')
    : 'Discovery Filter Context: not provided.';

  return {
    systemPrompt,
    contents: `Subject ABC: ${abcInput}

Configuration (Total ${totalEntries} Voices):
Voice 1: Original Subject (P1). START BEAT: 0.
${candidateList}

Generate the ABC now. Ensure simultaneous playback (polyphony) by padding the start of voices with correct rests (z).

${filterContextText}`,
  };
}

export function buildRetryPrompt({ previousOutput, issues }: RetryPromptInput): string {
  return `The previous ABC had the following issues: ${issues.join('. ')}. Please correct and try again. Ensure you use the FULL subject for all voices and they OVERLAP in time.\n\nPrevious Output:\n${previousOutput}`;
}
