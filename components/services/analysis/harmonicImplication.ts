/**
 * LEGACY / NOT IN ACTIVE STRETTO-CANON PATH.
 * Active Stretto/Canon execution path lives in:
 * - components/services/strettoGenerator.ts
 * - components/services/canonSearch.ts
 * - components/StrettoView.tsx
 *
 * Modification constraint:
 * - Compatibility-only edits are allowed.
 * - Behavioral or algorithmic changes require an approved migration plan.
 */
import { RawNote, ChordEvent } from '../../../types';
import { getFormattedTime } from '../midiHarmony';
import { getStrictPitchName } from '../midiSpelling';
import { 
    BEAM_WIDTH, HIANote, BeatWindow, ViterbiNode
} from './hia/hiaDefs';
import { calculateBaseSalience } from './hia/hiaWeights';
import { getPhysicalBass, buildVoiceLinks, isSuspension } from './hia/hiaContext';
import { generateCandidates } from './hia/hiaCandidates';
import { scoreCandidate } from './hia/hiaScoring';

/**
 * @warning Legacy entry point; not used in the active Stretto/Canon search path.
 * Modify only for compatibility unless a migration plan is formally approved.
 */
export function detectChordsHIA(notes: RawNote[], ppq: number, tsNum: number, tsDenom: number): ChordEvent[] {
    const sortedNotes = [...notes].sort((a,b) => a.ticks - b.ticks);
    const voiceTracker: Record<number, number> = {};
    
    const hiaNotes: HIANote[] = sortedNotes.map(n => {
        const v = n.voiceIndex ?? 0;
        const prev = voiceTracker[v];
        voiceTracker[v] = n.midi;
        return calculateBaseSalience(n, ppq, tsNum, tsDenom, prev);
    });

    const noteLinks = buildVoiceLinks(hiaNotes); 

    const beats: BeatWindow[] = [];
    const maxTick = Math.max(...hiaNotes.map(n => n.ticks + n.durationTicks));
    const ticksPerBeat = ppq; 
    const totalBeats = Math.ceil(maxTick / ticksPerBeat);

    for (let i = 0; i < totalBeats; i++) {
        const start = i * ticksPerBeat;
        const end = (i + 1) * ticksPerBeat;
        const mid = start + (ticksPerBeat / 2);
        const lookbackLimit = start - (4 * ppq);
        const lookaheadLimit = end + (2 * ticksPerBeat); 
        const active = hiaNotes.filter(n => {
            const noteEnd = n.ticks + n.durationTicks;
            return n.ticks < lookaheadLimit && noteEnd > lookbackLimit;
        });
        beats.push({ index: i, startTick: start, midTick: mid, endTick: end, activeNotes: active });
    }

    let beam: ViterbiNode[] = [{ 
        chord: { root: -1, quality: 'None', intervals: [], bass: -1, baselineQ: 0, name: 'Start' }, 
        score: 0, path: [], assignedNotes: new Set<HIANote>(),
        audit: { 
            tick: 0, formattedTime: '0:0', prevChord: 'None', inputs: [], 
            winner: { name: 'Start', qualityScore: 0, qualityLog: [], evidenceTotal: 0, evidenceBreakdown: [], penaltyTotal: 0, penaltyBreakdown: [], pathScore: 0, stepScore: 0, finalScore: 0 },
            runnersUp: [] 
        },
        _prevNodeIdx: -1
    }];

    for (const beat of beats) {
        const nextBeam: ViterbiNode[] = [];
        const presentRoots = new Set<number>();
        beat.activeNotes.forEach(n => presentRoots.add(n.midi % 12));

        const prevBassMidi = getPhysicalBass(sortedNotes, beat.startTick - 1);
        const currBassMidi = getPhysicalBass(sortedNotes, beat.startTick);
        const suspensionMap = new Map<HIANote, boolean>();
        
        if (beat.activeNotes.length >= 2) {
            beat.activeNotes.forEach(n => {
                const links = noteLinks.get(n) || { prev: null, next: null };
                const isSusp = isSuspension(n, beat.startTick, beat.endTick, prevBassMidi, currBassMidi, links);
                if (isSusp) suspensionMap.set(n, true);
            });
        }

        if (presentRoots.size === 0) {
            nextBeam.push(...beam.map(b => ({
                ...b, 
                score: b.score, 
                path: [...b.path, b], 
                assignedNotes: new Set<HIANote>(),
                audit: { 
                    tick: beat.startTick, 
                    formattedTime: getFormattedTime(beat.startTick, ppq, tsNum, tsDenom),
                    prevChord: b.chord.name,
                    inputs: [],
                    winner: { name: 'Silence', qualityScore: 0, qualityLog: [], evidenceTotal: 0, evidenceBreakdown: [], penaltyTotal: 0, penaltyBreakdown: [], pathScore: b.score, stepScore: 0, finalScore: b.score },
                    runnersUp: []
                },
                _prevNodeIdx: b._prevNodeIdx
            })));
            beam = nextBeam;
            continue;
        }

        const candidates = generateCandidates(presentRoots);
        const candidatesScores: ViterbiNode[] = [];

        beam.forEach((prevNode, prevIdx) => {
            let cutoffTick = -1;
            if (prevNode.assignedNotes.size > 0) {
                const sortedPrev = Array.from(prevNode.assignedNotes).sort((a,b) => {
                    if (a.ticks !== b.ticks) return a.ticks - b.ticks;
                    return (a.ticks + a.durationTicks) - (b.ticks + b.durationTicks);
                });
                const finalNote = sortedPrev[sortedPrev.length - 1];
                cutoffTick = finalNote.ticks + (finalNote.durationTicks / 2);
            }

            for (const cand of candidates) {
                const result = scoreCandidate(
                    cand, 
                    beat.startTick, 
                    beat.endTick, 
                    beat.midTick, 
                    beat.activeNotes, 
                    prevNode, 
                    cutoffTick, 
                    suspensionMap, 
                    ppq, tsNum, tsDenom
                );
                
                // Exclude Invalid Candidates (Missing Root / Missing 7th)
                if (!result.isValid) continue;

                candidatesScores.push({
                    chord: cand, 
                    score: result.finalScore, 
                    path: [...prevNode.path, prevNode],
                    assignedNotes: result.assignedNotes,
                    audit: {
                        tick: beat.startTick,
                        formattedTime: getFormattedTime(beat.startTick, ppq, tsNum, tsDenom),
                        prevChord: prevNode.chord.name,
                        inputs: result.inputsLog,
                        winner: result.auditCandidate,
                        runnersUp: []
                    },
                    _prevNodeIdx: prevIdx
                });
            }
        });

        candidatesScores.sort((a,b) => b.score - a.score);
        const seen = new Set<string>();
        const chosenNodes: ViterbiNode[] = [];

        for (const cs of candidatesScores) {
            if (seen.size >= BEAM_WIDTH) break;
            if (!seen.has(cs.chord.name)) { chosenNodes.push(cs); seen.add(cs.chord.name); }
        }
        
        chosenNodes.forEach(chosen => {
            const siblings = candidatesScores.filter(c => c.chord.name !== chosen.chord.name);
            chosen.audit.runnersUp = siblings.slice(0, 3).map(s => s.audit.winner);
        });

        if (chosenNodes.length === 0) {
             nextBeam.push(...beam.map(b => ({ ...b, path: [...b.path, b] })));
             beam = nextBeam;
        } else {
             beam = chosenNodes;
        }
    }

    const bestFinal = beam[0];
    if (!bestFinal) return [];
    
    const trace = [...bestFinal.path, bestFinal];
    trace.shift(); 

    const events: ChordEvent[] = [];
    
    // NOTE: Removed deduplication logic. 
    // We now output an event for EVERY node in the path (every beat) 
    // so the audit log is complete. 
    // The visual report generator will handle condensing repeated chords.

    trace.forEach((node, i) => {
        const beat = beats[i]; 
        const ticksPerMeasure = ppq * tsNum * (4 / tsDenom);
        const measure = Math.floor(beat.startTick / ticksPerMeasure) + 1;
        const uniqueConst = Array.from(new Set(Array.from(node.assignedNotes).map(n => n.name)));

        const structuredDebug = JSON.stringify(node.audit);
        
        const evt: ChordEvent = {
            timestamp: beat.startTick / ppq, measure, formattedTime: getFormattedTime(beat.startTick, ppq, tsNum, tsDenom),
            name: node.chord.name, root: getStrictPitchName(node.chord.root).replace(/\d/g,''), quality: node.chord.quality,
            bass: getStrictPitchName(node.chord.bass).replace(/\d/g,''), ticks: beat.startTick,
            constituentNotes: uniqueConst, missingNotes: [], alternatives: [], debugInfo: structuredDebug
        };
        events.push(evt);
    });
    return events;
}
