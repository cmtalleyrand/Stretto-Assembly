
import { RawNote, StrettoChainResult, StrettoSearchOptions, StrettoChainOption, StrettoConstraintMode, StrettoSearchReport } from '../../types';
import { INTERVALS, SCALE_INTERVALS } from './strettoConstants';
import { calculateStrettoScore, SubjectVariant, InternalNote } from './strettoScoring';
import { getInvertedPitch } from './strettoCore';

// --- Constants & Types ---
const MAX_SEARCH_NODES = 2000000; // Increased to allow deeper search
const TIME_LIMIT_MS = 30000;
const NEAR_COMPLETION_TIMEOUT_EXTENSION_MS = 10000;
const MAX_RESULTS = 50;
const EVENT_LOOP_YIELD_INTERVAL = 2048;

interface TripletKeyParts {
    variantA: number;
    variantB: number;
    variantC: number;
    delayAB: number;
    delayBC: number;
    transpositionAB: number;
    transpositionBC: number;
}

interface PairwiseCompatibilityRecord {
    dissonanceRatio: number;
    hasFourth: boolean;
    hasVoiceCrossing: boolean;
    maxDissonanceRunEvents: number;
}

export function shouldExtendTimeoutNearCompletion(maxDepthReached: number, targetChainLength: number): boolean {
    return maxDepthReached >= Math.max(1, targetChainLength - 1);
}

function roundToWholePercent(value: number): number {
    return Math.round(value * 100);
}

export function toCanonicalTripletKey(parts: TripletKeyParts): string {
    return `${parts.variantA}|${parts.variantB}|${parts.variantC}|${parts.delayAB}|${parts.delayBC}|${parts.transpositionAB}|${parts.transpositionBC}`;
}

export function toBoundaryPairKey(left: StrettoChainOption, right: StrettoChainOption, ppq: number): string {
    const leftStart = Math.round(left.startBeat * ppq);
    const rightStart = Math.round(right.startBeat * ppq);
    const delayTicks = rightStart - leftStart;
    const transpositionDelta = right.transposition - left.transposition;
    return `${left.voiceIndex}:${left.type}->${right.voiceIndex}:${right.type}|d${delayTicks}|t${transpositionDelta}`;
}

export function toOrderedBoundarySignature(chain: StrettoChainOption[], ppq: number): string {
    if (chain.length < 2) return 'root';
    const boundaries: string[] = [];
    for (let i = 1; i < chain.length; i++) {
        // Preserve temporal order: expansion predicates depend on immediate predecessor state.
        boundaries.push(`${i - 1}>${i}:${toBoundaryPairKey(chain[i - 1], chain[i], ppq)}`);
    }
    return boundaries.join('||');
}

export function violatesPairwiseLowerBound(record: PairwiseCompatibilityRecord, maxPairwiseDissonance: number): boolean {
    return record.maxDissonanceRunEvents > 2 || record.dissonanceRatio > maxPairwiseDissonance;
}

export function resolveNextFrontierLayer<T>(nextLayer: Map<string, T>, stopTraversal: boolean): T[] {
    return stopTraversal ? [] : Array.from(nextLayer.values());
}

export function shouldYieldToEventLoop(iteration: number, interval: number = EVENT_LOOP_YIELD_INTERVAL): boolean {
    return iteration > 0 && iteration % interval === 0;
}
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
    maxDissonanceRatio: number,
    ppqParam: number = 480
): { compatible: boolean, dissonanceRatio: number, strongBeatParallels: number, weakBeatParallels: number, hasFourth: boolean, hasVoiceCrossing: boolean, maxDissonanceRunEvents: number } {
    
    // Collect all time points
    const timePoints = new Set<number>();
    
    interface SortedNote {
        start: number;
        end: number;
        pitch: number;
    }

    // Pre-sort notes by start tick for sweep-line pointer advancement
    const notesA: SortedNote[] = variantA.notes.map(n => ({
        start: n.relTick,
        end: n.relTick + n.durationTicks,
        pitch: n.pitch
    })).sort((a, b) => a.start - b.start);

    const notesB: SortedNote[] = variantB.notes.map(n => ({
        start: n.relTick + delayTicks,
        end: n.relTick + delayTicks + n.durationTicks,
        pitch: n.pitch + transposition
    })).sort((a, b) => a.start - b.start);

    for (const n of notesA) { timePoints.add(n.start); timePoints.add(n.end); }
    for (const n of notesB) { timePoints.add(n.start); timePoints.add(n.end); }

    const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

    let prevP1: number | null = null;
    let prevP2: number | null = null;

    let dissRunLength = 0;
    let lastIsDiss = false;

    let overlapTicks = 0;
    let dissonantTicks = 0;
    let strongBeatParallels = 0;
    let weakBeatParallels = 0;
    let hasFourth = false;
    let hasVoiceCrossing = false;
    let previousOrderingSign = 0;
    let maxDissonanceRunEvents = 0;

    // Sweep-line pointers
    let ptrA = 0;
    let ptrB = 0;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const dur = end - start;
        if (dur <= 0) continue;

        // Advance pointers to find active note at 'start'
        while (ptrA < notesA.length - 1 && notesA[ptrA].end <= start) ptrA++;
        while (ptrB < notesB.length - 1 && notesB[ptrB].end <= start) ptrB++;

        const activeA = (ptrA < notesA.length && notesA[ptrA].start <= start && notesA[ptrA].end > start) ? notesA[ptrA] : null;
        const activeB = (ptrB < notesB.length && notesB[ptrB].start <= start && notesB[ptrB].end > start) ? notesB[ptrB] : null;

        if (!activeA || !activeB) {
            prevP1 = null; prevP2 = null;
            dissRunLength = 0;
            lastIsDiss = false;
            continue;
        }

        overlapTicks += dur;

        const p1 = activeA.pitch;
        const p2 = activeB.pitch;
        const orderingSign = Math.sign(p1 - p2);
        if (orderingSign !== 0) {
            if (previousOrderingSign !== 0 && previousOrderingSign !== orderingSign) hasVoiceCrossing = true;
            previousOrderingSign = orderingSign;
        }
        const lo = Math.min(p1, p2);
        const hi = Math.max(p1, p2);
        const interval = (hi - lo) % 12;
        if (interval === 5) hasFourth = true;

        // Rule 5: Parallel Perfects — flag by beat strength, don't hard-reject
        if (prevP1 !== null && prevP2 !== null) {
            const p1Moved = p1 !== prevP1;
            const p2Moved = p2 !== prevP2;

            if (p1Moved && p2Moved) {
                if (PERFECT_INTERVALS.has(interval)) {
                    const prevLo = Math.min(prevP1, prevP2);
                    const prevHi = Math.max(prevP1, prevP2);
                    const prevInt = (prevHi - prevLo) % 12;
                    if (prevInt === interval) {
                        if (isStrongBeat(start, ppqParam)) {
                            strongBeatParallels++;
                        } else {
                            weakBeatParallels++;
                        }
                    }
                }
            }
        }
        
        // Rule 6: Dissonance (Structural) — include P4 (interval 5) as dissonant
        let isDiss = INTERVALS.DISSONANT_SIMPLE.has(interval) || interval === 5;
        
        if (isDiss) {
            dissonantTicks += dur;
            
            // For run length, we count *events* (intervals), not ticks
            if (!lastIsDiss) dissRunLength = 1;
            else dissRunLength++;
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);

            // Rule C2: Event Limit (r <= 2)
            if (dissRunLength > 2) return { compatible: false, dissonanceRatio: 1, strongBeatParallels, weakBeatParallels, hasFourth, hasVoiceCrossing, maxDissonanceRunEvents };

            lastIsDiss = true;
        } else {
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);
            dissRunLength = 0;
            lastIsDiss = false;
        }

        prevP1 = p1; prevP2 = p2;
    }

    // Strict Dissonance Ratio Filter
    if (overlapTicks > 0) {
        const ratio = dissonantTicks / overlapTicks;
        if (ratio > maxDissonanceRatio) return { compatible: false, dissonanceRatio: ratio, strongBeatParallels, weakBeatParallels, hasFourth, hasVoiceCrossing, maxDissonanceRunEvents };
    }

    maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);
    return { compatible: true, dissonanceRatio: overlapTicks > 0 ? dissonantTicks / overlapTicks : 0, strongBeatParallels, weakBeatParallels, hasFourth, hasVoiceCrossing, maxDissonanceRunEvents };
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

    // Pre-build a flat list of (startTick, endTick, absolutePitch) for every note in every
    // voice (new entry + entire chain). Built once here so the P4-vs-bass lookup inside the
    // pairwise loop is a single linear scan over a cached array rather than a repeated
    // re-traversal of the chain.  Treating P4 as dissonant against the bass prunes branches:
    // when the bass-P4 makes `isDiss = true`, the existing dissonance-run counter fires and
    // returns false immediately, cutting that branch from the search tree.
    type NoteEvent = [number, number, number]; // [start, end, pitch]
    const allNoteEvents: NoteEvent[] = [];
    for (const n of newVariant.notes) {
        allNoteEvents.push([newStartTick + n.relTick, newStartTick + n.relTick + n.durationTicks, n.pitch + newEntry.transposition]);
    }
    for (let k = 0; k < chain.length; k++) {
        const eStart = Math.round(chain[k].startBeat * ppq);
        for (const n of variants[variantIndices[k]].notes) {
            allNoteEvents.push([eStart + n.relTick, eStart + n.relTick + n.durationTicks, n.pitch + chain[k].transposition]);
        }
    }
    // Returns the lowest absolute pitch active at `tick` across all voices, or Infinity if none.
    const overallBassAt = (tick: number): number => {
        let min = Infinity;
        for (const [s, e, p] of allNoteEvents) { if (s <= tick && e > tick && p < min) min = p; }
        return min;
    };

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

        // Pre-sort placed notes for sweep-line
        const placedNew = newVariant.notes.map(n => ({
            start: newStartTick + n.relTick,
            end: newStartTick + n.relTick + n.durationTicks,
            pitch: n.pitch
        })).sort((a, b) => a.start - b.start);
        const placedExist = existVariant.notes.map(n => ({
            start: existStartTick + n.relTick,
            end: existStartTick + n.relTick + n.durationTicks,
            pitch: n.pitch
        })).sort((a, b) => a.start - b.start);

        let pNew = 0;
        let pExist = 0;
        let dissRunLength = 0;
        let lastIsDiss = false;

        for (let i = 0; i < sortedPoints.length - 1; i++) {
            const start = sortedPoints[i];
            const end = sortedPoints[i+1];

            // Advance sweep-line pointers
            while (pNew < placedNew.length - 1 && placedNew[pNew].end <= start) pNew++;
            while (pExist < placedExist.length - 1 && placedExist[pExist].end <= start) pExist++;

            const noteNew = (pNew < placedNew.length && placedNew[pNew].start <= start && placedNew[pNew].end > start) ? placedNew[pNew] : null;
            const noteExist = (pExist < placedExist.length && placedExist[pExist].start <= start && placedExist[pExist].end > start) ? placedExist[pExist] : null;
            
            if (!noteNew || !noteExist) {
                dissRunLength = 0; lastIsDiss = false; continue;
            }

            const p1 = noteNew.pitch + newEntry.transposition;
            const p2 = noteExist.pitch + existEntry.transposition;
            const lo = Math.min(p1, p2);
            const hi = Math.max(p1, p2);
            const interval = (hi - lo) % 12;

            let isDiss = INTERVALS.DISSONANT_SIMPLE.has(interval);

            // P4 (5 semitones) is consonant between upper voices but dissonant above the bass.
            // Use the precomputed allNoteEvents to find the lowest active pitch at this tick.
            // If the lower note of the P4 IS the bass, mark it dissonant so the run-limit
            // check below can prune the branch immediately.
            if (!isDiss && interval === 5 && lo === overallBassAt(start)) isDiss = true;

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

    const toPairKey = (vA: number, vB: number, d: number, t: number): string => `${vA}_${vB}_${d}_${t}`;
    const toTripleKey = (vA: number, vB: number, vC: number, d1: number, d2: number, t1: number, t2: number): string => toCanonicalTripletKey({
        variantA: vA,
        variantB: vB,
        variantC: vC,
        delayAB: d1,
        delayBC: d2,
        transpositionAB: t1,
        transpositionBC: t2
    });
    
    const startTime = Date.now();
    let nodesVisited = 0;
    let edgesTraversed = 0;
    let maxDepth = 0;
    let operationCounter = 0;
    let activeTimeLimitMs = TIME_LIMIT_MS;
    let timeoutExtensionAppliedMs = 0;
    let terminationReason: StrettoSearchReport['stats']['stopReason'] | null = null;
    
    const { notes: baseNotes, offsetTicks } = normalizeSubject(rawSubject, ppq);
    if (baseNotes.length === 0) {
        return {
            results: [],
            stats: {
                nodesVisited: 0,
                timeMs: 0,
                stopReason: 'Exhausted',
                maxDepthReached: 0,
                stageStats: {
                    validDelayCount: 0,
                    transpositionCount: 0,
                    pairwiseTotal: 0,
                    pairwiseCompatible: 0,
                    pairwiseWithFourth: 0,
                    pairwiseWithVoiceCrossing: 0,
                    tripleCandidates: 0,
                    triplePairwiseRejected: 0,
                    tripleLowerBoundRejected: 0,
                    tripleVoiceRejected: 0,
                    harmonicallyValidTriples: 0,
                    deterministicDagMergedNodes: 0
                }
            }
        };
    }
    
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

    const pairwiseCompatibleTriplets = new Map<string, PairwiseCompatibilityRecord>();
    const validDelays: number[] = [];
    const maxDelayTicks = Math.floor(subjectLengthTicks * (2/3));
    
    // Delays happen in half-beat intervals (8th notes)
    const delayStep = ppq / 2; 
    for (let d = delayStep; d <= maxDelayTicks; d += delayStep) validDelays.push(d);
    
    const transpositions = Array.from(INTERVALS.TRAD_TRANSPOSITIONS);
    if (options.thirdSixthMode !== 'None') {
        INTERVALS.THIRD_SIXTH_TRANSPOSITIONS.forEach(t => transpositions.push(t));
    }
    
    const stageStats = {
        validDelayCount: validDelays.length,
        transpositionCount: transpositions.length,
        pairwiseTotal: 0,
        pairwiseCompatible: 0,
        pairwiseWithFourth: 0,
        pairwiseWithVoiceCrossing: 0,
        tripleCandidates: 0,
        triplePairwiseRejected: 0,
        tripleLowerBoundRejected: 0,
        tripleVoiceRejected: 0,
        harmonicallyValidTriples: 0,
        deterministicDagMergedNodes: 0
    };

    // Phase 1: STRUCTURAL PAIRWISE PRECOMPUTATION
    for (let iA = 0; iA < variants.length; iA++) {
        const vA = variants[iA];
        for (let iB = 0; iB < variants.length; iB++) {
            const vB = variants[iB];
            for (const d of validDelays) {
                for (const t of transpositions) {
                    stageStats.pairwiseTotal++;
                    operationCounter++;
                    if (shouldYieldToEventLoop(operationCounter)) {
                        await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    }
                    const key = toPairKey(iA, iB, d, t);
                    const res = checkCounterpointStructure(vA, vB, d, t, options.maxPairwiseDissonance + 0.05, ppq);
                    if (res.compatible) {
                        pairwiseCompatibleTriplets.set(key, {
                            dissonanceRatio: res.dissonanceRatio,
                            hasFourth: res.hasFourth,
                            hasVoiceCrossing: res.hasVoiceCrossing,
                            maxDissonanceRunEvents: res.maxDissonanceRunEvents
                        });
                        stageStats.pairwiseCompatible++;
                        if (res.hasFourth) stageStats.pairwiseWithFourth++;
                        if (res.hasVoiceCrossing) stageStats.pairwiseWithVoiceCrossing++;
                    }
                }
            }
        }
    }

    // --- PRECOMPUTE TRIPLES ---
    const harmonicallyValidTriples = new Set<string>();
    const validPairsList: {vA: number, vB: number, d: number, t: number}[] = [];
    pairwiseCompatibleTriplets.forEach((_, key) => {
        const [vA, vB, d, t] = key.split('_').map(Number);
        validPairsList.push({vA, vB, d, t});
    });

    const pairsByFirst = new Map<number, typeof validPairsList>();
    for (const p of validPairsList) {
        if (!pairsByFirst.has(p.vA)) pairsByFirst.set(p.vA, []);
        pairsByFirst.get(p.vA)!.push(p);
    }

    for (const p1 of validPairsList) {
        const keyAB = toPairKey(p1.vA, p1.vB, p1.d, p1.t);
        const pairAB = pairwiseCompatibleTriplets.get(keyAB);
        if (!pairAB) continue;

        const nextPairs = pairsByFirst.get(p1.vB) || [];
        for (const p2 of nextPairs) {
            stageStats.tripleCandidates++;
            operationCounter++;
            if (shouldYieldToEventLoop(operationCounter)) {
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
            const keyBC = toPairKey(p2.vA, p2.vB, p2.d, p2.t);
            const pairBC = pairwiseCompatibleTriplets.get(keyBC);
            if (!pairBC) continue;

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
                const keyAC = toPairKey(vA, vC, dAC, tAC);
                const pairAC = pairwiseCompatibleTriplets.get(keyAC);
                if (!pairAC) {
                    stageStats.triplePairwiseRejected++;
                    continue;
                }
                if (violatesPairwiseLowerBound(pairAB, options.maxPairwiseDissonance) || violatesPairwiseLowerBound(pairBC, options.maxPairwiseDissonance) || violatesPairwiseLowerBound(pairAC, options.maxPairwiseDissonance)) {
                    stageStats.tripleLowerBoundRejected++;
                    continue;
                }
            } else if (violatesPairwiseLowerBound(pairAB, options.maxPairwiseDissonance) || violatesPairwiseLowerBound(pairBC, options.maxPairwiseDissonance)) {
                stageStats.tripleLowerBoundRejected++;
                continue;
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
            
            if (!possibleAssignment) {
                stageStats.tripleVoiceRejected++;
                continue;
            }
            
            const key = toTripleKey(vA, p1.vB, vC, d1, d2, p1.t, p2.t);
            harmonicallyValidTriples.add(key);
            stageStats.harmonicallyValidTriples++;
        }
    }

    // Deferred scoring: store unscored chains during search, score after
    interface UnscoredChain {
        entries: StrettoChainOption[];
        variantIndices: number[];
    }
    const unscoredResults: UnscoredChain[] = [];
    const unscoredPartials: UnscoredChain[] = [];
    const MAX_PARTIALS = 500; // Cap partial buffer to avoid OOM in difficult searches
    const seenPartialSigs = new Set<string>();

    const seenSignatures = new Set<string>();
    // Collision-free structural string key for deduplication
    function getChainSignature(c: StrettoChainOption[]): string {
        let sig = '';
        for (let i = 1; i < c.length; i++) {
            sig += (Math.round(c[i].startBeat * ppq) - Math.round(c[i - 1].startBeat * ppq));
            sig += ',';
        }
        sig += '|';
        for (let i = 0; i < c.length; i++) {
            sig += ((c[i].transposition % 12 + 12) % 12);
            sig += c[i].type;
        }
        return sig;
    }

    interface DagNode {
        chain: StrettoChainOption[];
        variantIndices: number[];
        voiceEndTimesTicks: number[];
        nInv: number;
        nTrunc: number;
        nRestricted: number;
        nFree: number;
    }

    function getBoundarySignature(chain: StrettoChainOption[]): string {
        return toOrderedBoundarySignature(chain, ppq);
    }

    function getDagNodeKey(node: DagNode): string {
        const chainSig = getChainSignature(node.chain);
        const boundarySig = getBoundarySignature(node.chain);
        return `${chainSig}|${boundarySig}|v:${node.voiceEndTimesTicks.join(',')}|q:${node.nInv},${node.nTrunc},${node.nRestricted},${node.nFree}`;
    }

    function expandNode(node: DagNode): DagNode[] {
        const successors: DagNode[] = [];
        const { chain, variantIndices, voiceEndTimesTicks, nInv, nTrunc, nRestricted, nFree } = node;
        const depth = chain.length;
        const prevEntry = chain[depth - 1];

        const isFinalThird = depth >= options.targetChainLength - Math.ceil(options.targetChainLength / 3);
        const prevEntryLengthTicks = chain[depth - 1].length;

        const possibleDelaysTicks: number[] = [];
        let minD = delayStep;
        let maxD = Math.floor(prevEntryLengthTicks * (2 / 3));

        if (depth === 1) {
            minD = Math.floor(prevEntryLengthTicks * 0.5);
        } else if (depth > 1) {
            const prevDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
            const prevSubjectLengthTicks = chain[depth - 1].length;

            if (prevDelayTicks > (prevSubjectLengthTicks / 2)) maxD = Math.min(maxD, prevDelayTicks - delayStep);
            else maxD = Math.min(maxD, prevDelayTicks + delayStep);

            if (depth >= 3) {
                const prevPrevDelayTicks = Math.round(chain[depth - 2].startBeat * ppq) - Math.round(chain[depth - 3].startBeat * ppq);
                if (prevDelayTicks > prevPrevDelayTicks && prevDelayTicks > (prevSubjectLengthTicks / 3)) {
                    maxD = Math.min(maxD, prevPrevDelayTicks - delayStep);
                }
            }

            const prevIsTruncated = chain[depth - 1].length < chain[0].length;
            if (prevIsTruncated && prevDelayTicks >= (prevSubjectLengthTicks / 3)) {
                maxD = Math.min(maxD, prevDelayTicks - (2 * delayStep));
            }
        }

        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;
        for (let d = minD; d <= maxD; d += delayStep) possibleDelaysTicks.push(d);
        possibleDelaysTicks.sort((a, b) => a - b);

        for (const delayTicks of possibleDelaysTicks) {
            if (depth >= 2) {
                const prevDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
                if (Math.abs(delayTicks - prevDelayTicks) < 1) {
                    const isDelayShort = prevDelayTicks <= (prevEntryLengthTicks / 3);
                    if (!(isFinalThird && isDelayShort)) continue;
                }
            }

            const absStartTicks = Math.round(prevEntry.startBeat * ppq) + delayTicks;
            const absStartBeat = absStartTicks / ppq;

            const seenClasses = new Set<number>();
            const fresh: number[] = [];
            const deferred: number[] = [];
            const prevTransposition = chain[chain.length - 1].transposition;
            for (const t of transpositions) {
                const tClass = ((t - prevTransposition) % 12 + 12) % 12;
                if (seenClasses.has(tClass)) {
                    deferred.push(t);
                    continue;
                }
                if (t === prevTransposition) {
                    fresh.push(t);
                    continue;
                }
                fresh.push(t);
                seenClasses.add(tClass);
            }
            const orderedTranspositions = [...fresh, ...deferred];

            for (const t of orderedTranspositions) {
                if (t === prevTransposition) continue;

                for (let varIdx = 0; varIdx < variants.length; varIdx++) {
                    if (depth >= 2) {
                        const vA = variantIndices[depth - 2];
                        const vB = variantIndices[depth - 1];
                        const vC = varIdx;
                        const d1 = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
                        const d2 = delayTicks;
                        const t1 = chain[depth - 1].transposition - chain[depth - 2].transposition;
                        const t2 = t - chain[depth - 1].transposition;
                        const tripleKey = toTripleKey(vA, vB, vC, d1, d2, t1, t2);
                        if (!harmonicallyValidTriples.has(tripleKey)) continue;
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
                    if (isRestricted && !checkQuota(options.thirdSixthMode, nRestricted)) continue;
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
                            const key = toPairKey(prevVarIdx, varIdx, relDelay, relTrans);
                            if (!pairwiseCompatibleTriplets.has(key)) {
                                harmonicFail = true;
                                break;
                            }
                        }
                    }
                    if (harmonicFail) continue;

                    for (let v = 0; v < options.ensembleTotal; v++) {
                        if (absStartTicks < voiceEndTimesTicks[v] - ppq) continue;

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

                        if (!checkMetricCompliance(variant, tempNextEntry, chain, variants, variantIndices, ppq, offsetTicks)) continue;

                        const newVoiceState = [...voiceEndTimesTicks];
                        newVoiceState[v] = absStartTicks + variant.lengthTicks;

                        edgesTraversed++;
                        successors.push({
                            chain: [...chain, tempNextEntry],
                            variantIndices: [...variantIndices, varIdx],
                            voiceEndTimesTicks: newVoiceState,
                            nInv: nInv + (isInv ? 1 : 0),
                            nTrunc: nTrunc + (isTrunc ? 1 : 0),
                            nRestricted: nextRestricted,
                            nFree: nextFree
                        });
                    }
                }
            }
        }

        return successors;
    }

    const initialVoiceState = new Array(options.ensembleTotal).fill(0);
    initialVoiceState[options.subjectVoiceIndex] = variants[0].lengthTicks;

    let frontier: DagNode[] = [{
        chain: [{ startBeat: 0, transposition: 0, type: 'N', length: variants[0].lengthTicks, voiceIndex: options.subjectVoiceIndex }],
        variantIndices: [0],
        voiceEndTimesTicks: initialVoiceState,
        nInv: 0,
        nTrunc: 0,
        nRestricted: 0,
        nFree: 1
    }];

    let maxFrontierSize = frontier.length;
    let maxFrontierClassCount = 1;

    const frontierClassKey = (chain: StrettoChainOption[]): string => {
        if (chain.length < 2) return 'root';
        const delays: number[] = [];
        for (let i = 1; i < chain.length; i++) {
            delays.push(Math.round((chain[i].startBeat - chain[i - 1].startBeat) * ppq));
        }
        return delays.join(',');
    };

    while (frontier.length > 0) {
        maxFrontierSize = Math.max(maxFrontierSize, frontier.length);
        const frontierClasses = new Set(frontier.map((n) => frontierClassKey(n.chain)));
        maxFrontierClassCount = Math.max(maxFrontierClassCount, frontierClasses.size);

        frontier.sort((a, b) => getChainSignature(a.chain).localeCompare(getChainSignature(b.chain)));
        const nextLayer = new Map<string, DagNode>();
        let stopTraversal = false;

        for (const node of frontier) {
            nodesVisited++;
            operationCounter++;
            maxDepth = Math.max(maxDepth, node.chain.length);

            if (shouldYieldToEventLoop(operationCounter)) {
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }

            if (Date.now() - startTime > activeTimeLimitMs) {
                const canExtend = timeoutExtensionAppliedMs === 0 && shouldExtendTimeoutNearCompletion(maxDepth, options.targetChainLength);
                if (canExtend) {
                    timeoutExtensionAppliedMs = NEAR_COMPLETION_TIMEOUT_EXTENSION_MS;
                    activeTimeLimitMs += timeoutExtensionAppliedMs;
                } else {
                    if (!terminationReason) terminationReason = 'Timeout';
                    stopTraversal = true;
                    break;
                }
            }
            if (nodesVisited > MAX_SEARCH_NODES) {
                if (!terminationReason) terminationReason = 'NodeLimit';
                stopTraversal = true;
                break;
            }

            if (node.chain.length === options.targetChainLength) {
                const sig = getChainSignature(node.chain);
                if (!seenSignatures.has(sig)) {
                    seenSignatures.add(sig);
                    unscoredResults.push({ entries: [...node.chain], variantIndices: [...node.variantIndices] });
                }
                continue;
            }

            if (node.chain.length >= 3 && unscoredPartials.length < MAX_PARTIALS) {
                const sig = getChainSignature(node.chain);
                if (!seenPartialSigs.has(sig)) {
                    seenPartialSigs.add(sig);
                    unscoredPartials.push({ entries: [...node.chain], variantIndices: [...node.variantIndices] });
                }
            }

            const successors = expandNode(node);
            for (const successor of successors) {
                const nodeKey = getDagNodeKey(successor);
                if (nextLayer.has(nodeKey)) {
                    stageStats.deterministicDagMergedNodes++;
                    continue;
                }
                nextLayer.set(nodeKey, successor);
            }
        }

        frontier = resolveNextFrontierLayer(nextLayer, stopTraversal);
    }

    // --- POST-SEARCH: Score all found chains ---
    let sourceUnscored = unscoredResults;
    let stopReason: StrettoSearchReport['stats']['stopReason'] = unscoredResults.length > 0 ? 'Success' : (terminationReason || 'Exhausted');

    // Fallback to partials if no full-length results
    if (unscoredResults.length === 0 && unscoredPartials.length > 0) {
        sourceUnscored = unscoredPartials;
        if (!terminationReason) stopReason = 'Exhausted';
    }

    // Score all candidates (deferred from search)
    const scoredResults: StrettoChainResult[] = [];
    for (const uc of sourceUnscored) {
        const scored = calculateStrettoScore(uc.entries, variants, uc.variantIndices, options, ppq);
        if (scored.isValid) {
            scoredResults.push(scored);
        }
    }

    // Group by delay pattern + type sequence to avoid similar chains clogging display
    function getGroupKey(entries: StrettoChainOption[]): string {
        const delayPattern: number[] = [];
        for (let i = 1; i < entries.length; i++) {
            delayPattern.push(Math.round((entries[i].startBeat - entries[i - 1].startBeat) * ppq));
        }
        const typeSeq = entries.map(e => e.type).join('');
        return `${delayPattern.join(',')}|${typeSeq}`;
    }

    const groupedMap = new Map<string, StrettoChainResult[]>();
    for (const res of scoredResults) {
        const key = getGroupKey(res.entries);
        if (!groupedMap.has(key)) groupedMap.set(key, []);
        groupedMap.get(key)!.push(res);
    }

    const finalResults: StrettoChainResult[] = [];
    groupedMap.forEach((group) => {
        group.sort((a, b) => b.score - a.score);
        const leader = group[0];
        if (group.length > 1) {
            leader.variations = group.slice(1);
        }
        finalResults.push(leader);
    });

    return {
        results: finalResults.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS),
        stats: {
            nodesVisited,
            edgesTraversed,
            timeMs: Date.now() - startTime,
            stopReason: stopReason,
            maxDepthReached: maxDepth,
            timeoutExtensionAppliedMs,
            coverage: {
                nodeBudgetUsedPercent: roundToWholePercent(Math.min(1, nodesVisited / MAX_SEARCH_NODES)),
                maxFrontierSize,
                maxFrontierClassCount
            },
            stageStats
        }
    };
}

function checkQuota(mode: StrettoConstraintMode, current: number): boolean {
    if (mode === 'None') return false;
    if (typeof mode === 'number') return current < mode;
    return true; // Unlimited
}
