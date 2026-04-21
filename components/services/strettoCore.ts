
import { RawNote, StrettoCandidate, StrettoError, StrettoGrade, HarmonicRegion, NoteRole } from '../../types';
import { getFormattedTime } from './midiHarmony';
import { getStrictPitchName, getIntervalLabel, getPitchName } from './midiSpelling';
import { CHORD_SHAPES, CONSONANT_QUALITIES, SCALE_INTERVALS } from './strettoConstants';
import { isStrongBeat } from './metric/beatStrength';

const DISSONANT_INTERVALS = [1, 2, 6, 10, 11]; // m2, M2, TT, m7, M7
const PERFECT_CONSONANCES = [0, 7]; // P1, P5

export interface VoiceEvent {
    tick: number;
    endTick: number; 
    pitch1: number;
    pitch2: number;
    hasAttack1: boolean;
    hasAttack2: boolean;
}

// --- Shared Inversion Logic ---

function getScaleDegree(pitch: number, root: number, intervals: number[]): { octave: number, degree: number, chromaticOffset: number } | null {
    const semitone = (pitch - root + 1200) % 12; 
    let bestDegree = -1;
    let minErr = 99;
    
    intervals.forEach((s, i) => {
        const err = Math.abs(s - semitone);
        if (err < minErr) { minErr = err; bestDegree = i; }
    });
    
    const relPitch = pitch - root;
    const oct = Math.floor(relPitch / 12);
    const basePitch = root + oct * 12 + intervals[bestDegree];
    const chromaticOffset = pitch - basePitch;
    return { octave: oct, degree: bestDegree, chromaticOffset };
}

function getPitchFromDegree(octave: number, degree: number, root: number, intervals: number[]): number {
    const normalizedDegree = (degree % 7 + 7) % 7;
    const octaveShift = Math.floor(degree / 7);
    const semi = intervals[normalizedDegree];
    return root + (octave + octaveShift) * 12 + semi;
}

function floorDiv(numerator: number, denominator: number): number {
    return Math.floor(numerator / denominator);
}

function getChromaticSemitones(intervals: number[]): number[] {
    const diatonicSet = new Set(intervals.map(v => ((v % 12) + 12) % 12));
    const chromatic: number[] = [];
    for (let semitone = 0; semitone < 12; semitone += 1) {
        if (!diatonicSet.has(semitone)) chromatic.push(semitone);
    }
    return chromatic;
}

function getChromaticGlobalIndex(pitch: number, root: number, chromaticSemitones: number[]): number | null {
    const rel = pitch - root;
    const semitone = ((rel % 12) + 12) % 12;
    const rank = chromaticSemitones.indexOf(semitone);
    if (rank < 0) return null;
    const octave = floorDiv(rel, 12);
    return octave * chromaticSemitones.length + rank;
}

function getPitchFromChromaticGlobalIndex(globalIndex: number, root: number, chromaticSemitones: number[]): number {
    const rankCount = chromaticSemitones.length;
    const octave = floorDiv(globalIndex, rankCount);
    const rank = ((globalIndex % rankCount) + rankCount) % rankCount;
    return root + octave * 12 + chromaticSemitones[rank];
}

function getChromaticMirrorAxis(pivot: number, root: number, chromaticSemitones: number[]): number {
    const rel = pivot - root;
    const pivotSemitone = ((rel % 12) + 12) % 12;
    const pivotOctave = floorDiv(rel, 12);
    const exactRank = chromaticSemitones.indexOf(pivotSemitone);
    if (exactRank >= 0) {
        return pivotOctave * chromaticSemitones.length + exactRank;
    }

    const rankCount = chromaticSemitones.length;
    const upperRank = chromaticSemitones.findIndex(semitone => semitone > pivotSemitone);
    const normalizedUpperRank = upperRank >= 0 ? upperRank : 0;
    const upperOctave = upperRank >= 0 ? pivotOctave : pivotOctave + 1;
    const lowerRank = upperRank >= 0 ? upperRank - 1 : rankCount - 1;
    const lowerOctave = upperRank >= 0 ? pivotOctave : pivotOctave;

    const lowerGlobal = lowerOctave * rankCount + lowerRank;
    const upperGlobal = upperOctave * rankCount + normalizedUpperRank;
    return (lowerGlobal + upperGlobal) / 2;
}

/**
 * Calculates a strictly inverted pitch based on a pivot, root, and scale mode.
 * Used by both Generator and UI to ensure 1:1 consistency.
 */
export function getInvertedPitch(pitch: number, pivot: number, scaleRoot: number, scaleMode: string, useChromatic: boolean): number {
    if (useChromatic) {
        return pivot - (pitch - pivot);
    }

    const intervals = SCALE_INTERVALS[scaleMode] || SCALE_INTERVALS['Major'];
    const chromaticSemitones = getChromaticSemitones(intervals);

    const chromaticPitchIndex = getChromaticGlobalIndex(pitch, scaleRoot, chromaticSemitones);
    if (chromaticPitchIndex !== null) {
        const chromaticMirrorAxis = getChromaticMirrorAxis(pivot, scaleRoot, chromaticSemitones);
        const mirroredChromaticIndex = Math.round(2 * chromaticMirrorAxis - chromaticPitchIndex);
        return getPitchFromChromaticGlobalIndex(mirroredChromaticIndex, scaleRoot, chromaticSemitones);
    }
    
    // 1. Find where the Pivot sits in the scale
    const pivotInfo = getScaleDegree(pivot, scaleRoot, intervals);
    // If pivot isn't in scale, we can't do strict tonal inversion easily. 
    // Fallback: Treat pivot as if it were the nearest scale note? 
    // For now, just return raw if pivot fails, or maybe snap pivot.
    // Let's assume pivot is valid or we map it.
    if (!pivotInfo) return pivot - (pitch - pivot); // Fallback to chromatic if pivot invalid

    const pivotGlobalIndex = pivotInfo.octave * 7 + pivotInfo.degree;

    // 2. Find where the Target Pitch sits
    const info = getScaleDegree(pitch, scaleRoot, intervals);
    if (!info) return pivot - (pitch - pivot); // Fallback if note outside scale

    const currentGlobalIndex = info.octave * 7 + info.degree;
    
    // 3. Reflect index around pivot index
    // dist = current - pivot
    // new = pivot - dist = pivot - (current - pivot) = 2*pivot - current
    const invertedGlobalIndex = 2 * pivotGlobalIndex - currentGlobalIndex;
    
    const invOct = Math.floor(invertedGlobalIndex / 7);
    const invDeg = (invertedGlobalIndex % 7 + 7) % 7;
    
    const invertedBasePitch = getPitchFromDegree(invOct, invDeg, scaleRoot, intervals);
    const mirroredChromaticOffset = 2 * pivotInfo.chromaticOffset - info.chromaticOffset;
    return invertedBasePitch + mirroredChromaticOffset;
}

// Determines if any dissonance exists in a set of pitches
function analyzeVerticalSlice(pitches: number[]): { isDissonant: boolean; label: string } {
    if (pitches.length < 2) return { isDissonant: false, label: '' };
    
    const sorted = [...pitches].sort((a,b) => a-b);
    const bass = sorted[0];

    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const p1 = sorted[i];
            const p2 = sorted[j];
            const interval = Math.abs(p1 - p2);
            const ic = interval % 12;
            
            const isBassPair = (p1 === bass || p2 === bass);
            let isDiss = DISSONANT_INTERVALS.includes(ic);
            if (ic === 5 && isBassPair) isDiss = true; // P4 against bass

            if (isDiss) {
                // Prioritize displaying the "crunchiest" interval
                return { isDissonant: true, label: getIntervalLabel(interval) };
            }
        }
    }
    
    // If no dissonance, return first interval label or generic
    const firstInt = Math.abs(sorted[1] - sorted[0]);
    return { isDissonant: false, label: getIntervalLabel(firstInt) };
}

// Special function for Dyad inference (2 pitches, including compound intervals).
function analyzeDyad(lowPitch: number, highPitch: number): { name: string; root: number; quality: string } | null {
    const lowPC = ((lowPitch % 12) + 12) % 12;
    const highPC = ((highPitch % 12) + 12) % 12;
    const simpleInterval = ((highPitch - lowPitch) % 12 + 12) % 12;

    // 3rd (including 10th, 17th, ...) -> Root is lower note.
    if (simpleInterval === 3) return { name: "Min (no 5)", root: lowPC, quality: "Min" };
    if (simpleInterval === 4) return { name: "Maj (no 5)", root: lowPC, quality: "Maj" };

    // 6th (including 13th, 20th, ...) -> First inversion of a third, root is upper note.
    if (simpleInterval === 8) return { name: "Maj (no 5)", root: highPC, quality: "Maj" }; // m6 => inverted M3
    if (simpleInterval === 9) return { name: "Min (no 5)", root: highPC, quality: "Min" }; // M6 => inverted m3

    // Perfect 5th / 12th -> power chord.
    if (simpleInterval === 7) return { name: "5", root: lowPC, quality: "5" };

    // Tritone / compound tritone.
    if (simpleInterval === 6) return { name: "Dim (no 3)", root: lowPC, quality: "Dim" };

    // P4, 2nds, 7ths are treated as intervals, not chords.
    return null;
}

// Helper to identify chord and return quality + NCT count
// Prioritizes shapes where the chord root matches the actual bass note
function identifyChordWithNCT(pitches: number[]): { name: string, quality: string, nct: number, chordTones: number[], rootPC: number } | null {
    if (pitches.length < 2) return null;
    const uniquePCs = Array.from(new Set(pitches.map(p => p % 12)));
    
    // Dyad/Cluster handling for 2 unique PCs (even if multiple octaves)
    if (uniquePCs.length === 2) {
        const sortedInput = [...pitches].sort((a,b) => a-b);
        const bassPC = ((sortedInput[0] % 12) + 12) % 12;
        const upperPC = uniquePCs.find(pc => pc !== bassPC);

        if (upperPC === undefined) return null;

        // Build an interval prototype from unique pitch classes rather than extreme absolute pitches.
        // This preserves inversion semantics in analyzeDyad while preventing octave-duplication artifacts.
        const directedInterval = (upperPC - bassPC + 12) % 12;
        const lowPitch = bassPC;
        const highPitch = bassPC + directedInterval;
        const dyadAnalysis = analyzeDyad(lowPitch, highPitch);
        if (dyadAnalysis) {
            return {
                name: `${getStrictPitchName(dyadAnalysis.root).replace(/\d/g, '')} ${dyadAnalysis.name}`,
                quality: dyadAnalysis.quality,
                nct: 0,
                chordTones: uniquePCs,
                rootPC: dyadAnalysis.root
            };
        } else {
            // It's an interval (P4, 2nd, 7th)
            return null;
        }
    }

    // 3+ Unique PCs -> Standard Shape Matching
    const sorted = [...pitches].sort((a,b) => a-b);
    const bassPC = sorted[0] % 12;

    let bestMatch = null;
    let bestScore = -Infinity;

    for (const root of uniquePCs) {
        const intervals = uniquePCs.map(pc => (pc - root + 12) % 12);
        for (const shape of CHORD_SHAPES) {
            const matchedIntervals = intervals.filter(i => shape.intervals.includes(i));
            const nctCount = intervals.length - matchedIntervals.length;
            
            // Basic heuristic: Must match at least 2 notes of the shape
            if (matchedIntervals.length < 2) continue;

            // --- CONSTRAINT: Extension Existence ---
            if (shape.intervals.length > 3) {
                const extensionInterval = shape.intervals[shape.intervals.length - 1];
                if (!matchedIntervals.includes(extensionInterval)) {
                    continue; // Skip this shape, it's invalid (e.g. Maj7 without 7)
                }
            }

            // --- SCORING LOGIC v3 ---
            let missingPenalty = 0;
            const missingIntervals = shape.intervals.filter(i => !matchedIntervals.includes(i));
            
            missingIntervals.forEach(int => {
                if (int === 3 || int === 4) {
                    missingPenalty += 30; // Missing 3rd is expensive
                } else if (int === 7 || int === 6 || int === 8) {
                    missingPenalty += 10; // Missing 5th is cheap
                } else {
                    missingPenalty += 10; 
                }
            });

            let score = (matchedIntervals.length * 100) 
                      - (nctCount * 500) 
                      - missingPenalty;
            
            if (root === bassPC) score += 5;

            if (score > bestScore) {
                bestScore = score;
                const rootName = getStrictPitchName(root).replace(/\d/g, '');
                
                // Identify which PCs are Chord Tones
                const chordTones = uniquePCs.filter(pc => {
                    const int = (pc - root + 12) % 12;
                    return shape.intervals.includes(int);
                });

                bestMatch = { 
                    name: `${rootName} ${shape.name}`, 
                    quality: shape.name, 
                    nct: nctCount,
                    chordTones: chordTones,
                    rootPC: root
                };
            }
        }
    }
    return bestMatch;
}

export function generatePolyphonicHarmonicRegions(notes: RawNote[], keyRoot: number = 0): HarmonicRegion[] {
    if (notes.length === 0) return [];
    
    // 1. Collect all time boundaries
    const timePoints = new Set<number>();
    notes.forEach(n => {
        timePoints.add(n.ticks);
        timePoints.add(n.ticks + n.durationTicks);
    });
    const sortedPoints = Array.from(timePoints).sort((a,b) => a-b);
    
    const regions: HarmonicRegion[] = [];
    let consecutiveDissonanceCount = 0;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i+1];
        const mid = start + (end - start) / 2; // Sample middle to avoid boundary edge cases
        
        // Active notes in this slice
        const active = notes.filter(n => n.ticks <= mid && (n.ticks + n.durationTicks) > mid);
        if (active.length < 2) {
            // Monophony: event counter is transparent — only consonance resets it.
            continue;
        }

        const pitches = active.map(n => n.midi);
        const chordMatch = identifyChordWithNCT(pitches);
        const { isDissonant, label } = analyzeVerticalSlice(pitches);

        let type: HarmonicRegion['type'] = 'consonant_stable';
        
        let detailedInfo: NonNullable<HarmonicRegion['detailedInfo']> = {
            chordName: "",
            allNotes: active.map(n => getPitchName(n.midi, keyRoot)),
            noteDetails: [],
            chordTones: [],
            ncts: []
        };

        if (chordMatch) {
            const { quality, nct, name, chordTones, rootPC } = chordMatch;
            const isConsonantChord = CONSONANT_QUALITIES.has(quality);
            
            detailedInfo.chordName = name;
            detailedInfo.quality = quality;
            
            const ctSet = new Set(chordTones);
            const isAug = quality.toLowerCase().includes('aug');

            active.forEach(n => {
                const pc = n.midi % 12;
                const interval = (pc - rootPC + 12) % 12;
                const noteName = getPitchName(n.midi, keyRoot);
                
                let role: NoteRole['role'] = 'NCT';
                
                if (ctSet.has(pc)) {
                    detailedInfo.chordTones.push(noteName);
                    
                    if (interval === 0) role = 'Root';
                    else if (interval === 3 || interval === 4) role = '3rd';
                    else if (interval === 7) role = '5th';
                    else if (interval === 6) role = 'Ext'; // Dim 5 / Tritone
                    else if (interval === 8) {
                        // 8 is Min 6th or Aug 5th.
                        // If chord quality is Aug, treat as 5th (Augmented)
                        role = isAug ? '5th' : 'Ext'; 
                    }
                    else role = 'Ext'; // 7th, 6th, etc.
                } else {
                    detailedInfo.ncts.push(noteName);
                    role = 'NCT';
                }

                detailedInfo.noteDetails.push({
                    name: noteName,
                    midi: n.midi,
                    role: role
                });
            });

            // Case 5: 2+ NCTs -> Red
            if (nct >= 2) {
                type = 'dissonant_severe';
                consecutiveDissonanceCount++; 
            } 
            // 1 NCT cases
            else if (nct === 1) {
                if (isConsonantChord) {
                    type = 'dissonant_secondary'; 
                } else {
                    type = 'dissonant_tertiary'; 
                }
                consecutiveDissonanceCount++;
            }
            // Clean Chords (0 NCT)
            else {
                if (isConsonantChord) {
                    type = 'consonant_stable'; 
                    consecutiveDissonanceCount = 0; 
                } else {
                    type = 'dissonant_primary'; 
                    consecutiveDissonanceCount++;
                }
            }
        } else {
            // No Chord Detected -> Interval Logic
            detailedInfo.chordName = `Interval: ${label}`;
            
            // For Intervals, we treat them as 'Chord Tones' but they don't have harmonic roles
            // We'll mark them as Ext to give them Purple color or maybe Root/5th if P5?
            // Let's just default to 'Root' for bass and 'Ext' for others to show color variety?
            // Actually, user spec is specific for Harmonic breakdown. For intervals, maybe just use NCT (Orange) or Ext (Purple).
            // Let's fallback to Ext (Purple) for clarity.
            const sortedActive = [...active].sort((a,b)=>a.midi - b.midi);
            sortedActive.forEach((n, i) => {
                detailedInfo.noteDetails.push({
                    name: getPitchName(n.midi, keyRoot),
                    midi: n.midi,
                    role: i === 0 ? 'Root' : 'Ext' // Arbitrary visual assignment for raw intervals
                });
            });
            detailedInfo.chordTones = detailedInfo.allNotes; 

            if (isDissonant) {
                consecutiveDissonanceCount++;
                if (consecutiveDissonanceCount === 1) {
                    type = 'dissonant_primary'; 
                } else if (consecutiveDissonanceCount === 2) {
                    type = 'dissonant_secondary'; 
                } else {
                    type = 'dissonant_tertiary'; 
                }
            } else {
                type = 'consonant_stable'; 
                consecutiveDissonanceCount = 0; 
            }
        }

        regions.push({
            startTick: start,
            endTick: end,
            type: type,
            intervalLabel: detailedInfo.chordName, // Short label
            description: detailedInfo.ncts.length > 0 ? `NCTs: ${detailedInfo.ncts.join(', ')}` : undefined,
            detailedInfo
        });
    }

    return regions;
}

export function analyzeStrettoCandidate(
    subject: RawNote[], 
    intervalSemis: number, 
    delayTicks: number, 
    ppq: number,
    ts: { num: number, den: number },
    isInverted: boolean = false,
    pivotMidi: number = 60,
    useChromaticInversion: boolean = false,
    keyRoot: number = 0, // New param for spelling
    maxPairwiseDissonance: number = 0.5,
    scaleMode: string = 'Major'
): StrettoCandidate {
    
    if (subject.length === 0) {
        return {
            id: `empty`, intervalSemis, intervalLabel: 'N/A', delayBeats: 0, delayTicks,
            grade: 'INVALID', errors: [], notes: [], dissonanceRatio: 0, nctRatio: 0, pairDissonanceScore: 0, endsOnDissonance: true
        };
    }

    const subjectEntryPitch = subject[0].midi;

    const answer: RawNote[] = subject.map(n => {
        if (!n) return null as any;
        let newMidi: number;
        
        if (isInverted) {
            const rawInverted = getInvertedPitch(n.midi, pivotMidi, keyRoot, scaleMode, useChromaticInversion);
            const invertedStart = getInvertedPitch(subjectEntryPitch, pivotMidi, keyRoot, scaleMode, useChromaticInversion);
            const targetStart = subjectEntryPitch + intervalSemis;
            const shift = targetStart - invertedStart;
            newMidi = rawInverted + shift;
        } else {
            newMidi = n.midi + intervalSemis;
        }

        return {
            ...n,
            ticks: n.ticks + delayTicks,
            midi: newMidi,
            name: getPitchName(newMidi, keyRoot),
            voiceIndex: 1
        };
    }).filter(n => !!n);
    
    const allNotes = [...subject, ...answer];
    
    // Generate Regions using Polyphonic Logic with Key Root
    const harmonicRegions = generatePolyphonicHarmonicRegions(allNotes, keyRoot);

    // Calculate Metrics
    let totalOverlapTicks = 0;
    let dissonantTicks = 0;
    let nctTicks = 0;
    let endsOnDissonance = false;
    
    harmonicRegions.forEach((r, idx) => {
        const dur = r.endTick - r.startTick;
        totalOverlapTicks += dur;
        
        // Dissonance accumulation
        if (r.type !== 'consonant_stable') {
            dissonantTicks += dur;
            if (idx === harmonicRegions.length - 1) endsOnDissonance = true;
        }
        
        // NCT accumulation
        if (r.detailedInfo && r.detailedInfo.ncts.length > 0) {
            nctTicks += dur;
        }
    });
    
    const dissonanceRatio = totalOverlapTicks > 0 ? (dissonantTicks / totalOverlapTicks) : 0;
    const nctRatio = totalOverlapTicks > 0 ? (nctTicks / totalOverlapTicks) : 0;

    let pairDissonanceScore = 0;
    let maxDissonanceRunEvents = 0;
    let currentDissonanceRunEvents = 0;
    let maxDissonanceRunTicks = 0;
    let currentDissonanceRunTicks = 0;
    const maxAllowedContinuousDissonanceTicks = ppq;
    harmonicRegions.forEach(r => {
        const mid = r.startTick + (r.endTick - r.startTick)/2;
        const active = allNotes.filter(n => n.ticks <= mid && (n.ticks + n.durationTicks) > mid);
        if (active.length < 2) return;
        
        const sorted = active.map(n => n.midi).sort((a,b) => a-b);
        const bass = sorted[0];
        let pairDissCount = 0;
        
        for(let i=0; i<sorted.length; i++) {
            for(let j=i+1; j<sorted.length; j++) {
                const interval = Math.abs(sorted[i] - sorted[j]);
                const ic = interval % 12;
                const isBassPair = (sorted[i] === bass || sorted[j] === bass);
                let isDiss = DISSONANT_INTERVALS.includes(ic);
                if (ic === 5 && isBassPair) isDiss = true;
                
                if (isDiss) pairDissCount++;
            }
        }
        
        if (r.type !== 'consonant_stable') {
            const runTicks = r.endTick - r.startTick;
            currentDissonanceRunEvents += 1;
            currentDissonanceRunTicks += runTicks;
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, currentDissonanceRunEvents);
            maxDissonanceRunTicks = Math.max(maxDissonanceRunTicks, currentDissonanceRunTicks);
        } else {
            currentDissonanceRunEvents = 0;
            currentDissonanceRunTicks = 0;
        }

        const durBeats = (r.endTick - r.startTick) / ppq;
        pairDissonanceScore += (durBeats * pairDissCount);
    });

    const violatesDissonancePolicy = dissonanceRatio > maxPairwiseDissonance || maxDissonanceRunEvents > 2 || maxDissonanceRunTicks > maxAllowedContinuousDissonanceTicks;

    const errors: StrettoError[] = [];
    
    let prevP1: number | null = null;
    let prevP2: number | null = null;
    
    const timePoints = new Set<number>();
    allNotes.forEach(n => { timePoints.add(n.ticks); timePoints.add(n.ticks+n.durationTicks); });
    const tPoints = Array.from(timePoints).sort((a,b)=>a-b);
    
    for(let i=0; i<tPoints.length-1; i++) {
        const t = tPoints[i];
        const n1 = subject.find(n => n.ticks <= t && (n.ticks+n.durationTicks) > t);
        const n2 = answer.find(n => n.ticks <= t && (n.ticks+n.durationTicks) > t);
        
        if (n1 && n2) {
            const p1 = n1.midi;
            const p2 = n2.midi;
            
            if (prevP1 !== null && prevP2 !== null) {
                if (prevP1 !== p1 && prevP2 !== p2) { 
                    const int1 = Math.abs(prevP1 - prevP2) % 12;
                    const int2 = Math.abs(p1 - p2) % 12;
                    const isPerfect = int2 === 0 || int2 === 7;
                    if (isPerfect && int1 === int2) {
                        const timeStr = getFormattedTime(t, ppq, ts.num, ts.den);
                        const isStrong = isStrongBeat(t, ppq, ts.num, ts.den);
                        errors.push({
                            tick: t, timeFormatted: timeStr,
                            type: int2 === 7 ? 'Parallel 5th' : 'Parallel 8ve',
                            details: 'Parallel Perfect Interval',
                            severity: isStrong ? 'fatal' : 'warning'
                        });
                    }
                }
            }
            prevP1 = p1; prevP2 = p2;
        } else {
            prevP1 = null; prevP2 = null;
        }
    }

    let grade: StrettoGrade = 'STRONG';
    if (violatesDissonancePolicy) {
        errors.push({
            tick: delayTicks,
            timeFormatted: getFormattedTime(delayTicks, ppq, ts.num, ts.den),
            type: maxDissonanceRunEvents > 2 ? 'Consecutive Dissonance' : 'Unresolved Dissonance',
            details: `Pairwise dissonance policy violation (ratio=${Math.round(dissonanceRatio * 100)}%, cap=${Math.round(maxPairwiseDissonance * 100)}%, maxRunEvents=${maxDissonanceRunEvents}, allowedRunEvents<=2, maxRunTicks=${maxDissonanceRunTicks}, allowedRunTicks<=${maxAllowedContinuousDissonanceTicks}).`,
            severity: 'fatal'
        });
    }
    if (errors.some(e => e.severity === 'fatal')) grade = 'INVALID';
    else if (errors.length > 0) grade = 'VIABLE';

    let intLabel = getIntervalLabel(intervalSemis);
    if (isInverted) intLabel += " (Inv)";

    const delayBeats = delayTicks / (ppq * (4 / ts.den));

    return {
        id: `${intLabel}@${delayBeats.toFixed(1)}${isInverted?'i':''}`,
        intervalSemis,
        intervalLabel: intLabel,
        delayBeats: parseFloat(delayBeats.toFixed(2)),
        delayTicks,
        grade,
        errors,
        notes: allNotes,
        regions: harmonicRegions,
        dissonanceRatio,
        nctRatio,
        pairDissonanceScore: parseFloat(pairDissonanceScore.toFixed(1)),
        endsOnDissonance
    };
}

export function analyzeStrettoTripletCandidate(
    subject: RawNote[],
    firstIntervalSemis: number,
    secondIntervalSemis: number,
    firstDelayTicks: number,
    secondDelayTicks: number,
    ppq: number,
    ts: { num: number, den: number },
    firstIsInverted: boolean = false,
    secondIsInverted: boolean = false,
    pivotMidi: number = 60,
    useChromaticInversion: boolean = false,
    keyRoot: number = 0,
    maxPairwiseDissonance: number = 0.5,
    scaleMode: string = 'Major'
): StrettoCandidate {
    if (subject.length === 0) {
        return {
            id: 'empty-triplet', intervalSemis: 0, intervalLabel: 'N/A', delayBeats: 0, delayTicks: 0,
            grade: 'INVALID', errors: [], notes: [], dissonanceRatio: 0, nctRatio: 0, pairDissonanceScore: 0, endsOnDissonance: true
        };
    }

    const subjectEntryPitch = subject[0].midi;
    const transformEntry = (intervalSemis: number, delayTicks: number, isInverted: boolean, voiceIndex: number): RawNote[] => (
        subject.map(n => {
            if (!n) return null as any;
            let newMidi: number;
            if (isInverted) {
                const rawInverted = getInvertedPitch(n.midi, pivotMidi, keyRoot, scaleMode, useChromaticInversion);
                const invertedStart = getInvertedPitch(subjectEntryPitch, pivotMidi, keyRoot, scaleMode, useChromaticInversion);
                const targetStart = subjectEntryPitch + intervalSemis;
                const shift = targetStart - invertedStart;
                newMidi = rawInverted + shift;
            } else {
                newMidi = n.midi + intervalSemis;
            }
            return {
                ...n,
                ticks: n.ticks + delayTicks,
                midi: newMidi,
                name: getPitchName(newMidi, keyRoot),
                voiceIndex
            };
        }).filter(n => !!n)
    );

    // secondDelayTicks is the gap from e1 to e2; e2's absolute position is firstDelayTicks + secondDelayTicks
    const entryA = subject.map(n => ({ ...n, voiceIndex: 0 }));
    const entryB = transformEntry(firstIntervalSemis, firstDelayTicks, firstIsInverted, 1);
    const entryC = transformEntry(secondIntervalSemis, firstDelayTicks + secondDelayTicks, secondIsInverted, 2);
    const allNotes = [...entryA, ...entryB, ...entryC];
    const harmonicRegions = generatePolyphonicHarmonicRegions(allNotes, keyRoot);

    let totalOverlapTicks = 0;
    let dissonantTicks = 0;
    let nctTicks = 0;
    let endsOnDissonance = false;
    let pairDissonanceScore = 0;
    let maxDissonanceRunEvents = 0;
    let currentDissonanceRunEvents = 0;
    let maxDissonanceRunTicks = 0;
    let currentDissonanceRunTicks = 0;
    const maxAllowedContinuousDissonanceTicks = ppq;

    harmonicRegions.forEach((r, idx) => {
        const dur = r.endTick - r.startTick;
        totalOverlapTicks += dur;
        if (r.type !== 'consonant_stable') {
            dissonantTicks += dur;
            if (idx === harmonicRegions.length - 1) endsOnDissonance = true;
            currentDissonanceRunEvents += 1;
            currentDissonanceRunTicks += dur;
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, currentDissonanceRunEvents);
            maxDissonanceRunTicks = Math.max(maxDissonanceRunTicks, currentDissonanceRunTicks);
        } else {
            currentDissonanceRunEvents = 0;
            currentDissonanceRunTicks = 0;
        }
        if (r.detailedInfo && r.detailedInfo.ncts.length > 0) nctTicks += dur;

        const mid = r.startTick + (dur / 2);
        const active = allNotes.filter(n => n.ticks <= mid && (n.ticks + n.durationTicks) > mid).map(n => n.midi).sort((a, b) => a - b);
        if (active.length >= 2) {
            const bass = active[0];
            let pairDissCount = 0;
            for (let i = 0; i < active.length; i++) {
                for (let j = i + 1; j < active.length; j++) {
                    const ic = Math.abs(active[i] - active[j]) % 12;
                    let isDiss = DISSONANT_INTERVALS.includes(ic);
                    if (ic === 5 && (active[i] === bass || active[j] === bass)) isDiss = true;
                    if (isDiss) pairDissCount++;
                }
            }
            pairDissonanceScore += ((dur / ppq) * pairDissCount);
        }
    });

    const dissonanceRatio = totalOverlapTicks > 0 ? dissonantTicks / totalOverlapTicks : 0;
    const nctRatio = totalOverlapTicks > 0 ? nctTicks / totalOverlapTicks : 0;
    const violatesDissonancePolicy = dissonanceRatio > maxPairwiseDissonance || maxDissonanceRunEvents > 2 || maxDissonanceRunTicks > maxAllowedContinuousDissonanceTicks;
    const errors: StrettoError[] = [];
    if (violatesDissonancePolicy) {
        errors.push({
            tick: firstDelayTicks,
            timeFormatted: getFormattedTime(firstDelayTicks, ppq, ts.num, ts.den),
            type: maxDissonanceRunEvents > 2 ? 'Consecutive Dissonance' : 'Unresolved Dissonance',
            details: `Triplet dissonance policy violation (ratio=${Math.round(dissonanceRatio * 100)}%, cap=${Math.round(maxPairwiseDissonance * 100)}%, maxRunEvents=${maxDissonanceRunEvents}, allowedRunEvents<=2, maxRunTicks=${maxDissonanceRunTicks}, allowedRunTicks<=${maxAllowedContinuousDissonanceTicks}).`,
            severity: 'fatal'
        });
    }

    let grade: StrettoGrade = 'STRONG';
    if (errors.some(e => e.severity === 'fatal')) grade = 'INVALID';
    else if (errors.length > 0) grade = 'VIABLE';

    const firstLabel = `${getIntervalLabel(firstIntervalSemis)}${firstIsInverted ? ' (Inv)' : ''}`;
    const secondLabel = `${getIntervalLabel(secondIntervalSemis)}${secondIsInverted ? ' (Inv)' : ''}`;
    const beatDiv = ppq * (4 / ts.den);
    const delayBeats = firstDelayTicks / beatDiv;
    // delayBeats2: absolute position of e2 from e0 in beats
    const delayBeats2 = (firstDelayTicks + secondDelayTicks) / beatDiv;
    return {
        id: `triplet:${firstLabel}@${firstDelayTicks}+${secondDelayTicks}|${secondLabel}`,
        intervalSemis: firstIntervalSemis,
        intervalLabel: `${firstLabel} → ${secondLabel}`,
        delayBeats: parseFloat(delayBeats.toFixed(2)),
        delayBeats2: parseFloat(delayBeats2.toFixed(2)),
        delayTicks: firstDelayTicks,
        grade,
        errors,
        notes: allNotes,
        regions: harmonicRegions,
        dissonanceRatio,
        nctRatio,
        pairDissonanceScore: parseFloat(pairDissonanceScore.toFixed(1)),
        endsOnDissonance
    };
}
