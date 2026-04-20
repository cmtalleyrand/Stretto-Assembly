import { StrettoCandidate, StrettoListFilterContext } from '../../../types';

export interface BuildAssemblyPromptInput {
  candidates: StrettoCandidate[];
  abcInput: string;
  timeSignature?: { num: number; den: number };
  filterContext?: StrettoListFilterContext | null;
}

export interface AssemblyPromptPayload {
  systemPrompt: string;
  initialInput: string;
  totalEntries: number;
}

function formatFilterContext(filterContext?: StrettoListFilterContext | null): string {
  if (!filterContext) {
    return 'Discovery Filter Context: not provided.';
  }

  return [
    'Discovery Filter Context (hard constraints from user intent):',
    `- Visible candidate subset size: ${filterContext.visibleCount}/${filterContext.totalCount}`,
    `- Selected intervals: ${filterContext.selectedIntervals.length > 0 ? filterContext.selectedIntervals.join(', ') : 'ALL'}`,
    `- Selected delays: ${filterContext.selectedDelays.length > 0 ? filterContext.selectedDelays.join(', ') : 'ALL'}`,
    `- Selected entry pitch classes: ${filterContext.selectedPitches.length > 0 ? filterContext.selectedPitches.join(', ') : 'ALL'}`,
    `- Dissonance cap (%): ${filterContext.maxDissonance}`,
    `- Require resolved ending: ${filterContext.onlyResolved ? 'YES' : 'NO'}`,
    `- Discovery sorting context: ${filterContext.sortKey} (${filterContext.sortDir})`,
    'Constraint: preserve the supplied candidate order exactly; do not introduce unlisted transformations or delays.'
  ].join('\n');
}

export function buildAssemblyPrompt(input: BuildAssemblyPromptInput): AssemblyPromptPayload {
  const totalEntries = input.candidates.length + 1;
  const timeSigStr = input.timeSignature ? `${input.timeSignature.num}/${input.timeSignature.den}` : '4/4';

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

  const candidateList = input.candidates
    .map((candidate, i) => {
      const startBeat = candidate.delayBeats;
      return `Voice ${i + 2}: Transpose ${candidate.intervalLabel}. START BEAT: ${startBeat} (This voice enters ${startBeat} beats after the beginning of the piece).`;
    })
    .join('\n');

  const initialInput = `Subject ABC: ${input.abcInput}

Configuration (Total ${totalEntries} Voices):
Voice 1: Original Subject (P1). START BEAT: 0.
${candidateList}

Generate the ABC now. Ensure simultaneous playback (polyphony) by padding the start of voices with correct rests (z).

${formatFilterContext(input.filterContext)}`;

  return {
    systemPrompt,
    initialInput,
    totalEntries,
  };
}
