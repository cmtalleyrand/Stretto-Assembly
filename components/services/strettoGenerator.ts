
import { RawNote, StrettoChainResult, StrettoSearchOptions, StrettoChainOption, StrettoConstraintMode, StrettoSearchReport } from '../../types';
import { INTERVALS, SCALE_INTERVALS } from './strettoConstants';
import { calculateStrettoScore, SubjectVariant, InternalNote } from './strettoScoring';
import { getInvertedPitch } from './strettoCore';

// --- Constants & Types ---
const MAX_SEARCH_NODES = 2000000; // Increased to allow deeper search
const TIME_LIMIT_MS = 30000;
const MAX_RESULTS = 50;

// --- Precomputation: Scales & Inversion ---

function normalizeSubject(notes: RawNote[], ppq: number): { notes: InternalNote[], offsetTicks: number } {
    const valid = notes.filter(n => !!n).sort((a,b) => a.ticks - b.ticks);
    if (valid.length === 0) return { notes: [], offsetTicks: 0 };
    
    // No quantization here - preserve original ticks relative to start
    const startTick = valid[0].ticks;
    
    // We still need an offset for metric alignment (strong beat detection)
    // Assuming startTick is absolute, offsetTicks = startTick
    const offsetTicks = startTick;

    const internalNotes: InternalNote[] = valid.map(n => ({
        relTick: n.ticks - startTick,
        durationTicks: n.durationTicks,
        pitch: n.midi
    }));

    return { notes: internalNotes, offsetTicks };
}

// --- Rule Definitions (Pruning) ---

// STRICT RULE: Include 5 (P4) in Perfect Intervals to prevent parallel 4ths
const PERFECT_INTERVALS = new Set([0, 7, 5]);

/**
 * PHASE 1 CHECK: Structural Validity (Pairwise)
 * REFACTORED: Uses Scan-Line algorithm on raw ticks.
 */
function checkCounterpointStructure(
    variantA: SubjectVariant, 
    variantB: SubjectVariant, 
    delayTicks: number, 
    transposition: number,
    maxDissonanceRatio: number
): { compatible: boolean, dissonanceRatio: number } {
    
    // Collect all time points
    const timePoints = new Set<number>();
    
    interface Event {
        start: number;
        end: number;
        pitch: number;
        source: 'A' | 'B';
    }
    const events: Event[] = [];

    variantA.notes.forEach(n => {
        const s = n.relTick;
        const e = s + n.durationTicks;
        timePoints.add(s); timePoints.add(e);
        events.push({ start: s, end: e, pitch: n.pitch, source: 'A' });
    });

    variantB.notes.forEach(n => {
        const s = n.relTick + delayTicks;
        const e = s + n.durationTicks;
        timePoints.add(s); timePoints.add(e);
        events.push({ start: s, end: e, pitch: n.pitch + transposition, source: 'B' });
    });

    const sortedPoints = Array.from(timePoints).sort((a,b) => a-b);
    
    let prevP1: number | null = null;
    let prevP2: number | null = null;
    
    let dissRunLength = 0; 
    let lastIsDiss = false;
    
    let overlapTicks = 0;
    let dissonantTicks = 0;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i+1];
        const dur = end - start;
        if (dur <= 0) continue;

        // Find active notes
        const activeA = events.find(e => e.source === 'A' && e.start <= start && e.end > start);
        const activeB = events.find(e => e.source === 'B' && e.start <= start && e.end > start);
        
        if (!activeA || !activeB) {
            // Monophonic moment - reset trackers
            prevP1 = null; prevP2 = null;
            dissRunLength = 0;
            lastIsDiss = false;
            continue;
        }
        
        overlapTicks += dur;
        
        const p1 = activeA.pitch;
        const p2 = activeB.pitch;
        const lo = Math.min(p1, p2);
        const hi = Math.max(p1, p2);
        const interval = (hi - lo) % 12;
        
        // Rule 5: Parallel Perfects
        if (prevP1 !== null && prevP2 !== null) {
            const p1Moved = p1 !== prevP1;
            const p2Moved = p2 !== prevP2;
            
            if (p1Moved && p2Moved) {
                if (PERFECT_INTERVALS.has(interval)) {
                    const prevLo = Math.min(prevP1, prevP2);
                    const prevHi = Math.max(prevP1, prevP2);
                    const prevInt = (prevHi - prevLo) % 12;
                    if (prevInt === interval) return { compatible: false, dissonanceRatio: 1 };
                }
            }
        }
        
        // Rule 6: Dissonance (Structural)
        let isDiss = INTERVALS.DISSONANT_SIMPLE.has(interval);
        
        if (isDiss) {
            dissonantTicks += dur;
            
            // For run length, we count *events* (intervals), not ticks
            if (!lastIsDiss) dissRunLength = 1;
            else dissRunLength++;

            // Rule C2: Event Limit (r <= 2)
            if (dissRunLength > 2) return { compatible: false, dissonanceRatio: 1 };
            
            lastIsDiss = true;
        } else {
            dissRunLength = 0;
            lastIsDiss = false;
        }
        
        prevP1 = p1; prevP2 = p2;
    }
    
    // Strict Dissonance Ratio Filter
    if (overlapTicks > 0) {
        const ratio = dissonantTicks / overlapTicks;
        if (ratio > maxDissonanceRatio) return { compatible: false, dissonanceRatio: ratio };
    }
    
    return { compatible: true, dissonanceRatio: overlapTicks > 0 ? dissonantTicks / overlapTicks : 0 };
}

// Helper: Determine beat strength
function isStrongBeat(tick: number, ppq: number): boolean {
    // Strong if on Beat 1 (0) or Beat 3 (PPQ*2) in 4/4
    // Generalized: Strong if tick % (PPQ * 2) === 0
    return (tick % (ppq * 2)) === 0;
}

/**
 * PHASE 5 CHECK: Metric Compliance
 * REFACTORED: Uses Scan-Line algorithm on raw ticks.
 */
function checkMetricCompliance(
    newVariant: SubjectVariant, 
    newEntry: StrettoChainOption,
    chain: StrettoChainOption[], 
    variants: SubjectVariant[], 
    variantIndices: number[],
    ppq: number,
    metricOffset: number = 0
): boolean {
    
    const newStartTick = Math.round(newEntry.startBeat * ppq);
    
    // Check against every existing voice
    for (let k = 0; k < chain.length; k++) {
        const existEntry = chain[k];
        const existVariant = variants[variantIndices[k]];
        const existStartTick = Math.round(existEntry.startBeat * ppq);
        
        // Determine overlapping region
        const overlapStart = Math.max(newStartTick, existStartTick);
        const overlapEnd = Math.min(newStartTick + newVariant.lengthTicks, existStartTick + existVariant.lengthTicks);
        
        if (overlapEnd <= overlapStart) continue;

        // Build scan-line points for this pair
        const points = new Set<number>();
        points.add(overlapStart); points.add(overlapEnd);
        
        // Add internal note boundaries within overlap
        newVariant.notes.forEach(n => {
            const s = newStartTick + n.relTick;
            const e = s + n.durationTicks;
            if (s > overlapStart && s < overlapEnd) points.add(s);
            if (e > overlapStart && e < overlapEnd) points.add(e);
        });
        existVariant.notes.forEach(n => {
            const s = existStartTick + n.relTick;
            const e = s + n.durationTicks;
            if (s > overlapStart && s < overlapEnd) points.add(s);
            if (e > overlapStart && e < overlapEnd) points.add(e);
        });

        const sortedPoints = Array.from(points).sort((a,b) => a-b);
        
        let dissRunLength = 0;
        let lastIsDiss = false;

        // Iterate overlap intervals
        for (let i = 0; i < sortedPoints.length - 1; i++) {
            const start = sortedPoints[i];
            const end = sortedPoints[i+1];
            
            // Find active notes
            const noteNew = newVariant.notes.find(n => {
                const s = newStartTick + n.relTick;
                const e = s + n.durationTicks;
                return s <= start && e > start;
            });
            const noteExist = existVariant.notes.find(n => {
                const s = existStartTick + n.relTick;
                const e = s + n.durationTicks;
                return s <= start && e > start;
            });
            
            if (!noteNew || !noteExist) {
                dissRunLength = 0; lastIsDiss = false; continue;
            }

            const p1 = noteNew.pitch + newEntry.transposition;
            const p2 = noteExist.pitch + existEntry.transposition;
            const lo = Math.min(p1, p2);
            const hi = Math.max(p1, p2);
            const interval = (hi - lo) % 12;
            
            let isDiss = INTERVALS.DISSONANT_SIMPLE.has(interval);

            // Corrected Metric Check using Absolute Grid alignment
            const isStrong = isStrongBeat(start + metricOffset, ppq);

            if (isDiss) {
                if (!lastIsDiss) dissRunLength = 1; else dissRunLength++;
                
                // Rule C4B: If Strong beat, resolution must be immediate (Length 1 max)
                if (isStrong && dissRunLength > 1) return false; 

                // Rule C4A: If r=2, BOTH must be weak.
                if (dissRunLength === 2) {
                    // Check if previous interval started on strong beat? 
                    // Or check if *this* interval is strong?
                    // Original logic: if current is strong, fail.
                    // Also check if previous was strong.
                    const prevStart = sortedPoints[i-1]; // Safe because dissRunLength=2 implies i>=1
                    const prevIsStrong = isStrongBeat(prevStart + metricOffset, ppq);
                    if (isStrong || prevIsStrong) return false; 
                }
                
                if (dissRunLength > 2) return false;

                lastIsDiss = true;
            } else {
                dissRunLength = 0;
                lastIsDiss = false;
            }
        }
    }
    return true;
}

// --- Generator ---

export async function searchStrettoChains(
    rawSubject: RawNote[],
    options: StrettoSearchOptions,
    ppq: number
): Promise<StrettoSearchReport> {
    
    const startTime = Date.now();
    let nodesVisited = 0;
    let maxDepth = 0;
    let terminationReason: StrettoSearchReport['stats']['stopReason'] | 'Partial' | null = null;
    
    const { notes: baseNotes, offsetTicks } = normalizeSubject(rawSubject, ppq);
    if (baseNotes.length === 0) return { results: [], stats: { nodesVisited: 0, timeMs: 0, stopReason: 'Exhausted', maxDepthReached: 0 } };
    
    const subjectLengthTicks = Math.max(...baseNotes.map(n => n.relTick + n.durationTicks));
    
    const variants: SubjectVariant[] = [];
    variants.push({ type: 'N', truncationBeats: 0, lengthTicks: subjectLengthTicks, notes: baseNotes });
    if (options.inversionMode !== 'None') {
        // Use Centralized Inversion Logic
        const invNotes: InternalNote[] = baseNotes.map(n => ({
            ...n,
            pitch: getInvertedPitch(n.pitch, options.pivotMidi, options.scaleRoot, options.scaleMode, options.useChromaticInversion)
        }));
        variants.push({ type: 'I', truncationBeats: 0, lengthTicks: subjectLengthTicks, notes: invNotes });
    }
    if (options.truncationMode !== 'None' && options.truncationTargetBeats > 0) {
        const truncTicks = Math.round(options.truncationTargetBeats * ppq);
        if (truncTicks < subjectLengthTicks) {
            variants.push({ 
                type: 'N', truncationBeats: options.truncationTargetBeats, lengthTicks: truncTicks,
                notes: baseNotes.filter(n => n.relTick < truncTicks).map(n => ({
                    relTick: n.relTick,
                    durationTicks: Math.min(n.durationTicks, truncTicks - n.relTick),
                    pitch: n.pitch
                }))
            });
            if (options.inversionMode !== 'None') {
                const invNotes: InternalNote[] = baseNotes.map(n => ({
                    relTick: n.relTick,
                    durationTicks: n.durationTicks,
                    pitch: getInvertedPitch(n.pitch, options.pivotMidi, options.scaleRoot, options.scaleMode, options.useChromaticInversion)
                }));
                variants.push({ 
                    type: 'I', truncationBeats: options.truncationTargetBeats, lengthTicks: truncTicks,
                    notes: invNotes.filter(n => n.relTick < truncTicks).map(n => ({
                        relTick: n.relTick,
                        durationTicks: Math.min(n.durationTicks, truncTicks - n.relTick),
                        pitch: n.pitch
                    }))
                });
            }
        }
    }

    const compatTable = new Map<string, number>();
    const validDelays: number[] = [];
    const maxDelayTicks = Math.floor(subjectLengthTicks * (2/3));
    
    // Delays happen in half-beat intervals (8th notes)
    const delayStep = ppq / 2; 
    for (let d = delayStep; d <= maxDelayTicks; d += delayStep) validDelays.push(d);
    
    const transpositions = Array.from(INTERVALS.TRAD_TRANSPOSITIONS);
    if (options.thirdSixthMode !== 'None') {
        INTERVALS.THIRD_SIXTH_TRANSPOSITIONS.forEach(t => transpositions.push(t));
    }
    
    // Phase 1: STRUCTURAL PAIRWISE PRECOMPUTATION
    variants.forEach((vA, iA) => {
        variants.forEach((vB, iB) => {
            validDelays.forEach(d => {
                transpositions.forEach(t => {
                    const key = `${iA}_${iB}_${d}_${t}`;
                    const res = checkCounterpointStructure(vA, vB, d, t, options.maxPairwiseDissonance + 0.05);
                    if (res.compatible) compatTable.set(key, res.dissonanceRatio);
                });
            });
        });
    });

    // --- PRECOMPUTE TRIPLES ---
    const validTriples = new Set<string>();
    const validPairsList: {vA: number, vB: number, d: number, t: number}[] = [];
    compatTable.forEach((_, key) => {
        const [vA, vB, d, t] = key.split('_').map(Number);
        validPairsList.push({vA, vB, d, t});
    });

    const pairsByFirst = new Map<number, typeof validPairsList>();
    for (const p of validPairsList) {
        if (!pairsByFirst.has(p.vA)) pairsByFirst.set(p.vA, []);
        pairsByFirst.get(p.vA)!.push(p);
    }

    for (const p1 of validPairsList) {
        const nextPairs = pairsByFirst.get(p1.vB) || [];
        for (const p2 of nextPairs) {
            const d1 = p1.d;
            const d2 = p2.d;
            
            // Rule: Max Expansion (using ticks, assuming step size)
            if (d2 > d1 + delayStep) continue;
            
            // Rule: Pair A->C compatibility (if overlapping)
            const vA = p1.vA;
            const vC = p2.vB;
            const dAC = d1 + d2;
            const tAC = p1.t + p2.t;
            
            const lenA = variants[vA].lengthTicks;
            if (dAC < lenA) {
                const keyAC = `${vA}_${vC}_${dAC}_${tAC}`;
                if (!compatTable.has(keyAC)) continue;
            }
            
            // Rule: Voice Spacing for the Triple
            const trans = [0, p1.t, p1.t + p2.t].sort((a,b) => a - b);
            if (trans[2] - trans[0] < 7) continue;
            
            let possibleAssignment = false;
            for (let v1=0; v1<options.ensembleTotal; v1++) {
                for (let v2=0; v2<options.ensembleTotal; v2++) {
                    if (v1===v2) continue;
                    for (let v3=0; v3<options.ensembleTotal; v3++) {
                        if (v1===v3 || v2===v3) continue;
                        
                        const testChain = [
                            { voiceIndex: v1, transposition: 0 },
                            { voiceIndex: v2, transposition: p1.t },
                            { voiceIndex: v3, transposition: p1.t + p2.t }
                        ];
                        
                        let assignmentFail = false;
                        for (let i=0; i<3; i++) {
                            for (let j=i+1; j<3; j++) {
                                const a = testChain[i];
                                const b = testChain[j];
                                
                                const highV = Math.min(a.voiceIndex, b.voiceIndex);
                                const lowV = Math.max(a.voiceIndex, b.voiceIndex);
                                const highT = highV === a.voiceIndex ? a.transposition : b.transposition;
                                const lowT = lowV === a.voiceIndex ? a.transposition : b.transposition;
                                const dist = lowV - highV;
                                
                                if (highT < lowT) assignmentFail = true;
                                if (dist === 2 && highT < lowT + 7) assignmentFail = true;
                                if (dist >= 3 && highT < lowT + 12) assignmentFail = true;
                                
                                const bassIdx = options.ensembleTotal - 1;
                                const altoIdx = bassIdx - 2;
                                if (bassIdx >= 2 && lowV === bassIdx && highV === altoIdx) {
                                    if (highT < lowT + 12) assignmentFail = true;
                                }
                            }
                        }
                        if (!assignmentFail) {
                            possibleAssignment = true;
                            break;
                        }
                    }
                    if (possibleAssignment) break;
                }
                if (possibleAssignment) break;
            }
            
            if (!possibleAssignment) continue;
            
            const key = `${vA}_${p1.vB}_${vC}_${d1}_${d2}_${p1.t}_${p2.t}`;
            validTriples.add(key);
        }
    }

    const results: StrettoChainResult[] = [];
    const partialResults: StrettoChainResult[] = []; // Store best partials
    const MAX_PARTIALS = 20;
    
    const seenSignatures = new Set<string>();
    function getChainSignature(c: StrettoChainOption[]): string {
        const d = [];
        const t = [];
        const ty = [];
        for (let i = 1; i < c.length; i++) {
            d.push(Math.round(c[i].startBeat * ppq) - Math.round(c[i-1].startBeat * ppq));
        }
        for (let i = 0; i < c.length; i++) {
            t.push((c[i].transposition % 12 + 12) % 12); // Use interval class to deduplicate functionally identical chains
            ty.push(c[i].type);
        }
        return `${d.join(',')}|${t.join(',')}|${ty.join(',')}`;
    }

    async function solve(
        chain: StrettoChainOption[], 
        variantIndices: number[], 
        voiceEndTimesTicks: number[], 
        nInv: number, 
        nTrunc: number,
        nRestricted: number,
        nFree: number
    ) {
        nodesVisited++;
        maxDepth = Math.max(maxDepth, chain.length);
        
        if (Date.now() - startTime > TIME_LIMIT_MS) {
            if (!terminationReason) terminationReason = 'Timeout';
            return;
        }
        if (results.length >= MAX_RESULTS * 10) return; // Allow finding more chains before early termination
        if (nodesVisited > MAX_SEARCH_NODES) {
            if (!terminationReason) terminationReason = 'NodeLimit';
            return;
        }

        // If target reached, store result
        if (chain.length === options.targetChainLength) {
            const sig = getChainSignature(chain);
            if (!seenSignatures.has(sig)) {
                const final = calculateStrettoScore(chain, variants, variantIndices, options);
                if (final.isValid) {
                    seenSignatures.add(sig);
                    results.push(final);
                }
            }
            return;
        }

        // --- PARTIAL RESULTS LOGIC ---
        // If the chain is significant (>= 3 entries), consider storing it as a partial result
        if (chain.length >= 3) {
            const sig = getChainSignature(chain);
            if (!seenSignatures.has(sig)) {
                // Simple heuristic: if we have few partials or this is longer than the worst stored partial
                if (partialResults.length < MAX_PARTIALS || chain.length > partialResults[partialResults.length-1].entries.length) {
                    const final = calculateStrettoScore(chain, variants, variantIndices, options);
                    if (final.isValid) {
                        seenSignatures.add(sig);
                        partialResults.push(final);
                        partialResults.sort((a,b) => b.entries.length - a.entries.length); // Keep longest
                        if (partialResults.length > MAX_PARTIALS) partialResults.pop();
                    }
                }
            }
        }

        const depth = chain.length; 
        const prevEntry = chain[depth - 1];
        
        const isFinalThird = depth >= options.targetChainLength - Math.ceil(options.targetChainLength / 3);
        const prevEntryLengthTicks = chain[depth-1].length; // Post-truncation length

        // --- RULE 1 & 2: DELAY LOGIC (STRICT) ---
        const possibleDelaysTicks: number[] = [];
        let minD = delayStep; 
        let maxD = Math.floor(prevEntryLengthTicks * (2/3)); // Based on truncated length

        if (depth === 1) {
            // First delay should be long (between 1/2 and 2/3)
            minD = Math.floor(prevEntryLengthTicks * 0.5);
        } else if (depth > 1) {
            const prevDelayTicks = Math.round(chain[depth-1].startBeat * ppq) - Math.round(chain[depth-2].startBeat * ppq);
            
            // Max Expansion: A delay cannot be more than 1 eighth-note longer than the previous delay.
            maxD = Math.min(maxD, prevDelayTicks + delayStep);
            
            if (depth >= 3) {
                const prevPrevDelayTicks = Math.round(chain[depth-2].startBeat * ppq) - Math.round(chain[depth-3].startBeat * ppq);
                
                // Expansion Reaction
                if (prevDelayTicks > prevPrevDelayTicks) {
                    const isDelayShort = prevDelayTicks <= (prevEntryLengthTicks / 3);
                    const relaxation = (isFinalThird && isDelayShort) ? 0 : delayStep;
                    maxD = Math.min(maxD, prevPrevDelayTicks - relaxation);
                }
                
                // n+2 Rule
                const isDelayShort = prevPrevDelayTicks <= (prevEntryLengthTicks / 3);
                if (isFinalThird && isDelayShort) {
                    maxD = Math.min(maxD, prevPrevDelayTicks + delayStep);
                } else {
                    maxD = Math.min(maxD, prevPrevDelayTicks - delayStep);
                }
            }
        }

        // Snap minD/maxD to grid
        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;

        for (let d = minD; d <= maxD; d += delayStep) possibleDelaysTicks.push(d);
        possibleDelaysTicks.sort((a,b) => a - b); 

        for (const delayTicks of possibleDelaysTicks) {
            if (depth >= 2) {
                const prevDelayTicks = Math.round(chain[depth-1].startBeat * ppq) - Math.round(chain[depth-2].startBeat * ppq);
                // No Repeats
                if (Math.abs(delayTicks - prevDelayTicks) < 1) {
                    const isDelayShort = delayTicks <= (prevEntryLengthTicks / 3);
                    if (!(isFinalThird && isDelayShort)) continue;
                }
            }

            const absStartTicks = Math.round(prevEntry.startBeat * ppq) + delayTicks;
            const absStartBeat = absStartTicks / ppq;

            for (const t of transpositions) {
                for (let varIdx = 0; varIdx < variants.length; varIdx++) {
                    
                    // --- TRIPLE PRUNING ---
                    if (depth >= 2) {
                        const vA = variantIndices[depth-2];
                        const vB = variantIndices[depth-1];
                        const vC = varIdx;
                        const d1 = Math.round(chain[depth-1].startBeat * ppq) - Math.round(chain[depth-2].startBeat * ppq);
                        const d2 = delayTicks;
                        const t1 = chain[depth-1].transposition - chain[depth-2].transposition;
                        const t2 = t - chain[depth-1].transposition;
                        const tripleKey = `${vA}_${vB}_${vC}_${d1}_${d2}_${t1}_${t2}`;
                        if (!validTriples.has(tripleKey)) continue;
                    }

                    const variant = variants[varIdx];
                    const isInv = variant.type === 'I';
                    const isTrunc = variant.truncationBeats > 0;
                    if (isInv && !checkQuota(options.inversionMode, nInv)) continue;
                    if (isTrunc && !checkQuota(options.truncationMode, nTrunc)) continue;
                    
                    const intervalClass = Math.abs(t % 12);
                    const isRestricted = [3, 4, 8, 9].includes(intervalClass);
                    const isFree = [0, 7].includes(intervalClass) || intervalClass === 5; 
                    const nextRestricted = nRestricted + (isRestricted ? 1 : 0);
                    const nextFree = nFree + (isFree ? 1 : 0);
                    
                    if (nextRestricted > 1 && nextRestricted >= nextFree) continue;
                    if (options.thirdSixthMode === 'None' && isRestricted) continue;
                    if (options.thirdSixthMode === 'Max 1' && nextRestricted > 1) continue;
                    if (options.disallowComplexExceptions && (isInv || isTrunc) && isRestricted) continue;

                    let harmonicFail = false;
                    for (let k = 0; k < chain.length; k++) {
                        const prevE = chain[k];
                        const prevVarIdx = variantIndices[k];
                        const prevStartTicks = Math.round(prevE.startBeat * ppq);
                        const prevEndTicks = prevStartTicks + variants[prevVarIdx].lengthTicks;
                        
                        if (absStartTicks < prevEndTicks) {
                            const relDelay = absStartTicks - prevStartTicks;
                            const relTrans = t - prevE.transposition;
                            const key = `${prevVarIdx}_${varIdx}_${relDelay}_${relTrans}`;
                            if (!compatTable.has(key)) {
                                harmonicFail = true;
                                break;
                            }
                        }
                    }
                    if (harmonicFail) continue;

                    for (let v = 0; v < options.ensembleTotal; v++) {
                        if (absStartTicks < voiceEndTimesTicks[v] - 2) continue; 
                        
                        let stratFail = false;
                        for (let existingIdx = 0; existingIdx < chain.length; existingIdx++) {
                            const e = chain[existingIdx];
                            if (Math.abs(e.voiceIndex - v) === 1) {
                                const highVoiceIdx = Math.min(e.voiceIndex, v);
                                const lowVoiceIdx = Math.max(e.voiceIndex, v);
                                const highVoiceTrans = (e.voiceIndex === highVoiceIdx) ? e.transposition : t;
                                const lowVoiceTrans = (e.voiceIndex === lowVoiceIdx) ? e.transposition : t;
                                if (highVoiceTrans < lowVoiceTrans) stratFail = true;
                            }
                            const bassIdx = options.ensembleTotal - 1;
                            const altoIdx = bassIdx - 2; 
                            if (bassIdx >= 2) {
                                const isNewBass = (v === bassIdx);
                                const isNewAlto = (v === altoIdx);
                                const isExistingBass = (e.voiceIndex === bassIdx);
                                const isExistingAlto = (e.voiceIndex === altoIdx);
                                if ((isNewBass && isExistingAlto) || (isNewAlto && isExistingBass)) {
                                    const bassTrans = isNewBass ? t : e.transposition;
                                    const altoTrans = isNewAlto ? t : e.transposition;
                                    if (altoTrans < bassTrans + 12) stratFail = true;
                                }
                            }
                            if (Math.abs(e.voiceIndex - v) === 2) {
                                const highVoiceIdx = Math.min(e.voiceIndex, v);
                                const lowVoiceIdx = Math.max(e.voiceIndex, v);
                                const highVoiceTrans = (e.voiceIndex === highVoiceIdx) ? e.transposition : t;
                                const lowVoiceTrans = (e.voiceIndex === lowVoiceIdx) ? e.transposition : t;
                                if (highVoiceTrans < lowVoiceTrans + 7) stratFail = true;
                            }
                        }
                        if (stratFail) continue;

                        const tempNextEntry: StrettoChainOption = {
                            startBeat: absStartBeat,
                            transposition: t,
                            type: variant.type,
                            length: variant.lengthTicks,
                            voiceIndex: v
                        };
                        
                        if (!checkMetricCompliance(variant, tempNextEntry, chain, variants, variantIndices, ppq, offsetTicks)) {
                            continue;
                        }

                        const newVoiceState = [...voiceEndTimesTicks];
                        newVoiceState[v] = absStartTicks + variant.lengthTicks;
                        
                        const nextChain = [...chain, tempNextEntry];

                        await solve(
                            nextChain,
                            [...variantIndices, varIdx],
                            newVoiceState,
                            nInv + (isInv?1:0),
                            nTrunc + (isTrunc?1:0),
                            nextRestricted,
                            nextFree
                        );
                    }
                }
            }
        }
    }
    
    const initialVoiceState = new Array(options.ensembleTotal).fill(0);
    initialVoiceState[options.subjectVoiceIndex] = variants[0].lengthTicks;
    
    await solve(
        [{ startBeat: 0, transposition: 0, type: 'N', length: variants[0].lengthTicks, voiceIndex: options.subjectVoiceIndex }],
        [0],
        initialVoiceState,
        0, 0, 0, 1
    );

    // Fallback: Use partial results if full results empty
    let sourceResults = results;
    let stopReason: StrettoSearchReport['stats']['stopReason'] = results.length > 0 ? 'Success' : ((terminationReason === 'Partial' ? 'Exhausted' : terminationReason) || 'Exhausted');
    
    if (results.length === 0 && partialResults.length > 0) {
        sourceResults = partialResults;
        // If we only have partial results and no hard limit was hit, we consider it 'Exhausted' (best effort)
        if (!terminationReason) stopReason = 'Exhausted'; 
    }

    // Grouping Logic
    const groupedMap = new Map<string, StrettoChainResult[]>();
    
    sourceResults.forEach(res => {
        const delays = res.entries.map(e => e.startBeat).join(',');
        const voices = res.entries.map(e => e.voiceIndex).join(',');
        const key = `D:${delays}|V:${voices}`;
        
        if (!groupedMap.has(key)) groupedMap.set(key, []);
        groupedMap.get(key)!.push(res);
    });

    const finalResults: StrettoChainResult[] = [];
    
    groupedMap.forEach((group) => {
        group.sort((a,b) => b.score - a.score);
        const leader = group[0];
        if (group.length > 1) {
            leader.variations = group.slice(1);
        }
        finalResults.push(leader);
    });

    return {
        results: finalResults.sort((a,b) => b.score - a.score).slice(0, MAX_RESULTS),
        stats: {
            nodesVisited,
            timeMs: Date.now() - startTime,
            stopReason: stopReason,
            maxDepthReached: maxDepth
        }
    };
}

function checkQuota(mode: StrettoConstraintMode, current: number): boolean {
    if (mode === 'None') return false;
    if (mode === 'Max 1') return current < 1;
    if (typeof mode === 'number') return current < mode;
    return true; // Unlimited
}
