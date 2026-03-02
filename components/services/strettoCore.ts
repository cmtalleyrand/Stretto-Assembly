
import { RawNote, StrettoCandidate, StrettoError, StrettoGrade, HarmonicRegion, NoteRole } from '../../types';
import { getFormattedTime } from './midiHarmony';
import { getStrictPitchName, getIntervalLabel, getPitchName } from './midiSpelling';
import { CHORD_SHAPES, CONSONANT_QUALITIES, SCALE_INTERVALS } from './strettoConstants';

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

function getScaleDegree(pitch: number, root: number, intervals: number[]): { octave: number, degree: number } | null {
    const semitone = (pitch - root + 1200) % 12; 
    let bestDegree = -1;
    let minErr = 99;
    
    intervals.forEach((s, i) => {
        const err = Math.abs(s - semitone);
        if (err < minErr) { minErr = err; bestDegree = i; }
    });
    
    const relPitch = pitch - root;
    const oct = Math.floor(relPitch / 12);
    return { octave: oct, degree: bestDegree };
}

function getPitchFromDegree(octave: number, degree: number, root: number, intervals: number[]): number {
    const normalizedDegree = (degree % 7 + 7) % 7;
    const octaveShift = Math.floor(degree / 7);
    const semi = intervals[normalizedDegree];
    return root + (octave + octaveShift) * 12 + semi;
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
    
    return getPitchFromDegree(invOct, invDeg, scaleRoot, intervals);
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

// Special function for Dyad inference (2 pitch classes)
function analyzeDyad(pc1: number, pc2: number): { name: string; root: number; quality: string } | null {
    const diff = (pc2 - pc1 + 12) % 12; // Assuming pc1 is bass for interval calc
    
    // 3rd (Major or Minor) -> Root is bottom
    if (diff === 3) return { name: "Min (no 5)", root: pc1, quality: "Min" };
    if (diff === 4) return { name: "Maj (no 5)", root: pc1, quality: "Maj" };
    
    // 6th (Inverted 3rd) -> Root is top
    if (diff === 8) return { name: "Maj (no 5)", root: pc2, quality: "Maj" }; // m6 -> Inverted Maj3
    if (diff === 9) return { name: "Min (no 5)", root: pc2, quality: "Min" }; // M6 -> Inverted min3
    
    // Perfect 5th -> Power Chord
    if (diff === 7) return { name: "5", root: pc1, quality: "5" };
    
    // Tritone -> Diminished (no 3rd) - Usually implies dim triad or dim7
    if (diff === 6) return { name: "Dim (no 3)", root: pc1, quality: "Dim" };

    // P4, 2nds, 7ths are treated as Intervals, not Chords here
    return null;
}

// Helper to identify chord and return quality + NCT count
// Prioritizes shapes where the chord root matches the actual bass note
function identifyChordWithNCT(pitches: number[]): { name: string, quality: string, nct: number, chordTones: number[], rootPC: number } | null {
    if (pitches.length < 2) return null;
    const uniquePCs = Array.from(new Set(pitches.map(p => p % 12)));
    
    // Dyad/Cluster handling for 2 unique PCs (even if multiple octaves)
    if (uniquePCs.length === 2) {
        const sortedPCs = [...uniquePCs].sort((a,b) => a-b);
        const sortedInput = [...pitches].sort((a,b) => a-b);
        const bassPC = sortedInput[0] % 12;
        const otherPC = uniquePCs.find(p => p !== bassPC) || bassPC;
        
        const dyadAnalysis = analyzeDyad(bassPC, otherPC);
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
            consecutiveDissonanceCount = 0; // Reset on rest/monophony
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

function isStrongBeat(tick: number, ppq: number, tsNum: number, tsDenom: number): boolean {
    const ticksPerMeasure = ppq * tsNum * (4 / tsDenom);
    const pos = tick % ticksPerMeasure;
    if (pos === 0) return true; 
    if (tsNum === 4 && tsDenom === 4 && pos === (ticksPerMeasure / 2)) return true;
    return false; 
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
    keyRoot: number = 0 // New param for spelling
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
            const rawInverted = getInvertedPitch(n.midi, pivotMidi, keyRoot, 'Major', useChromaticInversion);
            const invertedStart = getInvertedPitch(subjectEntryPitch, pivotMidi, keyRoot, 'Major', useChromaticInversion);
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
        
        const durBeats = (r.endTick - r.startTick) / ppq;
        pairDissonanceScore += (durBeats * pairDissCount);
    });

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
