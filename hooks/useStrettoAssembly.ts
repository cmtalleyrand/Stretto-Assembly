
import { useState, useCallback } from 'react';
import { StrettoCandidate, RawNote, StrettoListFilterContext } from '../types';
import { parseSimpleAbc } from '../components/services/abcBridge';

interface UseStrettoAssemblyProps {
    notes: RawNote[];
    ppq: number;
    ts?: { num: number, den: number };
}

interface AssemblyFilterContextPayload {
    filterContext?: StrettoListFilterContext | null;
}

export const useStrettoAssembly = ({ notes: subjectNotes, ppq, ts }: UseStrettoAssemblyProps) => {
    const [isAssembling, setIsAssembling] = useState(false);
    const [assemblyStatus, setAssemblyStatus] = useState<string>('');
    const [assemblyResult, setAssemblyResult] = useState<string>('');
    const [assemblyLog, setAssemblyLog] = useState<string[]>([]);
    const [attemptCount, setAttemptCount] = useState(0);

    const runAssembly = useCallback(async (
        candidates: StrettoCandidate[], 
        abcInput: string,
        payload?: AssemblyFilterContextPayload
    ) => {
        if (candidates.length === 0) {
            alert("Please select at least one stretto candidate.");
            return;
        }

        setIsAssembling(true);
        setAssemblyLog([]);
        setAttemptCount(1);
        setAssemblyResult('');
        
        const totalEntries = candidates.length + 1; // Candidates + Original Subject
        const timeSigStr = ts ? `${ts.num}/${ts.den}` : '4/4';

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

        // Explicitly defining absolute start times for the LLM
        const candidateList = candidates.map((r, i) => {
            const startBeat = r.delayBeats;
            return `Voice ${i+2}: Transpose ${r.intervalLabel}. START BEAT: ${startBeat} (This voice enters ${startBeat} beats after the beginning of the piece).`;
        }).join('\n');

        const filterContext = payload?.filterContext;
        const filterContextText = filterContext ? [
            'Discovery Filter Context (hard constraints from user intent):',
            `- Visible candidate subset size: ${filterContext.visibleCount}/${filterContext.totalCount}`,
            `- Selected intervals: ${filterContext.selectedIntervals.length > 0 ? filterContext.selectedIntervals.join(', ') : 'ALL'}`,
            `- Selected delays: ${filterContext.selectedDelays.length > 0 ? filterContext.selectedDelays.join(', ') : 'ALL'}`,
            `- Selected entry pitch classes: ${filterContext.selectedPitches.length > 0 ? filterContext.selectedPitches.join(', ') : 'ALL'}`,
            `- Dissonance cap (%): ${filterContext.maxDissonance}`,
            `- Require resolved ending: ${filterContext.onlyResolved ? 'YES' : 'NO'}`,
            `- Discovery sorting context: ${filterContext.sortKey} (${filterContext.sortDir})`,
            'Constraint: preserve the supplied candidate order exactly; do not introduce unlisted transformations or delays.'
        ].join('\n') : 'Discovery Filter Context: not provided.';
        
        let currentInput = `Subject ABC: ${abcInput}

Configuration (Total ${totalEntries} Voices):
Voice 1: Original Subject (P1). START BEAT: 0.
${candidateList}

Generate the ABC now. Ensure simultaneous playback (polyphony) by padding the start of voices with correct rests (z).

${filterContextText}`;

        try {
            for (let i = 1; i <= 3; i++) {
                setAttemptCount(i);
                setAssemblyStatus(`Attempt ${i}: Querying Gemini...`);
                
                const response = await fetch('/api/assembly', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gemini-3-pro-preview',
                        contents: currentInput,
                        systemInstruction: systemPrompt
                    })
                });

                if (!response.ok) {
                    const errorPayload = await response.json().catch(() => ({}));
                    const errorMessage = typeof errorPayload.error === 'string' ? errorPayload.error : `Proxy request failed with status ${response.status}.`;
                    throw new Error(errorMessage);
                }

                const responseBody = await response.json() as { text?: string };
                const generatedText = responseBody.text || '';
                
                // Extract ABC part if mixed with text
                let abcContent = generatedText;
                if (generatedText.includes('[ABC]')) {
                    abcContent = generatedText.split('[ABC]')[1].trim();
                } else if (generatedText.includes('X:1')) {
                    const parts = generatedText.split('X:1');
                    abcContent = 'X:1' + parts[1];
                }

                setAssemblyResult(generatedText); // Save full text to show Order + ABC
                setAssemblyStatus(`Attempt ${i}: Verifying counterpoint...`);

                // Algorithmic Verification (Basic Parse Check)
                const genNotes = parseSimpleAbc(abcContent, ppq);
                const errors: string[] = [];
                
                // Verification: Check if it looks polyphonic (short overall duration relative to sum of parts)
                const subjectDuration = subjectNotes.reduce((max, n) => Math.max(max, n.ticks + n.durationTicks), 0);
                const generatedDuration = genNotes.reduce((max, n) => Math.max(max, n.ticks + n.durationTicks), 0);
                const sequentialDuration = subjectDuration * totalEntries;
                
                // If the generated duration is close to sequentialDuration, it failed to overlap
                if (generatedDuration > sequentialDuration * 0.8 && totalEntries > 1) {
                    errors.push("Output appears sequential (too long). Ensure voices overlap.");
                }

                if (genNotes.length < subjectNotes.length * totalEntries * 0.7) {
                    errors.push("Output seems truncated (note count too low).");
                }

                if (errors.length === 0 || i === 3) {
                    setAssemblyLog(prev => [...prev, `Pass ${i}: ${errors.length === 0 ? "Verified Successful" : "Final Attempt Reached"}`]);
                    setAssemblyStatus('Assembly Complete');
                    break;
                } else {
                    setAssemblyLog(prev => [...prev, `Pass ${i}: Failed verification. Issues: ${errors.join(', ')}`]);
                    currentInput = `The previous ABC had the following issues: ${errors.join('. ')}. Please correct and try again. Ensure you use the FULL subject for all voices and they OVERLAP in time.\n\nPrevious Output:\n${generatedText}`;
                }
            }
        } catch (err) {
            console.error(err);
            setAssemblyStatus('Error during assembly.');
            setAssemblyLog(prev => [...prev, `Error: ${err instanceof Error ? err.message : String(err)}`]);
        } finally {
            setIsAssembling(false);
        }
    }, [ppq, subjectNotes, ts]);

    return {
        isAssembling,
        assemblyStatus,
        assemblyResult,
        assemblyLog,
        attemptCount,
        setAssemblyResult,
        runAssembly
    };
};
