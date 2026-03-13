
import { RawNote, StrettoChainResult, StrettoSearchOptions, StrettoChainOption, StrettoConstraintMode, StrettoSearchReport } from '../../types';
import { INTERVALS, SCALE_INTERVALS } from './strettoConstants';
import { calculateStrettoScore, SubjectVariant, InternalNote } from './strettoScoring';
import { getInvertedPitch } from './strettoCore';

// --- Constants & Types ---
const MAX_SEARCH_NODES = 2000000; // Increased to allow deeper search
const DEFAULT_TIME_LIMIT_MS = 30000;
const NEAR_COMPLETION_TIMEOUT_EXTENSION_MS = 10000;
const MAX_RESULTS = 50;
const EVENT_LOOP_YIELD_INTERVAL = 2048;
const EARLY_WINDOW_OPTIMIZATION_MAX_ENTRY = 7;

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
    p4SimultaneityCount: number;
    hasVoiceCrossing: boolean;
    maxDissonanceRunEvents: number;
    maxDissonanceRunTicks?: number;
    maxAllowedContinuousDissonanceTicks?: number;
    hasParallelPerfect58: boolean;
    // Span locations where dissonant simultaneities occur in pairwise scan coordinates.
    dissonanceSpans?: SimultaneitySpan[];
    // Span locations where P4 simultaneities occur in pairwise scan coordinates.
    p4Spans?: SimultaneitySpan[];
    // Tick locations where disallowed parallel-perfect motion starts are observed.
    parallelPerfectStartTicks?: number[];
    disallowLowestPair: boolean;
    allowedVoicePairs: Set<string>;
    // Per-bass-role compatibility: precomputed so traversal never re-scans.
    bassRoleCompatible: { none: boolean; a: boolean; b: boolean };
    // Per-bass-role dissonance detail for P4-as-bass resolution.
    bassRoleDissonanceRatio: { none: number; a: number; b: number };
    bassRoleMaxRunEvents: { none: number; a: number; b: number };
    // Interval class of the transposition (mod 12), precomputed for quota checks.
    intervalClass: number;
    isRestrictedInterval: boolean;
    isFreeInterval: boolean;
    meetsAdjacentTranspositionSeparation: boolean;
}

type WindowKey = string;

interface WindowKeyParts {
    variantLeft: number;
    variantRight: number;
    delayTicks: number;
    transpositionDelta: number;
}

interface NextTransition {
    delayTicks: number;
    nextVariantIndex: number;
    transpositionDelta: number;
    // Present for window-indexed transitions used during deep expansion.
    pairRecord?: PairwiseCompatibilityRecord;
    isRestrictedInterval?: boolean;
    isFreeInterval?: boolean;
    // Present for boundary/root transition caches used before full overlap collection.
    isInv?: boolean;
    isTrunc?: boolean;
    isRestricted?: boolean;
    isFree?: boolean;
}

type PairwiseBassRole = 'none' | 'a' | 'b';

interface SimultaneitySpan {
    startTick: number;
    endTick: number;
}

interface PairwiseScanResult {
    compatible: boolean;
    dissonanceRatio: number;
    strongBeatParallels: number;
    weakBeatParallels: number;
    hasFourth: boolean;
    p4SimultaneityCount: number;
    hasVoiceCrossing: boolean;
    maxDissonanceRunEvents: number;
    maxDissonanceRunTicks: number;
    hasParallelPerfect58: boolean;
    dissonanceSpans: SimultaneitySpan[];
    p4Spans: SimultaneitySpan[];
    parallelPerfectStartTicks: number[];
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
    const maxAllowedContinuousDissonanceTicks = record.maxAllowedContinuousDissonanceTicks ?? 480;
    const runTicks = record.maxDissonanceRunTicks ?? 0;
    return record.maxDissonanceRunEvents > 2 || runTicks > maxAllowedContinuousDissonanceTicks || record.dissonanceRatio > maxPairwiseDissonance;
}

export function resolveNextFrontierLayer<T>(nextLayer: Map<string, T>, stopTraversal: boolean): T[] {
    return stopTraversal ? [] : Array.from(nextLayer.values());
}

export function shouldYieldToEventLoop(iteration: number, interval: number = EVENT_LOOP_YIELD_INTERVAL): boolean {
    return iteration > 0 && iteration % interval === 0;
}

function appendUniqueCapped(target: number[], source: number[] | undefined, cap: number = 256): void {
    if (!source || source.length === 0 || target.length >= cap) return;
    for (const tick of source) {
        if (target.length >= cap) break;
        if (!target.includes(tick)) target.push(tick);
    }
}

function appendUniqueSpansCapped(target: SimultaneitySpan[], source: SimultaneitySpan[] | undefined, cap: number = 256): void {
    if (!source || source.length === 0 || target.length >= cap) return;
    for (const span of source) {
        if (target.length >= cap) break;
        if (!target.some((s) => s.startTick === span.startTick && s.endTick === span.endTick)) {
            target.push(span);
        }
    }
}

interface StageStats {
    validDelayCount: number;
    transpositionCount: number;
    pairwiseTotal: number;
    pairwiseCompatible: number;
    pairwiseWithFourth: number;
    pairwiseWithVoiceCrossing: number;
    pairwiseP4TwoVoiceDissonant: number;
    pairwiseParallelRejected: number;
    tripleCandidates: number;
    triplePairwiseRejected: number;
    tripleLowerBoundRejected: number;
    tripleParallelRejected: number;
    tripleVoiceRejected: number;
    tripleP4BassRejected: number;
    harmonicallyValidTriples: number;
    deterministicDagMergedNodes: number;
    pairStageRejected: number;
    tripletStageRejected: number;
    globalLineageStageRejected: number;
    structuralScanInvocations: number;
    dissonanceSpans: SimultaneitySpan[];
    p4Spans: SimultaneitySpan[];
    parallelPerfectLocationTicks: number[];
    transitionWindowLookups: number;
    transitionsReturned: number;
    candidateTransitionsEnumerated: number;
}

type TransitionRuleClass = 'local' | 'prefix-global' | 'terminal/output';

interface RuleClassification {
    name: string;
    class: TransitionRuleClass;
}

const TRANSITION_RULE_CLASSIFICATIONS: RuleClassification[] = [
    { name: 'pairwise structural compatibility', class: 'local' },
    { name: 'adjacent transposition separation', class: 'local' },
    { name: 'triplet harmonic compatibility', class: 'local' },
    { name: 'structural transform adjacency (inv/trunc repetition)', class: 'local' },
    { name: 'delay-shape constraints (max expansion / anti-stagnation)', class: 'local' },
    { name: 'long-delay uniqueness', class: 'prefix-global' },
    { name: 'voice occupancy and pair-role admissibility', class: 'prefix-global' },
    { name: 'quota and exception policies', class: 'prefix-global' },
    { name: 'metric compliance and final scoring', class: 'terminal/output' }
];

export function passesPairStage(stageStats: StageStats, predicate: boolean): boolean {
    if (!predicate) {
        stageStats.pairStageRejected++;
        return false;
    }
    return true;
}

export function passesTripletStage(stageStats: StageStats, predicate: boolean): boolean {
    if (!predicate) {
        stageStats.tripletStageRejected++;
        return false;
    }
    return true;
}

export function passesGlobalLineageStage(stageStats: StageStats, predicate: boolean): boolean {
    if (!predicate) {
        stageStats.globalLineageStageRejected++;
        return false;
    }
    return true;
}

function runStructuralScanGuard<T>(
    stageStats: StageStats,
    pairPredicate: boolean,
    tripletPredicate: boolean,
    globalLineagePredicate: boolean,
    scan: () => T
): T | null {
    if (!passesPairStage(stageStats, pairPredicate)) return null;
    if (!passesTripletStage(stageStats, tripletPredicate)) return null;
    if (!passesGlobalLineageStage(stageStats, globalLineagePredicate)) return null;
    stageStats.structuralScanInvocations++;
    return scan();
}
// --- Precomputation: Scales & Inversion ---

function normalizeSubject(notes: RawNote[], ppq: number): { notes: InternalNote[], offsetTicks: number } {
    const valid = notes.filter(n => !!n).sort((a,b) => a.ticks - b.ticks);
    if (valid.length === 0) return { notes: [], offsetTicks: 0 };
    
    // No quantization here - preserve original ticks relative to start
    const startTick = valid[0].ticks;
    
    // Metric offset is the absolute tick of the first subject onset.
    // It aligns local scan coordinates (relTick-based) to the global metric grid
    // when evaluating strong-beat predicates.
    const offsetTicks = startTick;

    const internalNotes: InternalNote[] = valid.map(n => ({
        relTick: n.ticks - startTick,
        durationTicks: n.durationTicks,
        pitch: n.midi
    }));

    return { notes: internalNotes, offsetTicks };
}

// --- Rule Definitions (Pruning) ---

// Parallel hard-fail policy applies only to P5/P8 classes, never P4.
const PERFECT_PARALLEL_INTERVALS = new Set([0, 7]);


function isForbiddenParallelPerfectMotion(
    prevIntervalClass: number,
    deltaVoice1: number,
    deltaVoice2: number
): boolean {
    // Forbidden parallel-perfect motion is defined as:
    // 1) Previous simultaneity is perfect (P1/P8 class 0 or P5 class 7), and
    // 2) Both voices move simultaneously by the same non-zero signed amount.
    // Equal signed deltas preserve interval class, so a perfect previous interval
    // remains perfect at the current simultaneity.
    return PERFECT_PARALLEL_INTERVALS.has(prevIntervalClass)
        && deltaVoice1 !== 0
        && deltaVoice1 === deltaVoice2;
}

export function violatesTripletParallelPolicy(
    pairAB: PairwiseCompatibilityRecord,
    pairBC: PairwiseCompatibilityRecord,
    delayABTicks: number,
    delayBCTicks: number,
    subjectLengthTicks: number
): boolean {
    // Rule 3A: Consecutive pair boundaries carrying perfect 5th/8ve parallels are invalid.
    if (pairAB.hasParallelPerfect58 && pairBC.hasParallelPerfect58) return true;

    // Rule 3B: If both delays are long (>= Sb/3), any perfect 5th/8ve parallel is invalid.
    const oneThirdSubject = subjectLengthTicks / 3;
    const neitherDelayUnderThird = delayABTicks >= oneThirdSubject && delayBCTicks >= oneThirdSubject;
    if (neitherDelayUnderThird && (pairAB.hasParallelPerfect58 || pairBC.hasParallelPerfect58)) return true;

    return false;
}

/**
 * PHASE 1 CHECK: Structural Validity (Pairwise)
 * REFACTORED: Uses Scan-Line algorithm on raw ticks.
 */
export function checkCounterpointStructure(
    variantA: SubjectVariant,
    variantB: SubjectVariant,
    delayTicks: number,
    transposition: number,
    maxDissonanceRatio: number,
    ppqParam: number = 480,
    tsNum: number = 4,
    tsDenom: number = 4
 ): PairwiseScanResult {
    return checkCounterpointStructureWithBassRole(variantA, variantB, delayTicks, transposition, maxDissonanceRatio, 'none', ppqParam, tsNum, tsDenom);
}

export function checkCounterpointStructureWithBassRole(
    variantA: SubjectVariant,
    variantB: SubjectVariant,
    delayTicks: number,
    transposition: number,
    maxDissonanceRatio: number,
    bassRole: PairwiseBassRole,
    ppqParam: number = 480,
    tsNum: number = 4,
    tsDenom: number = 4
 ): PairwiseScanResult {
    
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
    let dissRunTicks = 0;
    let lastIsDiss = false;

    let overlapTicks = 0;
    let dissonantTicks = 0;
    let strongBeatParallels = 0;
    let weakBeatParallels = 0;
    let hasFourth = false;
    let p4SimultaneityCount = 0;
    let hasVoiceCrossing = false;
    let hasParallelPerfect58 = false;
    const dissonanceSpans: SimultaneitySpan[] = [];
    const p4Spans: SimultaneitySpan[] = [];
    const parallelPerfectStartTicks: number[] = [];
    let previousOrderingSign = 0;
    let maxDissonanceRunEvents = 0;
    let maxDissonanceRunTicks = 0;
    const maxAllowedContinuousDissonanceTicks = ppqParam;

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
            dissRunTicks = 0;
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
        if (interval === 5) {
            hasFourth = true;
            p4SimultaneityCount++;
            p4Spans.push({ startTick: start, endTick: end });
        }

        // Rule 5: Parallel Perfects — flag by beat strength, don't hard-reject
        if (prevP1 !== null && prevP2 !== null) {
            const p1Moved = p1 !== prevP1;
            const p2Moved = p2 !== prevP2;

            const prevLo = Math.min(prevP1, prevP2);
            const prevHi = Math.max(prevP1, prevP2);
            const prevInt = (prevHi - prevLo) % 12;
            const deltaVoice1 = p1 - prevP1;
            const deltaVoice2 = p2 - prevP2;
            if (isForbiddenParallelPerfectMotion(prevInt, deltaVoice1, deltaVoice2)) {
                hasParallelPerfect58 = true;
                parallelPerfectStartTicks.push(start);
                if (isStrongBeat(start, ppqParam, tsNum, tsDenom)) {
                    strongBeatParallels++;
                } else {
                    weakBeatParallels++;
                }
            }
        }
        
        let isDiss = INTERVALS.DISSONANT_SIMPLE.has(interval);

        // P4 (5 semitones) becomes dissonant only if its lower note is known to be the bass.
        // In pairwise-only mode (bassRole='none') it stays provisionally consonant.
        if (!isDiss && interval === 5 && bassRole !== 'none') {
            const bassPitch = bassRole === 'a' ? p1 : p2;
            if (bassPitch === lo) isDiss = true;
        }
        
        if (isDiss) {
            dissonanceSpans.push({ startTick: start, endTick: end });
            dissonantTicks += dur;
            
            // For run length, we count *events* (intervals), not ticks
            if (!lastIsDiss) {
                dissRunLength = 1;
                dissRunTicks = dur;
            } else {
                dissRunLength++;
                dissRunTicks += dur;
            }
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);
            maxDissonanceRunTicks = Math.max(maxDissonanceRunTicks, dissRunTicks);

            // Rule C2: Event Limit (r <= 2)
            if (dissRunLength > 2) return { compatible: false, dissonanceRatio: 1, strongBeatParallels, weakBeatParallels, hasFourth, p4SimultaneityCount, hasVoiceCrossing, maxDissonanceRunEvents, maxDissonanceRunTicks, hasParallelPerfect58, dissonanceSpans, p4Spans, parallelPerfectStartTicks };

            // Rule C2b: Continuous dissonance must resolve within one beat.
            if (dissRunTicks > maxAllowedContinuousDissonanceTicks) return { compatible: false, dissonanceRatio: 1, strongBeatParallels, weakBeatParallels, hasFourth, p4SimultaneityCount, hasVoiceCrossing, maxDissonanceRunEvents, maxDissonanceRunTicks, hasParallelPerfect58, dissonanceSpans, p4Spans, parallelPerfectStartTicks };

            lastIsDiss = true;
        } else {
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);
            dissRunLength = 0;
            dissRunTicks = 0;
            lastIsDiss = false;
        }

        prevP1 = p1; prevP2 = p2;
    }

    // Strict Dissonance Ratio Filter
    if (overlapTicks > 0) {
        const ratio = dissonantTicks / overlapTicks;
        if (ratio > maxDissonanceRatio) return { compatible: false, dissonanceRatio: ratio, strongBeatParallels, weakBeatParallels, hasFourth, p4SimultaneityCount, hasVoiceCrossing, maxDissonanceRunEvents, maxDissonanceRunTicks, hasParallelPerfect58, dissonanceSpans, p4Spans, parallelPerfectStartTicks };
    }

    maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);
    maxDissonanceRunTicks = Math.max(maxDissonanceRunTicks, dissRunTicks);
    return { compatible: true, dissonanceRatio: overlapTicks > 0 ? dissonantTicks / overlapTicks : 0, strongBeatParallels, weakBeatParallels, hasFourth, p4SimultaneityCount, hasVoiceCrossing, maxDissonanceRunEvents, maxDissonanceRunTicks, hasParallelPerfect58, dissonanceSpans, p4Spans, parallelPerfectStartTicks };
}

// Helper: Determine beat strength
function resolveBeatAndMeasureTicks(ppq: number, tsNum: number, tsDenom: number): { beatTicks: number; measureTicks: number } {
    const measureTicks = ppq * tsNum * (4 / tsDenom);
    const isCompound = tsDenom === 8 && tsNum % 3 === 0 && tsNum >= 6;
    const beatTicks = isCompound ? (3 * ppq) / 2 : ppq * (4 / tsDenom);
    return { beatTicks, measureTicks };
}

export function isStrongBeat(tick: number, ppq: number, tsNum: number = 4, tsDenom: number = 4): boolean {
    const { beatTicks, measureTicks } = resolveBeatAndMeasureTicks(ppq, tsNum, tsDenom);
    const posInMeasure = ((tick % measureTicks) + measureTicks) % measureTicks;
    const eps = 1e-6;

    if (Math.abs(posInMeasure) < eps) return true;

    // Rule: only 4/4 and 12/8 carry a second strong pulse at beat 3.
    const hasSecondStrongPulse = (tsNum === 4 && tsDenom === 4) || (tsNum === 12 && tsDenom === 8);
    if (!hasSecondStrongPulse) return false;

    const secondStrongTick = 2 * beatTicks;
    return Math.abs(posInMeasure - secondStrongTick) < eps;
}

export function isVoicePairAllowedForTransposition(
    voiceA: number,
    voiceB: number,
    transpositionAB: number,
    ensembleTotal: number,
    disallowLowestPair: boolean
): boolean {
    const highVoiceIdx = Math.min(voiceA, voiceB);
    const lowVoiceIdx = Math.max(voiceA, voiceB);
    const highTrans = voiceA === highVoiceIdx ? 0 : transpositionAB;
    const lowTrans = voiceA === lowVoiceIdx ? 0 : transpositionAB;
    const dist = lowVoiceIdx - highVoiceIdx;

    if (highTrans < lowTrans) return false;
    if (dist === 2 && highTrans < lowTrans + 7) return false;
    if (dist >= 3 && highTrans < lowTrans + 12) return false;

    const bassIdx = ensembleTotal - 1;
    const altoIdx = bassIdx - 2;
    if (bassIdx >= 2 && lowVoiceIdx === bassIdx && highVoiceIdx === altoIdx && highTrans < lowTrans + 12) return false;

    if (disallowLowestPair && lowVoiceIdx === bassIdx && highVoiceIdx === bassIdx - 1) return false;

    return true;
}


export function shouldPruneLowestVoicePair(bassStrictACompatible: boolean, bassStrictBCompatible: boolean): boolean {
    // A tenor-bass assignment should be pruned only when BOTH bass orientations are
    // incompatible. If only one orientation fails, the opposite orientation can still
    // participate in valid triplets where another voice carries the true bass function.
    return !bassStrictACompatible && !bassStrictBCompatible;
}

export function buildAllowedVoicePairs(
    transpositionAB: number,
    ensembleTotal: number,
    disallowLowestPair: boolean
): Set<string> {
    const allowed = new Set<string>();
    for (let voiceA = 0; voiceA < ensembleTotal; voiceA++) {
        for (let voiceB = 0; voiceB < ensembleTotal; voiceB++) {
            if (voiceA === voiceB) continue;
            if (isVoicePairAllowedForTransposition(voiceA, voiceB, transpositionAB, ensembleTotal, disallowLowestPair)) {
                allowed.add(`${voiceA}->${voiceB}`);
            }
        }
    }
    return allowed;
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
    metricOffset: number = 0,
    tsNum: number = 4,
    tsDenom: number = 4
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
            const isStrong = isStrongBeat(start + metricOffset, ppq, tsNum, tsDenom);

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
                    const prevIsStrong = isStrongBeat(prevStart + metricOffset, ppq, tsNum, tsDenom);
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

    const toWindowKey = (parts: WindowKeyParts): WindowKey => `${parts.variantLeft}|${parts.variantRight}|${parts.delayTicks}|${parts.transpositionDelta}`;
    const traversalMode = options.traversalMode ?? 'triplet-native';
    
    const startTime = Date.now();
    let nodesVisited = 0;
    let edgesTraversed = 0;
    let maxDepth = 0;
    let operationCounter = 0;
    const configuredTimeLimitMs = Number.isFinite(options.maxSearchTimeMs) ? Math.max(1, Math.floor(options.maxSearchTimeMs as number)) : DEFAULT_TIME_LIMIT_MS;
    let activeTimeLimitMs = configuredTimeLimitMs;
    let timeoutExtensionAppliedMs = 0;
    let terminationReason: StrettoSearchReport['stats']['stopReason'] | null = null;
    
    const { notes: baseNotes, offsetTicks } = normalizeSubject(rawSubject, ppq);
    const tsNum = options.meterNumerator ?? 4;
    const tsDenom = options.meterDenominator ?? 4;
    if (baseNotes.length === 0) {
        return {
            results: [],
            stats: {
                nodesVisited: 0,
                timeMs: 0,
                stopReason: 'Exhausted',
                maxDepthReached: 0,
                metricOffsetTicks: offsetTicks,
                stageStats: {
                    validDelayCount: 0,
                    transpositionCount: 0,
                    pairwiseTotal: 0,
                    pairwiseCompatible: 0,
                    pairwiseWithFourth: 0,
                    pairwiseWithVoiceCrossing: 0,
                    pairwiseP4TwoVoiceDissonant: 0,
                    pairwiseParallelRejected: 0,
                    tripleCandidates: 0,
                    triplePairwiseRejected: 0,
                    tripleLowerBoundRejected: 0,
                    tripleParallelRejected: 0,
                    tripleVoiceRejected: 0,
                    tripleP4BassRejected: 0,
                    harmonicallyValidTriples: 0,
                    deterministicDagMergedNodes: 0,
                    pairStageRejected: 0,
                    tripletStageRejected: 0,
                    globalLineageStageRejected: 0,
                    structuralScanInvocations: 0,
                    dissonanceSpans: [],
                    p4Spans: [],
                    parallelPerfectLocationTicks: [],
                    transitionWindowLookups: 0,
                    transitionsReturned: 0,
                    candidateTransitionsEnumerated: 0
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
    
    const stageStats: StageStats = {
        validDelayCount: validDelays.length,
        transpositionCount: transpositions.length,
        pairwiseTotal: 0,
        pairwiseCompatible: 0,
        pairwiseWithFourth: 0,
        pairwiseWithVoiceCrossing: 0,
        pairwiseP4TwoVoiceDissonant: 0,
        pairwiseParallelRejected: 0,
        tripleCandidates: 0,
        triplePairwiseRejected: 0,
        tripleLowerBoundRejected: 0,
        tripleParallelRejected: 0,
        tripleVoiceRejected: 0,
        tripleP4BassRejected: 0,
        harmonicallyValidTriples: 0,
        deterministicDagMergedNodes: 0,
        pairStageRejected: 0,
        tripletStageRejected: 0,
        globalLineageStageRejected: 0,
        structuralScanInvocations: 0,
        dissonanceSpans: [],
        p4Spans: [],
        parallelPerfectLocationTicks: [],
        transitionWindowLookups: 0,
        transitionsReturned: 0,
        candidateTransitionsEnumerated: 0
    };

    // Phase 1: STRUCTURAL PAIRWISE PRECOMPUTATION
    // Compute all 3 bass-role scans (none, a, b) at precomp time so traversal never re-scans.
    // Also precompute interval class metadata for quota checks.
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

                    // Neutral scan (P4 treated as provisionally consonant)
                    stageStats.structuralScanInvocations++;
                    const pairScan = checkCounterpointStructure(vA, vB, d, t, options.maxPairwiseDissonance, ppq, tsNum, tsDenom);
                    appendUniqueSpansCapped(stageStats.dissonanceSpans, pairScan.dissonanceSpans);
                    appendUniqueSpansCapped(stageStats.p4Spans, pairScan.p4Spans);
                    appendUniqueCapped(stageStats.parallelPerfectLocationTicks, pairScan.parallelPerfectStartTicks);
                    if (!pairScan.compatible) {
                        stageStats.pairStageRejected++;
                        continue;
                    }

                    // Disallowed parallel perfects are strict pairwise failures:
                    // perfect fifth (P5 class 7) and perfect octave/unison (P8/P1 class 0).
                    if (pairScan.hasParallelPerfect58) {
                        stageStats.pairwiseParallelRejected++;
                        stageStats.pairStageRejected++;
                        continue;
                    }

                    // Bass-role scans are only needed when at least one P4 occurs.
                    // Without P4 simultaneities, bassRole cannot change dissonance classification,
                    // so neutral scan data is exact for roles a/b as well.
                    const requiresBassRoleRescan = pairScan.hasFourth;
                    const bassStrictA = requiresBassRoleRescan
                        ? (() => {
                            stageStats.structuralScanInvocations++;
                            return checkCounterpointStructureWithBassRole(vA, vB, d, t, options.maxPairwiseDissonance, 'a', ppq, tsNum, tsDenom);
                        })()
                        : pairScan;
                    const bassStrictB = requiresBassRoleRescan
                        ? (() => {
                            stageStats.structuralScanInvocations++;
                            return checkCounterpointStructureWithBassRole(vA, vB, d, t, options.maxPairwiseDissonance, 'b', ppq, tsNum, tsDenom);
                        })()
                        : pairScan;

                    const disallowLowestPair = shouldPruneLowestVoicePair(bassStrictA.compatible, bassStrictB.compatible);
                    const allowedVoicePairs = buildAllowedVoicePairs(t, options.ensembleTotal, disallowLowestPair);
                    if (allowedVoicePairs.size === 0) {
                        stageStats.pairStageRejected++;
                        continue;
                    }

                    // Precompute interval class for quota checks during traversal
                    const intervalClass = ((t % 12) + 12) % 12;
                    const isRestrictedInterval = [3, 4, 8, 9].includes(intervalClass);
                    const isFreeInterval = [0, 5, 7].includes(intervalClass);

                    // If P4 exists and only 2 voices are active at those points,
                    // the P4 is immediately dissonant (no other voice can provide the bass below).
                    // This is a cheap pruning rule: in a pairwise context, if hasFourth is true,
                    // the lower note IS the bass by definition (only 2 voices sounding).
                    // So check: does treating ALL P4s as dissonant violate the pair?
                    // The bassStrictA/B scans already capture this per-role.
                    // For the "2 voices only" case, both bass-role results tell us the full story.

                    pairwiseCompatibleTriplets.set(key, {
                        dissonanceRatio: pairScan.dissonanceRatio,
                        hasFourth: pairScan.hasFourth,
                        p4SimultaneityCount: pairScan.p4SimultaneityCount,
                        hasVoiceCrossing: pairScan.hasVoiceCrossing,
                        maxDissonanceRunEvents: pairScan.maxDissonanceRunEvents,
                        maxDissonanceRunTicks: pairScan.maxDissonanceRunTicks,
                        maxAllowedContinuousDissonanceTicks: ppq,
                        hasParallelPerfect58: pairScan.hasParallelPerfect58,
                        dissonanceSpans: pairScan.dissonanceSpans,
                        p4Spans: pairScan.p4Spans,
                        parallelPerfectStartTicks: pairScan.parallelPerfectStartTicks,
                        disallowLowestPair,
                        allowedVoicePairs,
                        bassRoleCompatible: {
                            none: pairScan.compatible,
                            a: bassStrictA.compatible,
                            b: bassStrictB.compatible
                        },
                        bassRoleDissonanceRatio: {
                            none: pairScan.dissonanceRatio,
                            a: bassStrictA.dissonanceRatio,
                            b: bassStrictB.dissonanceRatio
                        },
                        bassRoleMaxRunEvents: {
                            none: pairScan.maxDissonanceRunEvents,
                            a: bassStrictA.maxDissonanceRunEvents,
                            b: bassStrictB.maxDissonanceRunEvents
                        },
                        intervalClass,
                        isRestrictedInterval,
                        isFreeInterval,
                        meetsAdjacentTranspositionSeparation: Math.abs(t) >= 5
                    });
                    stageStats.pairwiseCompatible++;
                    if (pairScan.hasFourth) {
                        stageStats.pairwiseWithFourth++;
                        // In pairwise context (only 2 voices), if either bass-role scan
                        // is incompatible due to P4, the P4 acts as dissonant.
                        if (!bassStrictA.compatible || !bassStrictB.compatible) {
                            stageStats.pairwiseP4TwoVoiceDissonant++;
                        }
                    }
                    if (pairScan.hasVoiceCrossing) stageStats.pairwiseWithVoiceCrossing++;
                }
            }
        }
    }

    // --- PRECOMPUTE TRIPLES ---
    const harmonicallyValidTriples = new Set<string>();
    const transitionsByWindow = new Map<WindowKey, NextTransition[]>();
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
            if (!passesTripletStage(stageStats, d2 <= d1 + delayStep)) continue;
            
            // Rule: Pair A->C compatibility (if overlapping)
            const vA = p1.vA;
            const vC = p2.vB;
            const dAC = d1 + d2;
            const tAC = p1.t + p2.t;
            
            const lenA = variants[vA].lengthTicks;
            if (dAC < lenA) {
                const keyAC = toPairKey(vA, vC, dAC, tAC);
                const pairAC = pairwiseCompatibleTriplets.get(keyAC);
                if (!passesTripletStage(stageStats, !!pairAC)) {
                    stageStats.triplePairwiseRejected++;
                    continue;
                }
                if (!passesTripletStage(stageStats, !violatesPairwiseLowerBound(pairAB, options.maxPairwiseDissonance) && !violatesPairwiseLowerBound(pairBC, options.maxPairwiseDissonance) && !violatesPairwiseLowerBound(pairAC, options.maxPairwiseDissonance))) {
                    stageStats.tripleLowerBoundRejected++;
                    continue;
                }
            } else if (!passesTripletStage(stageStats, !violatesPairwiseLowerBound(pairAB, options.maxPairwiseDissonance) && !violatesPairwiseLowerBound(pairBC, options.maxPairwiseDissonance))) {
                stageStats.tripleLowerBoundRejected++;
                continue;
            }
            
            // Rule: Voice Spacing for the Triple
            const trans = [0, p1.t, p1.t + p2.t].sort((a,b) => a - b);
            if (!passesGlobalLineageStage(stageStats, trans[2] - trans[0] >= 7)) continue;

            // Use precomputed allowedVoicePairs from pairwise records to constrain
            // the triplet voice assignment. The pairwise records already encode
            // spacing rules (neighbor, 2-gap, bass-alto), so we intersect them.
            const pairAC_rec = (dAC < lenA) ? pairwiseCompatibleTriplets.get(toPairKey(vA, vC, dAC, tAC)) : null;

            let possibleAssignment = false;
            const bassIdx = options.ensembleTotal - 1;
            for (let v1 = 0; v1 < options.ensembleTotal; v1++) {
                for (let v2 = 0; v2 < options.ensembleTotal; v2++) {
                    if (v1 === v2) continue;
                    // Check AB voice pair admissibility from precomputed set
                    if (!pairAB.allowedVoicePairs.has(`${v1}->${v2}`)) continue;

                    for (let v3 = 0; v3 < options.ensembleTotal; v3++) {
                        if (v1 === v3 || v2 === v3) continue;
                        // Check BC voice pair admissibility from precomputed set
                        if (!pairBC.allowedVoicePairs.has(`${v2}->${v3}`)) continue;
                        // Check AC voice pair if overlapping
                        if (pairAC_rec && !pairAC_rec.allowedVoicePairs.has(`${v1}->${v3}`)) continue;

                        // P4 bass-role check at triplet level:
                        // With 3 known voices, determine if any P4-containing pair has
                        // its lower note as the actual bass of the sonority.
                        let p4Fail = false;

                        // For each pair with P4, check if the assigned voice role
                        // makes the P4 dissonant (lower note = bass voice).
                        if (pairAB.hasFourth) {
                            // Determine bass role for this AB pair given v1, v2
                            let abBassRole: PairwiseBassRole = 'none';
                            if (v1 === bassIdx && v2 !== bassIdx) abBassRole = 'a';
                            else if (v2 === bassIdx && v1 !== bassIdx) abBassRole = 'b';
                            // If only 2 voices active in the P4 region AND no 3rd voice
                            // provides a lower pitch, the P4 IS against the bass.
                            // Use precomputed bass-role compatibility.
                            if (abBassRole !== 'none' && !pairAB.bassRoleCompatible[abBassRole]) {
                                p4Fail = true;
                            }
                        }
                        if (!p4Fail && pairBC.hasFourth) {
                            let bcBassRole: PairwiseBassRole = 'none';
                            if (v2 === bassIdx && v3 !== bassIdx) bcBassRole = 'a';
                            else if (v3 === bassIdx && v2 !== bassIdx) bcBassRole = 'b';
                            if (bcBassRole !== 'none' && !pairBC.bassRoleCompatible[bcBassRole]) {
                                p4Fail = true;
                            }
                        }
                        if (!p4Fail && pairAC_rec && pairAC_rec.hasFourth) {
                            let acBassRole: PairwiseBassRole = 'none';
                            if (v1 === bassIdx && v3 !== bassIdx) acBassRole = 'a';
                            else if (v3 === bassIdx && v1 !== bassIdx) acBassRole = 'b';
                            if (acBassRole !== 'none' && !pairAC_rec.bassRoleCompatible[acBassRole]) {
                                p4Fail = true;
                            }
                        }

                        if (p4Fail) {
                            continue;
                        }

                        possibleAssignment = true;
                        break;
                    }
                    if (possibleAssignment) break;
                }
                if (possibleAssignment) break;
            }

            if (!possibleAssignment) {
                // Determine if the rejection was P4-related or voice-spacing-related.
                // Re-check without P4 to classify.
                let spacingFail = true;
                for (let v1 = 0; v1 < options.ensembleTotal && spacingFail; v1++) {
                    for (let v2 = 0; v2 < options.ensembleTotal && spacingFail; v2++) {
                        if (v1 === v2) continue;
                        if (!pairAB.allowedVoicePairs.has(`${v1}->${v2}`)) continue;
                        for (let v3 = 0; v3 < options.ensembleTotal && spacingFail; v3++) {
                            if (v1 === v3 || v2 === v3) continue;
                            if (!pairBC.allowedVoicePairs.has(`${v2}->${v3}`)) continue;
                            if (pairAC_rec && !pairAC_rec.allowedVoicePairs.has(`${v1}->${v3}`)) continue;
                            spacingFail = false;
                        }
                    }
                }
                if (spacingFail) {
                    stageStats.tripleVoiceRejected++;
                } else {
                    stageStats.tripleP4BassRejected++;
                }
                passesGlobalLineageStage(stageStats, false);
                continue;
            }
            
            const key = toTripleKey(vA, p1.vB, vC, d1, d2, p1.t, p2.t);
            harmonicallyValidTriples.add(key);

            const windowKey = toWindowKey({
                variantLeft: vA,
                variantRight: p1.vB,
                delayTicks: d1,
                transpositionDelta: p1.t
            });
            const nextTransition: NextTransition = {
                nextVariantIndex: vC,
                delayTicks: d2,
                transpositionDelta: p2.t,
                pairRecord: pairBC,
                isRestrictedInterval: pairBC.isRestrictedInterval,
                isFreeInterval: pairBC.isFreeInterval
            };
            const existingTransitions = transitionsByWindow.get(windowKey);
            if (existingTransitions) existingTransitions.push(nextTransition);
            else transitionsByWindow.set(windowKey, [nextTransition]);

            stageStats.harmonicallyValidTriples++;
        }
    }

    const nextTransitionsFromRoot = new Map<string, NextTransition[]>();
    const nextTransitionsByBoundary = new Map<string, NextTransition[]>();

    const pushNextTransition = <T>(store: Map<string, T[]>, key: string, transition: T): void => {
        const curr = store.get(key);
        if (!curr) {
            store.set(key, [transition]);
            return;
        }
        curr.push(transition);
    };

    for (const d of validDelays) {
        for (const t of transpositions) {
            for (let varIdx = 0; varIdx < variants.length; varIdx++) {
                const immKey = toPairKey(0, varIdx, d, t);
                const immPair = pairwiseCompatibleTriplets.get(immKey);
                if (!immPair || !immPair.meetsAdjacentTranspositionSeparation) continue;
                const variant = variants[varIdx];
                const isInv = variant.type === 'I';
                const isTrunc = variant.truncationBeats > 0;
                if (isInv && variants[0].type === 'I') continue;
                if (isTrunc && variants[0].truncationBeats > 0) continue;
                pushNextTransition(nextTransitionsFromRoot, `${0}|${d}`, {
                    delayTicks: d,
                    nextVariantIndex: varIdx,
                    transpositionDelta: t,
                    pairRecord: immPair,
                    isRestrictedInterval: immPair.isRestrictedInterval,
                    isFreeInterval: immPair.isFreeInterval
                });
            }
        }
    }

    for (const p1 of validPairsList) {
        for (const p2 of (pairsByFirst.get(p1.vB) || [])) {
            const tripleKey = toTripleKey(p1.vA, p1.vB, p2.vB, p1.d, p2.d, p1.t, p2.t);
            if (!harmonicallyValidTriples.has(tripleKey)) continue;
            const immKey = toPairKey(p1.vB, p2.vB, p2.d, p2.t);
            const immPair = pairwiseCompatibleTriplets.get(immKey);
            if (!immPair || !immPair.meetsAdjacentTranspositionSeparation) continue;

            const variant = variants[p2.vB];
            const prevVariant = variants[p1.vB];
            const isInv = variant.type === 'I';
            const isTrunc = variant.truncationBeats > 0;
            const prevIsInv = prevVariant.type === 'I';
            const prevIsTrunc = prevVariant.truncationBeats > 0;
            // Transform-following constraint:
            // if the predecessor is transformed (inverted OR truncated), the successor must be normal.
            if ((prevIsInv || prevIsTrunc) && (isInv || isTrunc)) continue;

            pushNextTransition(nextTransitionsByBoundary, `${p1.vA}|${p1.vB}|${p1.d}|${p1.t}|${p2.d}`, {
                delayTicks: p2.d,
                nextVariantIndex: p2.vB,
                transpositionDelta: p2.t,
                pairRecord: immPair,
                isRestrictedInterval: immPair.isRestrictedInterval,
                isFreeInterval: immPair.isFreeInterval
            });
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
        usedLongDelays: Set<number>; // A.1: delays > Sb/3 must be globally unique
    }

    function getBoundarySignature(chain: StrettoChainOption[]): string {
        return toOrderedBoundarySignature(chain, ppq);
    }


    function getMergeDeterminismSignature(node: DagNode): string {
        const parts: string[] = [];
        for (let i = 0; i < node.chain.length; i++) {
            const entry = node.chain[i];
            const startTicks = Math.round(entry.startBeat * ppq);
            parts.push(`${startTicks}:${entry.transposition}:${entry.type}:${entry.voiceIndex}:${entry.length}:${node.variantIndices[i] ?? -1}`);
        }
        return parts.join('|');
    }

    function getDagNodeKey(node: DagNode): string {
        const chainSig = getChainSignature(node.chain);
        const boundarySig = getBoundarySignature(node.chain);
        const longDelaysSig = Array.from(node.usedLongDelays).sort((a, b) => a - b).join(',');

        if (node.chain.length <= EARLY_WINDOW_OPTIMIZATION_MAX_ENTRY) {
            // Invariant (entries 1-4): retain full history in the key while all prefixes remain dense;
            // this preserves strict baseline-equivalent identity before early-window compression starts.
            if (node.chain.length <= 4) {
                return `${chainSig}|${boundarySig}|v:${node.voiceEndTimesTicks.join(',')}|q:${node.nInv},${node.nTrunc},${node.nRestricted},${node.nFree}|ld:${longDelaysSig}`;
            }

            // Invariant (entries 5-7): frontier transitions are generated from immediate window metadata
            // (delay/transposition deltas and precomputed local compatibility), so ordered boundary
            // history is derivable for feasibility and can be dropped from DAG identity.
            return `ew:${node.chain.length}|${chainSig}|v:${node.voiceEndTimesTicks.join(',')}|q:${node.nInv},${node.nTrunc},${node.nRestricted},${node.nFree}|ld:${longDelaysSig}`;
        }

        // Invariant (entry > 7): restore history-heavy identity to avoid over-merging once longer
        // prefixes can influence late-stage feasibility through accumulated boundary structure.
        return `${chainSig}|${boundarySig}|v:${node.voiceEndTimesTicks.join(',')}|q:${node.nInv},${node.nTrunc},${node.nRestricted},${node.nFree}|ld:${longDelaysSig}`;
    }

    function expandNode(node: DagNode): DagNode[] {
        const successors: DagNode[] = [];
        const { chain, variantIndices, voiceEndTimesTicks, nInv, nTrunc, nRestricted, nFree, usedLongDelays } = node;
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

            // Long-delay contraction (OR form):
            // if d_i >= 0.5*Sl OR d_{i+1} >= 0.5*Sl, then d_{i+1} < d_i.
            // Candidate-side (d_{i+1}) portion is applied below during per-candidate filtering.
            if (prevDelayTicks >= (prevSubjectLengthTicks / 2)) maxD = Math.min(maxD, prevDelayTicks - delayStep);
            else maxD = Math.min(maxD, prevDelayTicks + delayStep);

            // Maximum contraction bound:
            // d_i - d_{i+1} <= 0.25*Sl  =>  d_{i+1} >= d_i - 0.25*Sl.
            minD = Math.max(minD, prevDelayTicks - Math.floor(prevSubjectLengthTicks / 4));

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

        let indexedTransitionsByDelay: Map<number, NextTransition[]> | null = null;
        let windowDelayTicks = 0;
        let windowTranspositionDelta = 0;
        if (depth >= 2) {
            windowDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
            windowTranspositionDelta = chain[depth - 1].transposition - chain[depth - 2].transposition;
            if (traversalMode === 'triplet-native') {
                const windowKey = toWindowKey({
                    variantLeft: variantIndices[depth - 2],
                    variantRight: variantIndices[depth - 1],
                    delayTicks: windowDelayTicks,
                    transpositionDelta: windowTranspositionDelta
                });
                stageStats.transitionWindowLookups++;
                const indexedTransitions = transitionsByWindow.get(windowKey) ?? [];
                stageStats.transitionsReturned += indexedTransitions.length;
                indexedTransitionsByDelay = new Map<number, NextTransition[]>();
                for (const transition of indexedTransitions) {
                    const bucket = indexedTransitionsByDelay.get(transition.delayTicks);
                    if (bucket) bucket.push(transition);
                    else indexedTransitionsByDelay.set(transition.delayTicks, [transition]);
                }
            }
        }

        for (const delayTicks of possibleDelaysTicks) {
            // A.1 Global Uniqueness: delays > Sb/3 must be unique across the chain.
            // O(1) set membership check per candidate delay.
            if (delayTicks > oneThirdSubjectTicks && usedLongDelays.has(delayTicks)) {
                stageStats.globalLineageStageRejected++;
                continue;
            }

            if (depth >= 2) {
                const prevDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
                if (Math.abs(delayTicks - prevDelayTicks) < 1) {
                    const isDelayShort = prevDelayTicks <= (prevEntryLengthTicks / 3);
                    if (!(isFinalThird && isDelayShort)) continue;
                }
            }

            const absStartTicks = Math.round(prevEntry.startBeat * ppq) + delayTicks;
            const absStartBeat = absStartTicks / ppq;

            const prevTransposition = chain[chain.length - 1].transposition;
            const candidateTransitions: { varIdx: number; t: number; immPair: PairwiseCompatibilityRecord; isRestricted: boolean; isFree: boolean }[] = [];

            if (depth >= 2) {
                if (traversalMode === 'triplet-native') {
                    const indexedTransitions = indexedTransitionsByDelay?.get(delayTicks) ?? [];
                    for (const transition of indexedTransitions) {
                        const t = prevTransposition + transition.transpositionDelta;
                        if (t === prevTransposition) continue;
                        if (!transition.pairRecord.meetsAdjacentTranspositionSeparation) continue;
                        stageStats.candidateTransitionsEnumerated++;
                        candidateTransitions.push({
                            varIdx: transition.nextVariantIndex,
                            t,
                            immPair: transition.pairRecord,
                            isRestricted: transition.isRestrictedInterval,
                            isFree: transition.isFreeInterval
                        });
                    }
                } else {
                    const boundaryKey = `${variantIndices[depth - 2]}|${variantIndices[depth - 1]}|${windowDelayTicks}|${windowTranspositionDelta}|${delayTicks}`;
                    const boundaryTransitions = nextTransitionsByBoundary.get(boundaryKey) ?? [];
                    if (boundaryTransitions.length > 0) {
                        stageStats.transitionWindowLookups++;
                        stageStats.transitionsReturned += boundaryTransitions.length;
                        for (const transition of boundaryTransitions) {
                            const t = prevTransposition + transition.transpositionDelta;
                            if (t === prevTransposition) continue;
                            const immKey = toPairKey(variantIndices[depth - 1], transition.nextVariantIndex, delayTicks, transition.transpositionDelta);
                            const immPair = pairwiseCompatibleTriplets.get(immKey);
                            if (!immPair || !immPair.meetsAdjacentTranspositionSeparation) continue;
                            stageStats.candidateTransitionsEnumerated++;
                            candidateTransitions.push({
                                varIdx: transition.nextVariantIndex,
                                t,
                                immPair,
                                isRestricted: transition.isRestricted,
                                isFree: transition.isFree
                            });
                        }
                    } else {
                        // `legacy-boundary` parity mode must draw successors exclusively
                        // from prevalidated boundary transitions. A synthetic fallback
                        // over global transposition candidates changes the accepted state
                        // space relative to window-indexed/native traversal and can
                        // introduce non-parity chains on deep fixtures.
                        if (traversalMode === 'legacy-boundary') {
                            continue;
                        }

                        const seenClasses = new Set<number>();
                        const fresh: number[] = [];
                        const deferred: number[] = [];
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
                                const immPrevVarIdx = variantIndices[depth - 1];
                                const immRelTrans = t - chain[depth - 1].transposition;
                                const immKey = toPairKey(immPrevVarIdx, varIdx, delayTicks, immRelTrans);
                                const immPair = pairwiseCompatibleTriplets.get(immKey);
                                if (!immPair) continue;
                                if (!immPair.meetsAdjacentTranspositionSeparation) continue;
                                stageStats.candidateTransitionsEnumerated++;
                                candidateTransitions.push({
                                    varIdx,
                                    t,
                                    immPair,
                                    isRestricted: immPair.isRestrictedInterval,
                                    isFree: immPair.isFreeInterval
                                });
                            }
                        }
                    }
                }
            } else {
                const seenClasses = new Set<number>();
                const fresh: number[] = [];
                const deferred: number[] = [];
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
                        const immPrevVarIdx = variantIndices[depth - 1];
                        const immRelTrans = t - chain[depth - 1].transposition;
                        const immKey = toPairKey(immPrevVarIdx, varIdx, delayTicks, immRelTrans);
                        const immPair = pairwiseCompatibleTriplets.get(immKey);
                        if (!immPair) continue;
                        if (!immPair.meetsAdjacentTranspositionSeparation) continue;
                        stageStats.candidateTransitionsEnumerated++;
                        candidateTransitions.push({
                            varIdx,
                            t,
                            immPair,
                            isRestricted: immPair.isRestrictedInterval,
                            isFree: immPair.isFreeInterval
                        });
                    }
                }
            }

            for (const { varIdx, t, immPair, isRestricted, isFree } of candidateTransitions) {
                const variant = variants[varIdx];
                const isInv = variant.type === 'I';
                const isTrunc = variant.truncationBeats > 0;

                // Structural transform-following rule:
                // any transformed predecessor (inversion OR truncation) must be followed by a normal entry.
                // This is an O(1) local-state check using the predecessor variant index.
                const prevVariant = variants[variantIndices[depth - 1]];
                const prevIsInv = prevVariant.type === 'I';
                const prevIsTrunc = prevVariant.truncationBeats > 0;
                if ((prevIsInv || prevIsTrunc) && (isInv || isTrunc)) continue;

                if (depth >= 2) {
                    const prevDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
                    const prevSubjectLengthTicks = chain[depth - 1].length;
                    const halfSubjectTicks = prevSubjectLengthTicks / 2;

                    // Long-delay contraction (OR form):
                    // if either previous or current delay is at least half subject length, enforce contraction.
                    if ((prevDelayTicks >= halfSubjectTicks || delayTicks >= halfSubjectTicks) && delayTicks >= prevDelayTicks) continue;
                }

                if (isInv && !checkQuota(options.inversionMode, nInv)) continue;
                if (isTrunc && !checkQuota(options.truncationMode, nTrunc)) continue;

                const nextRestricted = nRestricted + (isRestricted ? 1 : 0);
                    const nextFree = nFree + (isFree ? 1 : 0);

                    if (nextRestricted > 1 && nextRestricted >= nextFree) continue;
                    if (isRestricted && !checkQuota(options.thirdSixthMode, nRestricted)) continue;
                    if (options.disallowComplexExceptions && (isInv || isTrunc) && isRestricted) continue;

                    // Collect overlapping pairwise records for this candidate
                    const overlappingPairs: { entry: StrettoChainOption; pairRecord: PairwiseCompatibilityRecord }[] = [];
                    let harmonicFail = false;
                    for (let k = 0; k < chain.length; k++) {
                        // Immediate predecessor pair is already validated via immPair above.
                        if (k === chain.length - 1) continue;
                        const prevE = chain[k];
                        const prevVarIdx = variantIndices[k];
                        const prevStartTicks = Math.round(prevE.startBeat * ppq);
                        const prevEndTicks = prevStartTicks + variants[prevVarIdx].lengthTicks;

                        if (absStartTicks < prevEndTicks) {
                            const relDelay = absStartTicks - prevStartTicks;
                            const relTrans = t - prevE.transposition;
                            const key = toPairKey(prevVarIdx, varIdx, relDelay, relTrans);
                            const pairRecord = pairwiseCompatibleTriplets.get(key);
                            if (!pairRecord) {
                                harmonicFail = true;
                                break;
                            }
                            overlappingPairs.push({ entry: prevE, pairRecord });
                        }
                    }
                    if (harmonicFail) continue;

                    const metricProbeEntry: StrettoChainOption = {
                        startBeat: absStartBeat,
                        transposition: t,
                        type: variant.type,
                        length: variant.lengthTicks,
                        voiceIndex: 0
                    };
                    // Metric compliance is independent of output-voice assignment because it only
                    // inspects temporal/pitch overlap against existing entries. Evaluate once per
                    // (variant, delay, transposition) candidate and reuse across voice placements.
                    if (!checkMetricCompliance(variant, metricProbeEntry, chain, variants, variantIndices, ppq, offsetTicks, tsNum, tsDenom)) continue;

                    for (let v = 0; v < options.ensembleTotal; v++) {
                        if (absStartTicks < voiceEndTimesTicks[v] - ppq) continue;

                        let stratFail = false;
                        for (const { entry: e, pairRecord } of overlappingPairs) {
                            // Voice-pair admissibility (precomputed, includes spacing rules)
                            if (!pairRecord.allowedVoicePairs.has(`${e.voiceIndex}->${v}`)) {
                                stratFail = true;
                                break;
                            }

                            // P4 bass-role check: use precomputed per-bass-role compatibility.
                            // No re-scanning needed — results are cached in the pairwise record.
                            const pairBassIdx = options.ensembleTotal - 1;
                            if (pairRecord.hasFourth) {
                                let bassRole: PairwiseBassRole = 'none';
                                if (e.voiceIndex === pairBassIdx && v !== pairBassIdx) bassRole = 'a';
                                else if (v === pairBassIdx && e.voiceIndex !== pairBassIdx) bassRole = 'b';

                                if (bassRole !== 'none' && !pairRecord.bassRoleCompatible[bassRole]) {
                                    stratFail = true;
                                    break;
                                }
                            }
                        }
                        if (stratFail) continue;

                        const tempNextEntry: StrettoChainOption = {
                            ...metricProbeEntry,
                            voiceIndex: v
                        };

                        const newVoiceState = [...voiceEndTimesTicks];
                        newVoiceState[v] = absStartTicks + variant.lengthTicks;

                        edgesTraversed++;
                        // Propagate A.1 delay-set: add this delay if it's > Sb/3
                        const newUsedLongDelays = delayTicks > oneThirdSubjectTicks
                            ? new Set(usedLongDelays).add(delayTicks)
                            : usedLongDelays;

                        successors.push({
                            chain: [...chain, tempNextEntry],
                            variantIndices: [...variantIndices, varIdx],
                            voiceEndTimesTicks: newVoiceState,
                            nInv: nInv + (isInv ? 1 : 0),
                            nTrunc: nTrunc + (isTrunc ? 1 : 0),
                            nRestricted: nextRestricted,
                            nFree: nextFree,
                            usedLongDelays: newUsedLongDelays
                        });
                    }
                }
            }

        return successors;
    }

    const initialVoiceState = new Array(options.ensembleTotal).fill(0);
    initialVoiceState[options.subjectVoiceIndex] = variants[0].lengthTicks;

    const oneThirdSubjectTicks = subjectLengthTicks / 3;

    let frontier: DagNode[] = [{
        chain: [{ startBeat: 0, transposition: 0, type: 'N', length: variants[0].lengthTicks, voiceIndex: options.subjectVoiceIndex }],
        variantIndices: [0],
        voiceEndTimesTicks: initialVoiceState,
        nInv: 0,
        nTrunc: 0,
        nRestricted: 0,
        nFree: 1,
        usedLongDelays: new Set<number>()
    }];

    let maxFrontierSize = frontier.length;
    let maxFrontierClassCount = 1;
    let frontierSizeAtTermination = 0;
    let frontierClassesAtTermination = 0;

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
                const existing = nextLayer.get(nodeKey);
                if (existing) {
                    stageStats.deterministicDagMergedNodes++;
                    const existingSig = getMergeDeterminismSignature(existing);
                    const successorSig = getMergeDeterminismSignature(successor);
                    if (successorSig.localeCompare(existingSig) < 0) {
                        nextLayer.set(nodeKey, successor);
                    }
                    continue;
                }
                nextLayer.set(nodeKey, successor);
            }
        }

        frontier = resolveNextFrontierLayer(nextLayer, stopTraversal);

        // Record frontier state at termination (last iteration before loop exits)
        if (frontier.length === 0 || stopTraversal) {
            const termFrontier = stopTraversal ? Array.from(nextLayer.values()) : [];
            frontierSizeAtTermination = termFrontier.length;
            frontierClassesAtTermination = new Set(termFrontier.map((n) => frontierClassKey(n.chain))).size;
        }
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
            metricOffsetTicks: offsetTicks,
            timeoutExtensionAppliedMs,
            coverage: {
                nodeBudgetUsedPercent: roundToWholePercent(Math.min(1, nodesVisited / MAX_SEARCH_NODES)),
                maxFrontierSize,
                maxFrontierClassCount,
                edgesTraversed,
                frontierSizeAtTermination,
                frontierClassesAtTermination,
                // Lower-bound completion ratio: if frontier is empty, we exhausted the space.
                // Otherwise estimate from node budget usage.
                completionRatioLowerBound: frontierSizeAtTermination === 0
                    ? 100
                    : roundToWholePercent(Math.min(1, nodesVisited / (nodesVisited + frontierSizeAtTermination)))
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
