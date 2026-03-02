

import { RawNote, ChordEvent, HybridVoiceRole, ArpeggioStrategy } from '../../types';
import { identifyChord, getFormattedTime } from './midiHarmony';
import { getQuantizationTickValue } from './midiTransform';

// Weights for note scoring
const WEIGHT_DURATION = 1.0; 
const BONUS_ON_BEAT = 1.5;
const BONUS_STRONG_BEAT = 2.0;
const PENALTY_DECAY_FACTOR = 0.002;

// Chord Structural Scoring
const SCORE_ROOT_THIRD = 100;
const SCORE_STRUCTURAL_EXT = 80; // 7ths, 6ths, Dim5/Aug5
const SCORE_FIFTH = 60;
const SCORE_ADD_ALT = 20;

interface ArpeggioContext {
    ppq: number;
    tsNum: number;
    tsDenom: number;
    mnvTicks: number; 
}

interface CandidateChord {
    tick: number;
    match: any; // Result from identifyChord
    notes: RawNote[];
    score: number;
}

function getBeatStructure(tsNum: number, tsDenom: number): { beatsPerBar: number, beatUnit: number } {
    if (tsDenom === 8 && tsNum % 3 === 0) {
        return { beatsPerBar: tsNum / 3, beatUnit: 3 }; 
    }
    return { beatsPerBar: tsNum, beatUnit: 1 }; 
}

function getNoteScore(note: RawNote, currentTick: number, ctx: ArpeggioContext): number {
    const beats = note.durationTicks / (ctx.ppq * (4 / ctx.tsDenom));
    let score = beats * WEIGHT_DURATION;

    const quarterTicks = ctx.ppq;
    const eighthTicks = ctx.ppq / 2;
    const measureTicks = quarterTicks * 4 * (ctx.tsNum / ctx.tsDenom);
    const measurePos = note.ticks % measureTicks;
    
    let isStrong = false;
    let isOnBeat = false;
    
    if (ctx.tsDenom === 8 && ctx.tsNum % 3 === 0) {
        const beatTicks = eighthTicks * 3;
        if (measurePos % beatTicks < (quarterTicks/16)) isOnBeat = true;
        if (measurePos === 0 || measurePos === (measureTicks/2)) isStrong = true;
    } else {
        const beatTicks = quarterTicks * (4 / ctx.tsDenom);
        if (measurePos % beatTicks < (quarterTicks/16)) isOnBeat = true;
        if (measurePos === 0 || measurePos === (beatTicks * 2)) isStrong = true;
    }

    if (isStrong) score += BONUS_STRONG_BEAT;
    else if (isOnBeat) score += BONUS_ON_BEAT;

    const timeSinceOff = Math.max(0, currentTick - (note.ticks + note.durationTicks));
    if (timeSinceOff > 0) {
        score = score / (1 + (timeSinceOff * PENALTY_DECAY_FACTOR));
    }

    return score;
}

function getRequiredNotes(activeNotes: RawNote[], currentTick: number, ctx: ArpeggioContext): RawNote[] {
    const required: RawNote[] = [];
    const ticksPerBeat = ctx.ppq * (4 / ctx.tsDenom);
    
    const sortedByDur = [...activeNotes].sort((a,b) => b.durationTicks - a.durationTicks);
    if (sortedByDur.length > 0) required.push(sortedByDur[0]); 

    activeNotes.forEach(n => {
        if (required.includes(n)) return;
        const isAttack = n.ticks === currentTick;
        const measurePos = n.ticks % (ticksPerBeat * ctx.tsNum);
        
        const isStrong = (measurePos === 0);
        const isBeat = (measurePos % ticksPerBeat < (ctx.ppq/16));

        if (isAttack) {
            if (isStrong && n.durationTicks > 1.5 * ctx.mnvTicks) {
                required.push(n);
            }
            else if (isBeat && n.durationTicks > 2 * ctx.mnvTicks) {
                required.push(n);
            }
        } else {
            const startPos = n.ticks % (ticksPerBeat * ctx.tsNum);
            const startedOnBeat = (startPos % ticksPerBeat < (ctx.ppq/16));
            if (startedOnBeat) required.push(n);
        }
    });

    return Array.from(new Set(required));
}

function calculateChordStructureScore(match: any): number {
    // 1. Root & Third
    // 2. 7ths, 6ths, Dim5, Aug5
    // 3. 5ths
    // 4. Adds, Alts
    
    let score = 0;
    const q = match.quality;
    const name = match.name;

    // Check Root/Third presence (Implicit in identification usually, but quality tells us structure)
    // Basic Triads or 7ths imply Root+3rd+5th
    if (['Maj', 'Min', '7', 'Maj7', 'm7', 'Dim', 'Aug'].includes(q)) score = SCORE_ROOT_THIRD;
    else if (['m7b5', 'Dim7', 'Aug7', '6', 'm6'].includes(q)) score = SCORE_STRUCTURAL_EXT;
    else if (['5'].includes(q)) score = SCORE_FIFTH;
    else score = SCORE_ADD_ALT; // add9, sus, etc

    // Penalty for missing important notes
    if (match.missingNotes && match.missingNotes.length > 0) {
        score -= 20 * match.missingNotes.length;
    }
    
    return score;
}

export function detectChordsArpeggio(
    notes: RawNote[], 
    ppq: number, 
    tsNum: number, 
    tsDenom: number, 
    mnvTicks: number,
    voiceConfigs: Record<number, HybridVoiceRole>,
    strategy: ArpeggioStrategy,
    historyParam: number | string 
): ChordEvent[] {
    const ctx: ArpeggioContext = { ppq, tsNum, tsDenom, mnvTicks };
    const candidates: CandidateChord[] = [];
    
    // 1. Identify all unique attack points
    const timePoints = Array.from(new Set(notes.map(n => n.ticks))).sort((a,b) => a - b);
    
    const notesByVoice: Record<number, RawNote[]> = {};
    notes.forEach(n => {
        const v = n.voiceIndex ?? 0;
        if (!notesByVoice[v]) notesByVoice[v] = [];
        notesByVoice[v].push(n);
    });

    // --- PHASE A: Generate Candidates (Loop) ---
    timePoints.forEach(t => {
        const activeNotes = notes.filter(n => n.ticks <= t && (n.ticks + n.durationTicks) > t);
        const relevantActive = activeNotes.filter(n => {
            const role = voiceConfigs[n.voiceIndex ?? 0] || 'sustain';
            return role !== 'ignore';
        });

        if (relevantActive.length === 0) return;

        const required = getRequiredNotes(relevantActive, t, ctx);
        const requiredMidis = new Set(required.map(n => n.midi));
        const poolNotes: { note: RawNote, score: number }[] = [];
        
        Object.keys(notesByVoice).forEach(vKey => {
            const v = parseInt(vKey);
            const role = voiceConfigs[v] || 'sustain';
            if (role !== 'arpeggio') return;

            const vNotes = notesByVoice[v].sort((a,b) => a.ticks - b.ticks);
            let poolCandidates: RawNote[] = [];
            
            if (strategy === 'note_based') {
                const count = typeof historyParam === 'number' ? historyParam : 4;
                const past = vNotes.filter(n => n.ticks <= t);
                poolCandidates = past.slice(-count);
            } else {
                const timeStr = typeof historyParam === 'string' ? historyParam : "1/2";
                const lookbackTicks = getQuantizationTickValue(timeStr, ppq);
                const startTime = t - lookbackTicks;
                poolCandidates = vNotes.filter(n => n.ticks >= startTime && n.ticks <= t);
            }

            poolCandidates.forEach(n => {
                if (requiredMidis.has(n.midi)) return;
                const score = getNoteScore(n, t, ctx);
                poolNotes.push({ note: n, score });
            });
        });

        poolNotes.sort((a,b) => b.score - a.score);
        const bestPool = poolNotes.slice(0, 4).map(p => p.note);
        
        const chordNotes = [...required, ...bestPool];
        const uniqueMidis = Array.from(new Set(chordNotes.map(n => n.midi)));

        if (uniqueMidis.length >= 2) {
            const result = identifyChord(uniqueMidis);
            if (result) {
                const { match } = result;
                // Add to candidates list instead of picking immediately
                const structScore = calculateChordStructureScore(match);
                // Total Score = Structural Score + sum(Note Scores) ?
                // For now, prioritize Structural Score heavily
                candidates.push({
                    tick: t,
                    match: match,
                    notes: chordNotes,
                    score: structScore + (chordNotes.length) // tie break with note count
                });
            }
        }
    });

    // --- PHASE B: Greedy Selection (Non-Sequential) ---
    
    // Sort candidates by Score Descending
    candidates.sort((a,b) => b.score - a.score);

    const chords: ChordEvent[] = [];
    const processedTicks = new Set<number>();

    // 1. Pick highest scoring candidates first
    candidates.forEach(cand => {
        // If this tick is already 'explained' by a stronger chord, skip
        // (For point-based events, strict overlap isn't duration based, but we want to avoid 
        // overwriting a strong decision with a weaker one at the exact same time)
        if (processedTicks.has(cand.tick)) return;

        // Add to result
        const measure = Math.floor(cand.tick / (ppq * 4 * (tsNum / tsDenom))) + 1;
        chords.push({
            timestamp: cand.tick / ppq,
            measure,
            formattedTime: getFormattedTime(cand.tick, ppq, tsNum, tsDenom),
            name: cand.match.name,
            root: cand.match.root,
            quality: cand.match.quality,
            bass: cand.match.bass,
            inversion: cand.match.inversion,
            ticks: cand.tick,
            constituentNotes: Array.from(new Set(cand.notes.map(n => n.name))),
            missingNotes: cand.match.missingNotes,
            alternatives: [] 
        });

        processedTicks.add(cand.tick);
    });

    // 2. Sort final list chronologically
    chords.sort((a,b) => a.ticks - b.ticks);

    // 3. Simple Deduplication (if adjacent are identical)
    return chords.filter((c, i) => {
        if (i === 0) return true;
        const prev = chords[i-1];
        return prev.name !== c.name;
    });
}
