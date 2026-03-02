import { 
    ChordCandidate, ViterbiNode, HIANote, AuditInputNote, AuditCandidate, AuditFactor,
    INTERVAL_NAMES, DECAY_PER_QUARTER, 
    PENALTY_MISSING_3RD, PENALTY_MISSING_5TH, BONUS_SEVENTH,
    PENALTY_MISSING_7TH, PENALTY_MISSING_6TH, PENALTY_MISSING_ALTERED_5TH,
    BONUS_ROOT_IN_BASS, PENALTY_THIRD_IN_BASS, PENALTY_FIFTH_IN_BASS, PENALTY_SEVENTH_IN_BASS,
    PENALTY_SUBTRACTION, PENALTY_FLOOR,
    WEIGHT_ROLE_ROOT, WEIGHT_ROLE_3RD, WEIGHT_ROLE_5TH, WEIGHT_ROLE_7TH
} from './hiaDefs';
import { getMetricWeight } from './hiaWeights';
import { getFormattedTime } from '../../midiHarmony';

function getRoleWeight(interval: number): number {
    switch(interval) {
        case 0: return WEIGHT_ROLE_ROOT;
        case 3: case 4: return WEIGHT_ROLE_3RD;
        case 6: case 8: return WEIGHT_ROLE_3RD; 
        case 7: return WEIGHT_ROLE_5TH; 
        case 9: return WEIGHT_ROLE_5TH; 
        case 10: case 11: return WEIGHT_ROLE_7TH;
        default: return 1.0;
    }
}

export function scoreCandidate(
    cand: ChordCandidate,
    beatStartTick: number,
    beatEndTick: number,
    beatMidTick: number,
    activeNotes: HIANote[],
    prevNode: ViterbiNode,
    cutoffTick: number,
    suspensionMap: Map<HIANote, boolean>,
    ppq: number,
    tsNum: number,
    tsDenom: number
): { finalScore: number, stepScore: number, auditCandidate: AuditCandidate, inputsLog: AuditInputNote[], assignedNotes: Set<HIANote>, isValid: boolean } {
    
    // Set Base Quality to 0.9 as requested
    let quality = 0.9;
    const qualityLog: string[] = ["Base 0.9"];
    const assigned = new Set<HIANote>();
    const intervalsPresent = new Set<number>();
    
    let evidenceSum = 0;
    const evidenceLog: AuditFactor[] = [];
    
    let penaltySum = 0;
    const penaltyLog: AuditFactor[] = [];

    const inputsLog: AuditInputNote[] = []; 
    
    const isContinuation = (cand.name === prevNode.chord.name);

    for (const note of activeNotes) {
        const decayVal = (() => {
            const noteEnd = note.ticks + note.durationTicks;
            let distQuarters = 0;
            if (note.ticks >= beatEndTick) distQuarters = (note.ticks - beatEndTick) / ppq; 
            else if (noteEnd < beatMidTick) distQuarters = (beatMidTick - noteEnd) / ppq;
            return Math.max(0, 1 - (DECAY_PER_QUARTER * distQuarters));
        })();
        
        const isSusp = suspensionMap.get(note) || false;

        const auditNote: AuditInputNote = {
            name: note.name,
            midi: note.midi,
            durationQuarters: note.durationTicks / ppq, 
            metricWeight: getMetricWeight(note.ticks, ppq, tsNum, tsDenom),
            approachModifier: note.approachModifier, 
            decay: decayVal,
            finalSalience: note.baseSalience * decayVal,
            isSuspension: isSusp,
            voiceIndex: note.voiceIndex ?? -1,
            onsetFormatted: getFormattedTime(note.ticks, ppq, tsNum, tsDenom) 
        };

        if (!isContinuation && cutoffTick !== -1) {
            const isQuarterOrLonger = note.durationTicks >= ppq;
            if (note.ticks < cutoffTick && !isQuarterOrLonger) {
                let reason = "Exc. (Passing)";
                if (isSusp) reason = "Exc. (Sus)";
                else if (prevNode.chord.root !== -1) {
                        const prevInterval = (note.midi - prevNode.chord.root + 12) % 12;
                        if (prevNode.chord.intervals.includes(prevInterval)) reason = `Exc. (${prevNode.chord.name})`;
                }
                inputsLog.push({ ...auditNote, finalSalience: 0, isExcluded: true, exclusionReason: reason });
                continue; 
            }
        }
        
        const rawSalience = auditNote.finalSalience;
        if (rawSalience <= 0) {
             inputsLog.push(auditNote);
             continue;
        }

        const pc = note.midi % 12;
        const interval = (pc - cand.root + 12) % 12;

        if (cand.intervals.includes(interval)) {
            const roleWeight = getRoleWeight(interval);
            const weightedSalience = rawSalience * roleWeight;
            evidenceSum += weightedSalience;
            intervalsPresent.add(interval);
            assigned.add(note);
            evidenceLog.push({ noteName: note.name, label: `${INTERVAL_NAMES[interval]} (x${roleWeight})`, value: weightedSalience });
            inputsLog.push({ ...auditNote, roleWeight, weightedSalience });
        } else if (!isSusp) {
            const penaltyVal = Math.max(rawSalience - PENALTY_SUBTRACTION, PENALTY_FLOOR);
            penaltySum += penaltyVal; 
            penaltyLog.push({ noteName: note.name, label: "Non-CT", value: penaltyVal });
            inputsLog.push(auditNote);
        } else {
             inputsLog.push(auditNote); 
        }
    }

    let isValid = true;

    // Hard Constraint: Root must be present in evidence (not just assumed)
    if (!intervalsPresent.has(0)) {
        isValid = false;
        qualityLog.push("INVALID: No Root");
    }

    if (!intervalsPresent.has(3) && !intervalsPresent.has(4)) {
            quality -= PENALTY_MISSING_3RD;
            qualityLog.push(`No 3rd (-${PENALTY_MISSING_3RD})`);
    }
    
    const qLower = cand.quality.toLowerCase();
    const isDiminished = qLower.includes('dim') || cand.quality === 'm7b5';
    const isAugmented = qLower.includes('aug');
    const isSeventh = cand.quality.includes('7');
    const isSixth = cand.quality.includes('6');

    if (isDiminished) {
        if (!intervalsPresent.has(6)) {
            quality -= PENALTY_MISSING_ALTERED_5TH;
            qualityLog.push(`No dim5 (-${PENALTY_MISSING_ALTERED_5TH})`);
        }
    } else if (isAugmented) {
        if (!intervalsPresent.has(8)) {
            quality -= PENALTY_MISSING_ALTERED_5TH;
            qualityLog.push(`No aug5 (-${PENALTY_MISSING_ALTERED_5TH})`);
        }
    } else {
        if (!intervalsPresent.has(7)) {
            quality -= PENALTY_MISSING_5TH;
            qualityLog.push(`No 5th (-${PENALTY_MISSING_5TH})`);
        }
    }

    if (isSeventh) {
        let has7th = false;
        if (cand.quality === 'dim7') {
            if (intervalsPresent.has(9)) has7th = true; 
        } else if (intervalsPresent.has(10) || intervalsPresent.has(11)) {
            has7th = true; 
        }

        if (!has7th) {
            // Hard Constraint: 7th chords must have 7ths
            isValid = false;
            qualityLog.push("INVALID: No 7th");
        } else {
            quality += BONUS_SEVENTH;
            qualityLog.push(`7th Pres (+${BONUS_SEVENTH})`);
        }
    }

    if (isSixth) {
        // Hard Constraint: 6th chords must have 6ths (Major 6th = 9 semitones)
        if (!intervalsPresent.has(9)) {
            isValid = false;
            qualityLog.push("INVALID: No 6th");
        } else {
            // We removed the legacy penalty since invalid makes it moot, but conceptually 
            // the check above handles it.
        }
    }

    if (assigned.size > 0) {
        let lowestMidi = Infinity;
        let lowestNote: HIANote | null = null;
        assigned.forEach(n => {
            if (n.midi < lowestMidi) { lowestMidi = n.midi; lowestNote = n; }
        });

        if (lowestNote) {
            const bassInterval = (lowestNote.midi - cand.root + 12) % 12;
            if (bassInterval === 0) {
                quality += BONUS_ROOT_IN_BASS;
                qualityLog.push(`Root Inv (+${BONUS_ROOT_IN_BASS})`);
            }
            else if (bassInterval === 3 || bassInterval === 4) {
                quality -= PENALTY_THIRD_IN_BASS;
                qualityLog.push(`3rd Inv ${lowestNote.name} (-${PENALTY_THIRD_IN_BASS})`);
            }
            else if (bassInterval === 6 || bassInterval === 7 || bassInterval === 8) {
                quality -= PENALTY_FIFTH_IN_BASS;
                qualityLog.push(`5th Inv ${lowestNote.name} (-${PENALTY_FIFTH_IN_BASS})`);
            }
            else if (bassInterval === 9 || bassInterval === 10 || bassInterval === 11) {
                quality -= PENALTY_SEVENTH_IN_BASS;
                qualityLog.push(`7th/6th Inv ${lowestNote.name} (-${PENALTY_SEVENTH_IN_BASS})`);
            }
        }
    }

    // Formula Update: (Evidence * Quality) - Penalty
    // Note: Quality is no longer clamped, so it can be negative.
    const finalStepScore = (evidenceSum * quality) - penaltySum;
    
    // Accumulate total
    const totalScore = prevNode.score + finalStepScore;

    return {
        finalScore: totalScore,
        stepScore: finalStepScore,
        auditCandidate: {
            name: cand.name,
            qualityScore: quality,
            qualityLog,
            evidenceTotal: evidenceSum,
            evidenceBreakdown: evidenceLog,
            penaltyTotal: penaltySum,
            penaltyBreakdown: penaltyLog,
            pathScore: prevNode.score,
            stepScore: finalStepScore,
            finalScore: totalScore
        },
        inputsLog,
        assignedNotes: assigned,
        isValid
    };
}