
import { RawNote, StrettoChainResult, StrettoSearchOptions, StrettoChainOption, StrettoConstraintMode, StrettoSearchReport } from '../../types';
import { INTERVALS } from './strettoConstants';
import { calculateStrettoScore, SubjectVariant } from './strettoScoring';
import { getInvertedPitch } from './strettoCore';

// --- Constants & Types ---
const MAX_SEARCH_NODES = 400000; // Bound search breadth to prevent runaway exploration
const TIME_LIMIT_MS = 7500; // Bound wall time so UI gets a prompt terminal report
const MAX_RESULTS = 50;

interface InternalNote {
    relTick8: number; // Adaptive grid unit relative to start
    dur8: number;
    pitch: number;
}

// --- Precomputation: Scales & Inversion ---


function normalizeSubject(notes: RawNote[]): { notes: InternalNote[], offset8: number, gridStep: number } {
    const valid = notes.filter(n => !!n).sort((a,b) => a.ticks - b.ticks);
    if (valid.length === 0) return { notes: [], offset8: 0, gridStep: 1 };
    
    const grouped: Map<number, RawNote[]> = new Map();
    valid.forEach(n => {
        const t = n.ticks; 
        if (!grouped.has(t)) grouped.set(t, []);
        grouped.get(t)!.push(n);
    });
    
    const monoNotes: RawNote[] = [];
    Array.from(grouped.values()).forEach(group => {
        group.sort((a,b) => b.midi - a.midi);
        monoNotes.push(group[0]);
    });
    monoNotes.sort((a,b) => a.ticks - b.ticks);

    const startTick = monoNotes[0].ticks;

    // Keep raw tick fidelity: no quantization/normalization beyond translating origin.
    // Internal "8" fields remain historical names and now represent raw ticks.
    const gridStep = 1;
    
    const offset8 = Math.round(startTick / gridStep);

    const internalNotes = monoNotes.map(n => ({
        relTick8: n.ticks - startTick,
        dur8: Math.max(1, n.durationTicks),
        pitch: n.midi
    }));

    return { notes: internalNotes, offset8, gridStep };
}

// --- Rule Definitions (Pruning) ---

const DISSONANT_INTERVALS = new Set([1, 2, 6, 10, 11]);
const PERFECT_INTERVALS = new Set([0, 7]);

/**
 * PHASE 1 CHECK: Structural Validity (Pairwise)
 * Relaxed: Does NOT check "Ends on Dissonance" (C6) as that is position-dependent.
 * Checks: Parallel Perfects (P1/P5), Run Length <= 2.
 * NOW INCLUDES: Strict Dissonance Ratio Filter
 */
function checkCounterpointStructure(
    variantA: SubjectVariant, 
    variantB: SubjectVariant, 
    delay8: number, 
    transposition: number,
    maxDissonanceRatio: number,
    step: number = 1
): { compatible: boolean } {
    const notesA = variantA.notes;
    const notesB = variantB.notes;
    const timeline = new Map<number, { pA?: number, pB?: number }>();
    
    notesA.forEach(n => {
        for(let t=0; t<n.dur8; t += step) {
            const tick = n.relTick8 + t;
            if (!timeline.has(tick)) timeline.set(tick, {});
            timeline.get(tick)!.pA = n.pitch;
        }
    });
    
    notesB.forEach(n => {
        for(let t=0; t<n.dur8; t += step) {
            const tick = n.relTick8 + delay8 + t;
            if (timeline.has(tick)) timeline.get(tick)!.pB = n.pitch + transposition;
        }
    });
    
    const ticks = Array.from(timeline.keys()).sort((a,b) => a-b);
    let prevP1: number | null = null;
    let prevP2: number | null = null;
    
    let dissRunLength = 0; 
    let lastIsDiss = false;
    
    let overlapTicks = 0;
    let dissonantTicks = 0;

    for (let i = 0; i < ticks.length; i++) {
        const t = ticks[i];
        const state = timeline.get(t)!;
        
        if (state.pA === undefined || state.pB === undefined) {
            // Monophonic moment - reset trackers
            prevP1 = null; prevP2 = null;
            dissRunLength = 0;
            lastIsDiss = false;
            // Note: Rule C6 (Resolution into silence) ignored here to allow chaining
            continue;
        }
        
        overlapTicks++; // Count every concurrent 8th note tick
        
        const p1 = state.pA;
        const p2 = state.pB;
        const lo = Math.min(p1, p2);
        const hi = Math.max(p1, p2);
        const interval = (hi - lo) % 12;
        
        // Rule 5: Parallel Perfects (P1/P5 class)
        if (prevP1 !== null && prevP2 !== null) {
            const p1Moved = p1 !== prevP1;
            const p2Moved = p2 !== prevP2;
            
            if (p1Moved && p2Moved) {
                if (PERFECT_INTERVALS.has(interval)) {
                    const prevLo = Math.min(prevP1, prevP2);
                    const prevHi = Math.max(prevP1, prevP2);
                    const prevInt = (prevHi - prevLo) % 12;
                    if (prevInt === interval) return { compatible: false };
                }
            }
        }
        
        // Rule 6: Dissonance (Structural)
        const isDiss = DISSONANT_INTERVALS.has(interval);
        
        if (isDiss) {
            dissonantTicks++;
            
            if (!lastIsDiss) dissRunLength = 1;
            else dissRunLength++;

            // Rule C2: Event Limit (r <= 2)
            if (dissRunLength > 2) return { compatible: false };
            
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
        if (ratio > maxDissonanceRatio) return { compatible: false };
    }
    
    return { compatible: true };
}

// Helper: Determine beat strength
function isStrong8th(tick8: number, tsNum: number, tsDenom: number, unitsPerBeat: number): boolean {
    const unitsPerBar = tsNum * unitsPerBeat;
    const pos = tick8 % unitsPerBar;
    
    if (pos === 0) return true; // Downbeat always strong
    
    if (tsNum === 4 && tsDenom === 4) {
        if (pos === unitsPerBeat * 2) return true; // Beat 3 in 4/4
    }
    
    return false;
}

/**
 * PHASE 5 CHECK: Metric Compliance
 */
function checkMetricCompliance(
    newVariant: SubjectVariant, 
    newEntry: StrettoChainOption,
    chain: StrettoChainOption[], 
    variants: SubjectVariant[], 
    variantIndices: number[],
    tsNum: number = 4,
    tsDenom: number = 4,
    metricOffset: number = 0,
    unitsPerBeat: number = 2,
    step: number = 1
): boolean {
    
    const newStart8 = Math.round(newEntry.startBeat * unitsPerBeat);
    
    // Check against every existing voice
    for (let k = 0; k < chain.length; k++) {
        const existEntry = chain[k];
        const existVariant = variants[variantIndices[k]];
        const existStart8 = Math.round(existEntry.startBeat * unitsPerBeat);
        
        // Determine overlapping region
        const overlapStart = Math.max(newStart8, existStart8);
        const overlapEnd = Math.min(newStart8 + newVariant.length8, existStart8 + existVariant.length8);
        
        if (overlapEnd <= overlapStart) continue;

        let dissRunLength = 0;
        let lastIsDiss = false;

        // Iterate overlap ticks
        for (let t = overlapStart; t < overlapEnd; t += step) {
            const tRelNew = t - newStart8;
            const tRelExist = t - existStart8;
            
            const noteNew = newVariant.notes.find(n => n.relTick8 <= tRelNew && (n.relTick8 + n.dur8) > tRelNew);
            const noteExist = existVariant.notes.find(n => n.relTick8 <= tRelExist && (n.relTick8 + n.dur8) > tRelExist);
            
            if (!noteNew || !noteExist) {
                dissRunLength = 0; lastIsDiss = false; continue;
            }

            const p1 = noteNew.pitch + newEntry.transposition;
            const p2 = noteExist.pitch + existEntry.transposition;
            const lo = Math.min(p1, p2);
            const hi = Math.max(p1, p2);
            const interval = (hi - lo) % 12;
            
            const isDiss = DISSONANT_INTERVALS.has(interval);

            // Corrected Metric Check using Absolute Grid alignment
            const isStrong = isStrong8th(t + metricOffset, tsNum, tsDenom, unitsPerBeat);

            if (isDiss) {
                if (!lastIsDiss) dissRunLength = 1; else dissRunLength++;
                
                // Rule C4B: If Strong beat, resolution must be immediate (Length 1 max)
                if (isStrong && dissRunLength > 1) return false; 

                // Rule C4A: If r=2, BOTH must be weak.
                if (dissRunLength === 2) {
                    const prevIsStrong = isStrong8th((t - step) + metricOffset, tsNum, tsDenom, unitsPerBeat);
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

function isVoiceTranspositionCompatible(
    candidateVoice: number,
    candidateTransposition: number,
    existingVoice: number,
    existingTransposition: number,
    ensembleTotal: number
): boolean {
    if (Math.abs(existingVoice - candidateVoice) === 1) {
        const highVoiceIdx = Math.min(existingVoice, candidateVoice);
        const lowVoiceIdx = Math.max(existingVoice, candidateVoice);
        const highVoiceTrans = (existingVoice === highVoiceIdx) ? existingTransposition : candidateTransposition;
        const lowVoiceTrans = (existingVoice === lowVoiceIdx) ? existingTransposition : candidateTransposition;
        if (highVoiceTrans < lowVoiceTrans) return false;
    }

    const bassIdx = ensembleTotal - 1;
    const altoIdx = bassIdx - 2;
    if (bassIdx >= 2) {
        const isNewBass = (candidateVoice === bassIdx);
        const isNewAlto = (candidateVoice === altoIdx);
        const isExistingBass = (existingVoice === bassIdx);
        const isExistingAlto = (existingVoice === altoIdx);
        if ((isNewBass && isExistingAlto) || (isNewAlto && isExistingBass)) {
            const bassTrans = isNewBass ? candidateTransposition : existingTransposition;
            const altoTrans = isNewAlto ? candidateTransposition : existingTransposition;
            if (altoTrans < bassTrans + 12) return false;
        }
    }

    if (Math.abs(existingVoice - candidateVoice) === 2) {
        const highVoiceIdx = Math.min(existingVoice, candidateVoice);
        const lowVoiceIdx = Math.max(existingVoice, candidateVoice);
        const highVoiceTrans = (existingVoice === highVoiceIdx) ? existingTransposition : candidateTransposition;
        const lowVoiceTrans = (existingVoice === lowVoiceIdx) ? existingTransposition : candidateTransposition;
        if (highVoiceTrans < lowVoiceTrans + 7) return false;
    }

    return true;
}

function hasOverlap(
    startA: number,
    lenA: number,
    startB: number,
    lenB: number
): boolean {
    return Math.max(startA, startB) < Math.min(startA + lenA, startB + lenB);
}

// --- Generator ---


function buildDelayCandidates(baseNotes: InternalNote[], maxDelay8: number): number[] {
    const boundaries = new Set<number>();
    for (const n of baseNotes) {
        boundaries.add(n.relTick8);
        boundaries.add(n.relTick8 + n.dur8);
    }

    const points = Array.from(boundaries).sort((a, b) => a - b);
    const candidates = new Set<number>();

    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const delta = points[j] - points[i];
            if (delta <= 0 || delta > maxDelay8) continue;
            candidates.add(delta);
        }
    }

    if (candidates.size === 0 && maxDelay8 > 0) {
        candidates.add(Math.min(maxDelay8, Math.max(1, baseNotes[0]?.dur8 ?? 1)));
    }

    return Array.from(candidates).sort((a, b) => a - b);
}

export async function searchStrettoChains(
    rawSubject: RawNote[],
    options: StrettoSearchOptions,
    ppq: number
): Promise<StrettoSearchReport> {
    
    const startTime = Date.now();
    let nodesVisited = 0;
    let maxDepth = 0;
    let hitTimeout = false;
    let hitNodeLimit = false;
    
    const { notes: baseNotes, offset8, gridStep } = normalizeSubject(rawSubject, ppq);
    if (baseNotes.length === 0) return { results: [], stats: { nodesVisited: 0, timeMs: 0, stopReason: 'Exhausted', maxDepthReached: 0 } };
    const unitsPerBeat = Math.max(1, ppq);
    
    const subjectLength8 = Math.max(...baseNotes.map(n => n.relTick8 + n.dur8));
    
    const variants: SubjectVariant[] = [];
    variants.push({ type: 'N', truncationBeats: 0, length8: subjectLength8, notes: baseNotes });
    if (options.inversionMode !== 'None') {
        // Use Centralized Inversion Logic
        const invNotes = baseNotes.map(n => ({
            ...n,
            pitch: getInvertedPitch(n.pitch, options.pivotMidi, options.scaleRoot, options.scaleMode, options.useChromaticInversion)
        }));
        variants.push({ type: 'I', truncationBeats: 0, length8: subjectLength8, notes: invNotes });
    }
    if (options.truncationMode !== 'None' && options.truncationTargetBeats > 0) {
        const trunc8 = Math.round(options.truncationTargetBeats * unitsPerBeat);
        if (trunc8 < subjectLength8) {
            variants.push({ 
                type: 'N', truncationBeats: options.truncationTargetBeats, length8: trunc8,
                notes: baseNotes.filter(n => n.relTick8 < trunc8).map(n => ({...n, dur8: Math.min(n.dur8, trunc8 - n.relTick8)}))
            });
            if (options.inversionMode !== 'None') {
                const invNotes = baseNotes.map(n => ({
                    ...n,
                    pitch: getInvertedPitch(n.pitch, options.pivotMidi, options.scaleRoot, options.scaleMode, options.useChromaticInversion)
                }));
                variants.push({ 
                    type: 'I', truncationBeats: options.truncationTargetBeats, length8: trunc8,
                    notes: invNotes.filter(n => n.relTick8 < trunc8).map(n => ({...n, dur8: Math.min(n.dur8, trunc8 - n.relTick8)}))
                });
            }
        }
    }

    const compatTable = new Map<string, boolean>();
    const delayTripleMap = new Map<string, Set<number>>();
    const maxDelay8 = Math.floor(subjectLength8 * (2/3));
    const halfCapDelay8 = Math.floor(subjectLength8 * 0.5) - 1;
    const validDelays = buildDelayCandidates(baseNotes, maxDelay8);
    
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
                    const res = checkCounterpointStructure(vA, vB, d, t, options.maxPairwiseDissonance, 1);
                    if (res.compatible) compatTable.set(key, true);
                });
            });
        });
    });

    // Phase 1b: Cheap rhythm-only pruning graph.
    // Lift pairwise delay relations to triples so deeper recursion can prune without harmony checks.
    for (const d1 of validDelays) {
        for (const d2 of validDelays) {
            const key = `${d1}_${d2}`;
            for (const d3 of validDelays) {
                if (d3 === d2) continue; // No immediate repeated delay
                if (d3 > d2 + unitsPerBeat) continue; // Elasticity
                if (d2 > d1 && d3 >= d1) continue; // Expansion must react with contraction
                if (d2 > (subjectLength8 / 2) && d3 >= d2) continue; // No further widening after very large gap
                if (halfCapDelay8 > 0 && d3 > halfCapDelay8) continue;

                const usedLarge = new Set<number>();
                if (d1 > Math.floor(subjectLength8 / 3)) usedLarge.add(d1);
                if (d2 > Math.floor(subjectLength8 / 3)) usedLarge.add(d2);
                if (d3 > Math.floor(subjectLength8 / 3) && usedLarge.has(d3)) continue;

                if (!delayTripleMap.has(key)) delayTripleMap.set(key, new Set<number>());
                delayTripleMap.get(key)!.add(d3);
            }
        }
    }

    const results: StrettoChainResult[] = [];
    const partialResults: StrettoChainResult[] = []; // Store best partials
    const MAX_PARTIALS = 20;
    const deadEndStateCache = new Set<string>();
    
    async function solve(
        chain: StrettoChainOption[], 
        variantIndices: number[], 
        voiceEndTimes8: number[], 
        nInv: number, 
        nTrunc: number,
        nRestricted: number,
        nFree: number,
        usedLargeDelays: Set<number>
    ): Promise<boolean> {
        nodesVisited++;
        maxDepth = Math.max(maxDepth, chain.length);
        
        if (Date.now() - startTime > TIME_LIMIT_MS) {
            hitTimeout = true;
            return false;
        }
        if (results.length >= MAX_RESULTS * 10) return true; // Allow finding more chains before early termination
        if (nodesVisited > MAX_SEARCH_NODES) {
            hitNodeLimit = true;
            return false;
        }

        // If target reached, store result
        if (chain.length === options.targetChainLength) {
            const final = calculateStrettoScore(chain, variants, variantIndices, options, unitsPerBeat);
            if (final.isValid) results.push(final);
            return final.isValid;
        }

        // --- PARTIAL RESULTS LOGIC ---
        // If the chain is significant (>= 3 entries), consider storing it as a partial result
        if (chain.length >= 3) {
            // Simple heuristic: if we have few partials or this is longer than the worst stored partial
            if (partialResults.length < MAX_PARTIALS || chain.length > partialResults[partialResults.length-1].entries.length) {
                const final = calculateStrettoScore(chain, variants, variantIndices, options, unitsPerBeat);
                if (final.isValid) {
                    partialResults.push(final);
                    partialResults.sort((a,b) => b.entries.length - a.entries.length); // Keep longest
                    if (partialResults.length > MAX_PARTIALS) partialResults.pop();
                }
            }
        }

        const depth = chain.length; 
        const prevEntry = chain[depth - 1];
        const prevDelay8 = depth >= 2 ? Math.round((chain[depth-1].startBeat - chain[depth-2].startBeat) * unitsPerBeat) : -1;
        const prevPrevDelay8 = depth >= 3 ? Math.round((chain[depth-2].startBeat - chain[depth-3].startBeat) * unitsPerBeat) : -1;
        const stateKey = [
            depth,
            prevEntry.voiceIndex,
            Math.round(prevEntry.startBeat * unitsPerBeat),
            prevDelay8,
            prevPrevDelay8,
            nInv,
            nTrunc,
            nRestricted,
            nFree,
            voiceEndTimes8.join(','),
            Array.from(usedLargeDelays).sort((a, b) => a - b).join(',')
        ].join('|');
        if (deadEndStateCache.has(stateKey)) return false;
        
        // --- RULE 1 & 2: DELAY LOGIC (STRICT) ---
        const minD = 1;
        let maxD = maxDelay8;

        if (depth > 3) maxD = Math.min(maxD, halfCapDelay8);

        if (prevDelay8 >= 0 && prevPrevDelay8 >= 0 && prevDelay8 > prevPrevDelay8) {
            maxD = Math.min(maxD, prevDelay8 - 1);
        }

        if (prevDelay8 >= 0) {
            maxD = Math.min(maxD, prevDelay8 + unitsPerBeat);
        }

        if (maxD < minD) return false;

        const possibleDelays8 = validDelays.filter(d => d >= minD && d <= maxD);

        // Triple-lifted delay pruning: once we have at least 2 prior delay values,
        // only keep next delays that belong to precomputed valid delay-triples.
        if (depth >= 3) {
            const tripleKey = `${prevPrevDelay8}_${prevDelay8}`;
            const allowed = delayTripleMap.get(tripleKey);
            if (allowed) {
                for (let i = possibleDelays8.length - 1; i >= 0; i--) {
                    if (!allowed.has(possibleDelays8[i])) possibleDelays8.splice(i, 1);
                }
            }
        }
        possibleDelays8.sort((a,b) => a - b); 

        let foundCompletion = false;

        for (const delay8 of possibleDelays8) {
            if (depth >= 2 && delay8 === prevDelay8) continue;
            if (delay8 > Math.floor(subjectLength8 / 3) && usedLargeDelays.has(delay8)) continue;

            // Depth>4 strategy: build from compatible triple-blocks instead of blind single-step recursion.
            // If this new delay cannot be followed by at least one triple-lifted successor, skip now.
            if (depth > 4) {
                const nextTripleKey = `${prevDelay8}_${delay8}`;
                const continuations = delayTripleMap.get(nextTripleKey);
                if (!continuations || continuations.size === 0) continue;
            }

            const absStart8 = Math.round(prevEntry.startBeat * unitsPerBeat) + delay8;
            const absStartBeat = absStart8 / unitsPerBeat;

            const eligibleVoices: number[] = [];
            for (let v = 0; v < options.ensembleTotal; v++) {
                if (absStart8 >= voiceEndTimes8[v] - unitsPerBeat) eligibleVoices.push(v);
            }
            if (eligibleVoices.length === 0) continue;

            for (const t of transpositions) {
                // Stage A (interval-only): not all voices are eligible for each transposition.
                let intervalEligibleVoices = eligibleVoices.filter(v =>
                    isVoiceTranspositionCompatible(v, t, chain[0].voiceIndex, chain[0].transposition, options.ensembleTotal)
                );
                if (intervalEligibleVoices.length === 0) continue;

                // Stage B (pair restrictions): further constrain by most recent active pair context.
                if (chain.length >= 2) {
                    const last = chain[chain.length - 1];
                    intervalEligibleVoices = intervalEligibleVoices.filter(v =>
                        isVoiceTranspositionCompatible(v, t, last.voiceIndex, last.transposition, options.ensembleTotal)
                    );
                    if (intervalEligibleVoices.length === 0) continue;
                }

                // Stage C (triple restrictions): apply n vs n+2 distance-2 spacing rule
                // only when those entries actually overlap in time.
                if (chain.length >= 3) {
                    const thirdAnchor = chain[chain.length - 2];
                    const thirdAnchorVariant = variants[variantIndices[chain.length - 2]];
                    const thirdAnchorStart8 = Math.round(thirdAnchor.startBeat * unitsPerBeat);
                    const overlapsThirdAnchor = hasOverlap(
                        absStart8,
                        variants[0].length8,
                        thirdAnchorStart8,
                        thirdAnchorVariant.length8
                    );

                    if (overlapsThirdAnchor) {
                        intervalEligibleVoices = intervalEligibleVoices.filter(v =>
                            isVoiceTranspositionCompatible(v, t, thirdAnchor.voiceIndex, thirdAnchor.transposition, options.ensembleTotal)
                        );
                    }

                    if (intervalEligibleVoices.length === 0) continue;
                }

                for (const v of intervalEligibleVoices) {
                    let stratFail = false;
                    for (let existingIdx = 0; existingIdx < chain.length; existingIdx++) {
                        const e = chain[existingIdx];
                        if (!isVoiceTranspositionCompatible(v, t, e.voiceIndex, e.transposition, options.ensembleTotal)) {
                            stratFail = true;
                            break;
                        }
                    }
                    if (stratFail) continue;

                    for (let varIdx = 0; varIdx < variants.length; varIdx++) {
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
                            const prevStart8 = Math.round(prevE.startBeat * unitsPerBeat);
                            const prevEnd8 = prevStart8 + variants[prevVarIdx].length8;
                            
                            if (absStart8 < prevEnd8) {
                                const relDelay = absStart8 - prevStart8;
                                const relTrans = t - prevE.transposition;
                                const key = `${prevVarIdx}_${varIdx}_${relDelay}_${relTrans}`;
                                if (!compatTable.has(key)) {
                                    harmonicFail = true;
                                    break;
                                }
                            }
                        }
                        if (harmonicFail) continue;

                        const tempNextEntry: StrettoChainOption = {
                            startBeat: absStartBeat,
                            transposition: t,
                            type: variant.type,
                            length: variant.length8 * gridStep,
                            voiceIndex: v
                        };
                        
                        if (!checkMetricCompliance(variant, tempNextEntry, chain, variants, variantIndices, 4, 4, offset8, unitsPerBeat, 1)) {
                            continue;
                        }

                        const newVoiceState = [...voiceEndTimes8];
                        newVoiceState[v] = absStart8 + variant.length8;
                        
                        const nextChain = [...chain, tempNextEntry];

                        const nextUsedLargeDelays = new Set(usedLargeDelays);
                        if (delay8 > Math.floor(subjectLength8 / 3)) nextUsedLargeDelays.add(delay8);

                        const branchFound = await solve(
                            nextChain,
                            [...variantIndices, varIdx],
                            newVoiceState,
                            nInv + (isInv?1:0),
                            nTrunc + (isTrunc?1:0),
                            nextRestricted,
                            nextFree,
                            nextUsedLargeDelays
                        );
                        foundCompletion = foundCompletion || branchFound;
                    }
                }
            }
        }

        if (!foundCompletion) deadEndStateCache.add(stateKey);
        return foundCompletion;
    }
    
    const initialVoiceState = new Array(options.ensembleTotal).fill(0);
    initialVoiceState[options.subjectVoiceIndex] = variants[0].length8;
    
    await solve(
        [{ startBeat: 0, transposition: 0, type: 'N', length: variants[0].length8 * gridStep, voiceIndex: options.subjectVoiceIndex }],
        [0],
        initialVoiceState,
        0, 0, 0, 1,
        new Set<number>()
    );

    // Fallback: Use partial results if full results empty
    let sourceResults = results;
    let stopReason: StrettoSearchReport['stats']['stopReason'] = results.length > 0 ? 'Success' : 'Exhausted';
    
    if (results.length === 0 && partialResults.length > 0) {
        sourceResults = partialResults;
        stopReason = 'Partial'; // Indicates found chains are shorter than target
    } else if (results.length === 0 && hitTimeout) {
        stopReason = 'Timeout';
    } else if (results.length === 0 && hitNodeLimit) {
        stopReason = 'NodeLimit';
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
    return true;
}
