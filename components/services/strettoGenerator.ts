
import { RawNote, StrettoChainResult, StrettoSearchOptions, StrettoChainOption, StrettoConstraintMode, StrettoSearchReport } from '../../types';
import { INTERVALS, SCALE_INTERVALS } from './strettoConstants';
import { calculateStrettoScore, SubjectVariant, InternalNote } from './strettoScoring';
import { getInvertedPitch } from './strettoCore';

// --- Constants & Types ---
// Node budget removed — time is the only search limit.
const DEFAULT_TIME_LIMIT_MS = 30000;
const NEAR_COMPLETION_TIMEOUT_EXTENSION_MS = 10000;
const MAX_RESULTS = 50;
const EVENT_LOOP_YIELD_INTERVAL = 2048;
// Removed EARLY_WINDOW_OPTIMIZATION_MAX_ENTRY — no longer needed with active-tail DAG keys.

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
    allowedVoiceMaskRows: bigint[];
    // Per-bass-role compatibility: precomputed so traversal never re-scans.
    bassRoleCompatible: { none: boolean; a: boolean; b: boolean };
    // Per-bass-role dissonance detail for P4-as-bass resolution.
    bassRoleDissonanceRatio: { none: number; a: number; b: number };
    bassRoleMaxRunEvents: { none: number; a: number; b: number };
    bassRoleDissonanceRunSpans: { none: SimultaneitySpan[]; a: SimultaneitySpan[]; b: SimultaneitySpan[] };
    // Interval class of the transposition (mod 12), precomputed for quota checks.
    intervalClass: number;
    isRestrictedInterval: boolean;
    isFreeInterval: boolean;
    meetsAdjacentTranspositionSeparation: boolean;
}

interface PairTuple {
    vA: number;
    vB: number;
    d: number;
    t: number;
}

type PairwiseByTransposition = Map<number, PairwiseCompatibilityRecord>;
type PairwiseByDelay = Map<number, PairwiseByTransposition>;
type PairwiseByVariantB = Map<number, PairwiseByDelay>;
type PairwiseByVariantA = Map<number, PairwiseByVariantB>;

type TransitionBucketsByDelay = Map<number, NextTransition[]>;
type TransitionByTranspositionDelta = Map<number, TransitionBucketsByDelay>;
type TransitionByDelay = Map<number, TransitionByTranspositionDelta>;
type TransitionByVariantRight = Map<number, TransitionByDelay>;
type TransitionByVariantLeft = Map<number, TransitionByVariantRight>;

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
    dissonanceRunSpans: SimultaneitySpan[];
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

type AdmissiblePairIndex = Map<number, Map<number, Map<number, Set<number>>>>;

interface EntryStateAdmissibilityModel {
    admissiblePairKeys: AdmissiblePairIndex | null;
    statesVisited: number;
}

interface StructuralState {
    depth: number;
    prevVariantIndex: number;
    prevEntryLengthTicks: number;
    prevDelayTicks: number | null;
    prevPrevDelayTicks: number | null;
    prevTransposition: number;
    nInv: number;
    nTrunc: number;
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

function buildEntryStateAdmissibilityModel(
    variants: SubjectVariant[],
    allowedAbsoluteTranspositions: number[],
    relativeTranspositionDeltas: number[],
    delayStep: number,
    targetChainLength: number,
    options: StrettoSearchOptions
): EntryStateAdmissibilityModel {
    const allowedAbsoluteTranspositionSet = new Set(allowedAbsoluteTranspositions);
    const admissiblePairKeys: AdmissiblePairIndex = new Map();
    const addAdmissiblePair = (vA: number, vB: number, d: number, t: number): void => {
        let byVB = admissiblePairKeys.get(vA);
        if (!byVB) { byVB = new Map(); admissiblePairKeys.set(vA, byVB); }
        let byD = byVB.get(vB);
        if (!byD) { byD = new Map(); byVB.set(vB, byD); }
        let byT = byD.get(d);
        if (!byT) { byT = new Set(); byD.set(d, byT); }
        byT.add(t);
    };
    const stack: StructuralState[] = [{
        depth: 1,
        prevVariantIndex: 0,
        prevEntryLengthTicks: variants[0].lengthTicks,
        prevDelayTicks: null,
        prevPrevDelayTicks: null,
        prevTransposition: 0,
        nInv: 0,
        nTrunc: 0
    }];
    const visited = new Set<string>();

    while (stack.length > 0) {
        const state = stack.pop()!;
        if (state.depth >= targetChainLength) continue;

        let minD = delayStep;
        let maxD = Math.floor(state.prevEntryLengthTicks * (2 / 3));
        if (state.depth === 1) {
            minD = Math.floor(state.prevEntryLengthTicks * 0.5);
        } else {
            const prevDelayTicks = state.prevDelayTicks!;
            const prevSubjectLengthTicks = state.prevEntryLengthTicks;

            minD = Math.max(minD, prevDelayTicks - Math.floor(prevSubjectLengthTicks / 4));

            if (state.prevPrevDelayTicks !== null) {
                const prevPrevDelayTicks = state.prevPrevDelayTicks;
                if (prevDelayTicks > prevPrevDelayTicks && prevDelayTicks > (prevSubjectLengthTicks / 3)) {
                    maxD = Math.min(maxD, prevPrevDelayTicks - delayStep);
                }
            }

        }

        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;
        if (minD > maxD) continue;

        for (let delayTicks = minD; delayTicks <= maxD; delayTicks += delayStep) {
            if (state.depth >= 2) {
                const prevDelayTicks = state.prevDelayTicks!;
                const halfSubjectTicks = state.prevEntryLengthTicks / 2;
                if ((prevDelayTicks >= halfSubjectTicks || delayTicks >= halfSubjectTicks) && delayTicks >= prevDelayTicks) continue;
            }

            for (const relTransposition of relativeTranspositionDeltas) {
                if (relTransposition === 0) continue;
                if (Math.abs(relTransposition) < 5) continue;
                const nextPrevTransposition = state.prevTransposition + relTransposition;
                if (!allowedAbsoluteTranspositionSet.has(nextPrevTransposition)) continue;

                for (let nextVariantIndex = 0; nextVariantIndex < variants.length; nextVariantIndex++) {
                    const nextVariant = variants[nextVariantIndex];
                    const isInv = nextVariant.type === 'I';
                    const isTrunc = nextVariant.truncationBeats > 0;

                    const prevVariant = variants[state.prevVariantIndex];
                    const prevIsInv = prevVariant.type === 'I';
                    const prevIsTrunc = prevVariant.truncationBeats > 0;
                    if ((prevIsInv || prevIsTrunc) && (isInv || isTrunc)) continue;

                    if (isInv && !checkQuota(options.inversionMode, state.nInv)) continue;
                    if (isTrunc && !checkQuota(options.truncationMode, state.nTrunc)) continue;

                    addAdmissiblePair(state.prevVariantIndex, nextVariantIndex, delayTicks, relTransposition);

                    const nextInv = state.nInv + (isInv ? 1 : 0);
                    const nextTrunc = state.nTrunc + (isTrunc ? 1 : 0);
                    const nextDepth = state.depth + 1;
                    const visitKey = [
                        nextDepth,
                        nextVariantIndex,
                        delayTicks,
                        state.prevDelayTicks ?? -1,
                        nextPrevTransposition,
                        nextInv,
                        nextTrunc
                    ].join('|');
                    if (visited.has(visitKey)) continue;
                    visited.add(visitKey);
                    stack.push({
                        depth: nextDepth,
                        prevVariantIndex: nextVariantIndex,
                        prevEntryLengthTicks: nextVariant.lengthTicks,
                        prevDelayTicks: delayTicks,
                        prevPrevDelayTicks: state.prevDelayTicks,
                        prevTransposition: nextPrevTransposition,
                        nInv: nextInv,
                        nTrunc: nextTrunc
                    });
                }
            }
        }
    }

    return { admissiblePairKeys, statesVisited: visited.size };
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

// Sentinel empty arrays used when span collection is disabled (no allocation).
const NO_SPANS: SimultaneitySpan[] = [];
const NO_TICKS: number[] = [];


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
    tsDenom: number = 4,
    skipSpans: boolean = false
 ): PairwiseScanResult {
    return checkCounterpointStructureWithBassRole(variantA, variantB, delayTicks, transposition, maxDissonanceRatio, 'none', ppqParam, tsNum, tsDenom, skipSpans);
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
    tsDenom: number = 4,
    skipSpans: boolean = false
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
    const dissonanceSpans: SimultaneitySpan[] = skipSpans ? NO_SPANS : [];
    const p4Spans: SimultaneitySpan[] = skipSpans ? NO_SPANS : [];
    const parallelPerfectStartTicks: number[] = skipSpans ? NO_TICKS : [];
    let previousOrderingSign = 0;
    let maxDissonanceRunEvents = 0;
    let maxDissonanceRunTicks = 0;
    const maxAllowedContinuousDissonanceTicks = ppqParam;
    const dissonanceRunSpans: SimultaneitySpan[] = [];
    let runStartTick = 0;
    let runEndTick = 0;

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
            if (lastIsDiss) dissonanceRunSpans.push({ startTick: runStartTick, endTick: runEndTick });
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
            if (!skipSpans) p4Spans.push({ startTick: start, endTick: end });
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
                if (!skipSpans) parallelPerfectStartTicks.push(start);
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
            if (!skipSpans) dissonanceSpans.push({ startTick: start, endTick: end });
            dissonantTicks += dur;

            // For run length, we count *events* (intervals), not ticks
            if (!lastIsDiss) {
                runStartTick = start;
                dissRunLength = 1;
                dissRunTicks = dur;
            } else {
                dissRunLength++;
                dissRunTicks += dur;
            }
            runEndTick = end;
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);
            maxDissonanceRunTicks = Math.max(maxDissonanceRunTicks, dissRunTicks);

            // Rule C2: Event Limit (r <= 2)
            if (dissRunLength > 2) return { compatible: false, dissonanceRatio: 1, strongBeatParallels, weakBeatParallels, hasFourth, p4SimultaneityCount, hasVoiceCrossing, maxDissonanceRunEvents, maxDissonanceRunTicks, hasParallelPerfect58, dissonanceSpans, p4Spans, parallelPerfectStartTicks, dissonanceRunSpans };

            // Rule C2b: Continuous dissonance must resolve within one beat.
            if (dissRunTicks > maxAllowedContinuousDissonanceTicks) return { compatible: false, dissonanceRatio: 1, strongBeatParallels, weakBeatParallels, hasFourth, p4SimultaneityCount, hasVoiceCrossing, maxDissonanceRunEvents, maxDissonanceRunTicks, hasParallelPerfect58, dissonanceSpans, p4Spans, parallelPerfectStartTicks, dissonanceRunSpans };

            lastIsDiss = true;
        } else {
            if (lastIsDiss) dissonanceRunSpans.push({ startTick: runStartTick, endTick: runEndTick });
            maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);
            dissRunLength = 0;
            dissRunTicks = 0;
            lastIsDiss = false;
        }

        prevP1 = p1; prevP2 = p2;
    }

    if (lastIsDiss) dissonanceRunSpans.push({ startTick: runStartTick, endTick: runEndTick });

    // Strict Dissonance Ratio Filter
    if (overlapTicks > 0) {
        const ratio = dissonantTicks / overlapTicks;
        if (ratio > maxDissonanceRatio) return { compatible: false, dissonanceRatio: ratio, strongBeatParallels, weakBeatParallels, hasFourth, p4SimultaneityCount, hasVoiceCrossing, maxDissonanceRunEvents, maxDissonanceRunTicks, hasParallelPerfect58, dissonanceSpans, p4Spans, parallelPerfectStartTicks, dissonanceRunSpans };
    }

    maxDissonanceRunEvents = Math.max(maxDissonanceRunEvents, dissRunLength);
    maxDissonanceRunTicks = Math.max(maxDissonanceRunTicks, dissRunTicks);
    return { compatible: true, dissonanceRatio: overlapTicks > 0 ? dissonantTicks / overlapTicks : 0, strongBeatParallels, weakBeatParallels, hasFourth, p4SimultaneityCount, hasVoiceCrossing, maxDissonanceRunEvents, maxDissonanceRunTicks, hasParallelPerfect58, dissonanceSpans, p4Spans, parallelPerfectStartTicks, dissonanceRunSpans };
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
    const bassIdx = ensembleTotal - 1;
    const altoIdx = bassIdx - 2;

    if (highTrans < lowTrans) return false;
    if (dist === 1 && lowVoiceIdx === bassIdx && highTrans < lowTrans + 7) return false;
    if (dist === 2 && highTrans < lowTrans + 7) return false;
    if (dist >= 3 && highTrans < lowTrans + 12) return false;

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

function buildAllowedVoiceMaskRows(
    transpositionAB: number,
    ensembleTotal: number,
    disallowLowestPair: boolean
): bigint[] {
    const rows = Array.from({ length: ensembleTotal }, () => 0n);
    for (let voiceA = 0; voiceA < ensembleTotal; voiceA++) {
        let rowMask = 0n;
        for (let voiceB = 0; voiceB < ensembleTotal; voiceB++) {
            if (voiceA === voiceB) continue;
            if (isVoicePairAllowedForTransposition(voiceA, voiceB, transpositionAB, ensembleTotal, disallowLowestPair)) {
                rowMask |= (1n << BigInt(voiceB));
            }
        }
        rows[voiceA] = rowMask;
    }
    return rows;
}

function applyBassRoleCompatibilityMaskRows(record: PairwiseCompatibilityRecord, bassIdx: number): bigint[] {
    if (!record.hasFourth || (record.bassRoleCompatible.a && record.bassRoleCompatible.b)) {
        return record.allowedVoiceMaskRows;
    }

    const bassBit = (1n << BigInt(bassIdx));
    return record.allowedVoiceMaskRows.map((rowMask, sourceVoice) => {
        if (sourceVoice === bassIdx) {
            if (record.bassRoleCompatible.a) return rowMask;
            return rowMask & bassBit;
        }

        if (record.bassRoleCompatible.b) return rowMask;
        return rowMask & ~bassBit;
    });
}

function hasFeasibleTripletAssignment(
    abRows: bigint[],
    bcRows: bigint[],
    ensembleTotal: number,
    acRows?: bigint[]
): boolean {
    for (let v1 = 0; v1 < ensembleTotal; v1++) {
        for (let v2 = 0; v2 < ensembleTotal; v2++) {
            if (v1 === v2) continue;
            if ((abRows[v1] & (1n << BigInt(v2))) === 0n) continue;

            for (let v3 = 0; v3 < ensembleTotal; v3++) {
                if (v1 === v3 || v2 === v3) continue;
                if ((bcRows[v2] & (1n << BigInt(v3))) === 0n) continue;
                if (acRows && (acRows[v1] & (1n << BigInt(v3))) === 0n) continue;
                return true;
            }
        }
    }
    return false;
}


/**
 * PHASE 5 CHECK: Metric Compliance
 * REFACTORED: Uses Scan-Line algorithm on raw ticks.
 */
type NoteEvent = [number, number, number]; // [start, end, pitch]

function checkMetricCompliance(
    newVariant: SubjectVariant,
    newEntry: StrettoChainOption,
    chain: StrettoChainOption[],
    variants: SubjectVariant[],
    variantIndices: number[],
    ppq: number,
    metricOffset: number = 0,
    tsNum: number = 4,
    tsDenom: number = 4,
    prebuiltChainNoteEvents?: NoteEvent[]
): boolean {

    const newStartTick = Math.round(newEntry.startBeat * ppq);

    // Build allNoteEvents: new entry notes + chain notes.
    // If chain notes are pre-built (hoisted from expandNode), reuse them.
    const allNoteEvents: NoteEvent[] = [];
    for (const n of newVariant.notes) {
        allNoteEvents.push([newStartTick + n.relTick, newStartTick + n.relTick + n.durationTicks, n.pitch + newEntry.transposition]);
    }
    if (prebuiltChainNoteEvents) {
        for (const ev of prebuiltChainNoteEvents) allNoteEvents.push(ev);
    } else {
        for (let k = 0; k < chain.length; k++) {
            const eStart = Math.round(chain[k].startBeat * ppq);
            for (const n of variants[variantIndices[k]].notes) {
                allNoteEvents.push([eStart + n.relTick, eStart + n.relTick + n.durationTicks, n.pitch + chain[k].transposition]);
            }
        }
    }
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

        const overlapStart = Math.max(newStartTick, existStartTick);
        const overlapEnd = Math.min(newStartTick + newVariant.lengthTicks, existStartTick + existVariant.lengthTicks);

        if (overlapEnd <= overlapStart) continue;

        const points = new Set<number>();
        points.add(overlapStart); points.add(overlapEnd);

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
            if (!isDiss && interval === 5 && lo === overallBassAt(start)) isDiss = true;

            // Corrected Metric Check using Absolute Grid alignment
            const isStrong = isStrongBeat(start + metricOffset, ppq, tsNum, tsDenom);

            if (isDiss) {
                if (!lastIsDiss) dissRunLength = 1; else dissRunLength++;
                if (isStrong && dissRunLength > 1) return false;
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

export function violatesCombinedDissonanceStarts(
    runSpans: SimultaneitySpan[],
    ppq: number,
    metricOffset: number = 0
): boolean {
    if (runSpans.length === 0) return false;
    // Sort runs by start tick, then merge adjacent/overlapping into macro-runs.
    // A-B's run [15,16], A-C's [16,17], A-B's [17,18] → one macro-run of count 3.
    // Two runs are part of the same macro-run when the earlier ends at or after the later starts.
    runSpans.sort((a, b) => a.startTick - b.startTick);
    let macroRunCount = 0;
    let macroRunEnd = -Infinity;
    let prevStart = -Infinity;
    for (const span of runSpans) {
        if (span.startTick <= macroRunEnd) {
            // Adjacent or overlapping: extend current macro-run.
            macroRunCount++;
            macroRunEnd = Math.max(macroRunEnd, span.endTick);
        } else {
            // Gap: start a new macro-run.
            macroRunCount = 1;
            macroRunEnd = span.endTick;
            prevStart = span.startTick;
        }
        const isStrong = isStrongBeat(span.startTick + metricOffset, ppq);
        if (macroRunCount > 2) return true;
        if (isStrong && macroRunCount > 1) return true;
        if (macroRunCount === 2) {
            const prevIsStrong = isStrongBeat(prevStart + metricOffset, ppq);
            if (isStrong || prevIsStrong) return true;
        }
        if (macroRunCount === 1) prevStart = span.startTick;
    }
    return false;
}

// --- Generator ---

export async function searchStrettoChains(
    rawSubject: RawNote[],
    options: StrettoSearchOptions,
    ppq: number
): Promise<StrettoSearchReport> {

    const toTripleKey = (vA: number, vB: number, vC: number, d1: number, d2: number, t1: number, t2: number): string => toCanonicalTripletKey({
        variantA: vA,
        variantB: vB,
        variantC: vC,
        delayAB: d1,
        delayBC: d2,
        transpositionAB: t1,
        transpositionBC: t2
    });

    const pairwiseCompatibleTriplets: PairwiseByVariantA = new Map();
    const validPairsList: PairTuple[] = [];

    const setPairRecord = (vA: number, vB: number, d: number, t: number, record: PairwiseCompatibilityRecord): void => {
        let byVariantB = pairwiseCompatibleTriplets.get(vA);
        if (!byVariantB) {
            byVariantB = new Map();
            pairwiseCompatibleTriplets.set(vA, byVariantB);
        }
        let byDelay = byVariantB.get(vB);
        if (!byDelay) {
            byDelay = new Map();
            byVariantB.set(vB, byDelay);
        }
        let byTransposition = byDelay.get(d);
        if (!byTransposition) {
            byTransposition = new Map();
            byDelay.set(d, byTransposition);
        }
        if (byTransposition.has(t)) return;
        byTransposition.set(t, record);
        validPairsList.push({ vA, vB, d, t });
    };

    const getPairRecord = (vA: number, vB: number, d: number, t: number): PairwiseCompatibilityRecord | undefined => {
        return pairwiseCompatibleTriplets.get(vA)?.get(vB)?.get(d)?.get(t);
    };

    const transitionsByWindow: TransitionByVariantLeft = new Map();
    const appendWindowTransition = (variantLeft: number, variantRight: number, delayTicks: number, transpositionDelta: number, transition: NextTransition): void => {
        let byVariantRight = transitionsByWindow.get(variantLeft);
        if (!byVariantRight) {
            byVariantRight = new Map();
            transitionsByWindow.set(variantLeft, byVariantRight);
        }
        let byDelay = byVariantRight.get(variantRight);
        if (!byDelay) {
            byDelay = new Map();
            byVariantRight.set(variantRight, byDelay);
        }
        let byTranspositionDelta = byDelay.get(delayTicks);
        if (!byTranspositionDelta) {
            byTranspositionDelta = new Map();
            byDelay.set(delayTicks, byTranspositionDelta);
        }
        let transitionsAtDelay = byTranspositionDelta.get(transpositionDelta);
        if (!transitionsAtDelay) {
            transitionsAtDelay = new Map();
            byTranspositionDelta.set(transpositionDelta, transitionsAtDelay);
        }
        const bucket = transitionsAtDelay.get(transition.delayTicks);
        if (bucket) bucket.push(transition);
        else transitionsAtDelay.set(transition.delayTicks, [transition]);
    };

    const getWindowTransitions = (variantLeft: number, variantRight: number, delayTicks: number, transpositionDelta: number): TransitionBucketsByDelay | undefined => {
        return transitionsByWindow.get(variantLeft)?.get(variantRight)?.get(delayTicks)?.get(transpositionDelta);
    };

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

    // Delays happen in half-beat intervals (8th notes)
    const delayStep = ppq / 2;

    // Adjacent delays: used for triplet enumeration (rule A.6 cap at 2/3 Sb)
    const validAdjacentDelays: number[] = [];
    const maxAdjacentDelayTicks = Math.floor(subjectLengthTicks * (2/3));
    for (let d = delayStep; d <= maxAdjacentDelayTicks; d += delayStep) validAdjacentDelays.push(d);

    // Pairwise delays: extends to Sb - delayStep for long-range pair lookups.
    // Entries i and j overlap whenever cumulative delay < Sb, which can exceed 2/3 Sb.
    const validPairwiseDelays: number[] = [];
    const maxPairwiseDelayTicks = subjectLengthTicks - delayStep;
    for (let d = delayStep; d <= maxPairwiseDelayTicks; d += delayStep) validPairwiseDelays.push(d);

    // Legacy alias used by stageStats and admissibility model
    const validDelays = validAdjacentDelays;
    
    const transpositions = Array.from(INTERVALS.TRAD_TRANSPOSITIONS);
    if (options.thirdSixthMode !== 'None') {
        INTERVALS.THIRD_SIXTH_TRANSPOSITIONS.forEach(t => transpositions.push(t));
    }
    const allowedTranspositions = new Set(transpositions);
    const relativeTranspositionDeltas = Array.from(new Set(
        transpositions.flatMap((left) => transpositions.map((right) => right - left))
    ));


    // D.0: Pre-search voice domain filter derived from e0's fixed voice + T(e0)=0.
    // For each transposition value in the pool, compute which voices can host an entry at that
    // transposition while satisfying ordering/spacing rules relative to e0.
    // Transpositions with an empty valid-voice set can be eliminated before BFS begins.
    const sv = options.subjectVoiceIndex;
    const allowedVoicesForTrans = new Map<number, number[]>();
    for (const t of transpositions) {
        const validVoices: number[] = [];
        for (let v = 0; v < options.ensembleTotal; v++) {
            if (v === sv || isVoicePairAllowedForTransposition(sv, v, t, options.ensembleTotal, false)) {
                validVoices.push(v);
            }
        }
        allowedVoicesForTrans.set(t, validVoices);
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

    const collectSpans = options.collectDiagnosticSpans === true;
    const forceFullPairwiseDiagnostic = collectSpans || process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE === '1';
    const entryStateAdmissibilityModel = forceFullPairwiseDiagnostic
        ? { admissiblePairKeys: null, statesVisited: 0 }
        : buildEntryStateAdmissibilityModel(
            variants,
            transpositions,
            relativeTranspositionDeltas,
            delayStep,
            options.targetChainLength,
            options
        );

    // Phase 1: STRUCTURAL PAIRWISE PRECOMPUTATION
    // Compute all 3 bass-role scans (none, a, b) at precomp time so traversal never re-scans.
    // Also precompute interval class metadata for quota checks.
    for (let iA = 0; iA < variants.length; iA++) {
        const vA = variants[iA];
        for (let iB = 0; iB < variants.length; iB++) {
            const vB = variants[iB];
            // Optimization: if variant A is truncated, pairs only overlap when d < lenA.
            const maxDelayForVA = vA.lengthTicks;
            for (const d of validPairwiseDelays) {
                if (d >= maxDelayForVA) break; // No overlap possible beyond variant A's length
                for (const t of relativeTranspositionDeltas) {
                    // Admissibility model only covers adjacent delays (≤ 2/3 Sb).
                    // Extended delays (> 2/3 Sb) are for long-range lookups only — precompute unconditionally.
                    const admissiblePairKeys = entryStateAdmissibilityModel.admissiblePairKeys;
                    if (admissiblePairKeys && d <= maxAdjacentDelayTicks && !admissiblePairKeys.get(iA)?.get(iB)?.get(d)?.has(t)) {
                        continue;
                    }
                    stageStats.pairwiseTotal++;

                    operationCounter++;
                    if (shouldYieldToEventLoop(operationCounter)) {
                        await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    }

                    // Neutral scan (P4 treated as provisionally consonant)
                    stageStats.structuralScanInvocations++;
                    const pairScan = checkCounterpointStructureWithBassRole(vA, vB, d, t, options.maxPairwiseDissonance, 'none', ppq, tsNum, tsDenom, !collectSpans);
                    if (collectSpans) {
                        appendUniqueSpansCapped(stageStats.dissonanceSpans, pairScan.dissonanceSpans);
                        appendUniqueSpansCapped(stageStats.p4Spans, pairScan.p4Spans);
                        appendUniqueCapped(stageStats.parallelPerfectLocationTicks, pairScan.parallelPerfectStartTicks);
                    }
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
                            return checkCounterpointStructureWithBassRole(vA, vB, d, t, options.maxPairwiseDissonance, 'a', ppq, tsNum, tsDenom, true);
                        })()
                        : pairScan;
                    const bassStrictB = requiresBassRoleRescan
                        ? (() => {
                            stageStats.structuralScanInvocations++;
                            return checkCounterpointStructureWithBassRole(vA, vB, d, t, options.maxPairwiseDissonance, 'b', ppq, tsNum, tsDenom, true);
                        })()
                        : pairScan;

                    const disallowLowestPair = shouldPruneLowestVoicePair(bassStrictA.compatible, bassStrictB.compatible);
                    const allowedVoicePairs = buildAllowedVoicePairs(t, options.ensembleTotal, disallowLowestPair);
                    const allowedVoiceMaskRows = buildAllowedVoiceMaskRows(t, options.ensembleTotal, disallowLowestPair);
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

                    setPairRecord(iA, iB, d, t, {
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
                        allowedVoiceMaskRows,
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
                        bassRoleDissonanceRunSpans: {
                            none: pairScan.dissonanceRunSpans,
                            a: bassStrictA.dissonanceRunSpans,
                            b: bassStrictB.dissonanceRunSpans
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
    // Numeric window-transition index is precomputed once so expandNode never rebuilds it.

    const pairsByFirst = new Map<number, PairTuple[]>();
    for (const p of validPairsList) {
        if (!pairsByFirst.has(p.vA)) pairsByFirst.set(p.vA, []);
        pairsByFirst.get(p.vA)!.push(p);
    }

    for (const p1 of validPairsList) {
        const pairAB = getPairRecord(p1.vA, p1.vB, p1.d, p1.t);
        if (!pairAB) continue;

        const nextPairs = pairsByFirst.get(p1.vB) || [];
        for (const p2 of nextPairs) {
            stageStats.tripleCandidates++;
            operationCounter++;
            if (shouldYieldToEventLoop(operationCounter)) {
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
            const pairBC = getPairRecord(p2.vA, p2.vB, p2.d, p2.t);
            if (!pairBC) continue;

            const d1 = p1.d;
            const d2 = p2.d;

            // A.10: no truncated entries at delay >= 0.5*Sb
            // vB (= p1.vB = p2.vA) enters at delay d1; vC enters at delay d2
            if (d1 >= subjectLengthTicks / 2 && variants[p1.vB].truncationBeats > 0) continue;
            if (d2 >= subjectLengthTicks / 2 && variants[p2.vB].truncationBeats > 0) continue;

            // A.7: Adjacent transposition separation >= 5 semitones (both edges)
            if (!pairAB.meetsAdjacentTranspositionSeparation) continue;
            if (!pairBC.meetsAdjacentTranspositionSeparation) continue;

            // A.8: Transform-following — transformed entry must be followed by normal
            const vAVariant = variants[p1.vA];
            const vBVariant = variants[p1.vB];
            const vCVariant = variants[p2.vB];
            const aTransformed = vAVariant.type === 'I' || vAVariant.truncationBeats > 0;
            const bTransformed = vBVariant.type === 'I' || vBVariant.truncationBeats > 0;
            const cTransformed = vCVariant.type === 'I' || vCVariant.truncationBeats > 0;
            if (aTransformed && bTransformed) continue;
            if (bTransformed && cTransformed) continue;

            // A.1 local: within-triplet delay uniqueness
            if (d1 === d2) continue;

            // A.2: Half-length contraction (OR form) — if d1 >= Sb/2 or d2 >= Sb/2, then d2 < d1
            if ((d1 >= subjectLengthTicks / 2 || d2 >= subjectLengthTicks / 2) && d2 >= d1) continue;

            // A.5: Maximum contraction bound — d1 − d2 ≤ 0.25 × Sb
            if (d1 - d2 > subjectLengthTicks / 4) continue;

            // A.4: Post-truncation contraction — after truncated entry, next delay contracts by >= 1 beat
            if (vBVariant.truncationBeats > 0 && d1 >= subjectLengthTicks / 3 && d2 > d1 - ppq) continue;

            // Rule: Max Expansion (using ticks, assuming step size)
            if (!passesTripletStage(stageStats, d2 <= d1 + delayStep)) continue;
            
            // Rule: Pair A->C compatibility (if overlapping)
            const vA = p1.vA;
            const vC = p2.vB;
            const dAC = d1 + d2;
            const tAC = p1.t + p2.t;
            
            const lenA = variants[vA].lengthTicks;
            if (dAC < lenA) {
                const pairAC = getPairRecord(vA, vC, dAC, tAC);
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
            const pairAC_rec = (dAC < lenA) ? getPairRecord(vA, vC, dAC, tAC) ?? null : null;

            const bassIdx = options.ensembleTotal - 1;
            const spacingFeasible = hasFeasibleTripletAssignment(
                pairAB.allowedVoiceMaskRows,
                pairBC.allowedVoiceMaskRows,
                options.ensembleTotal,
                pairAC_rec?.allowedVoiceMaskRows
            );

            const possibleAssignment = spacingFeasible && hasFeasibleTripletAssignment(
                applyBassRoleCompatibilityMaskRows(pairAB, bassIdx),
                applyBassRoleCompatibilityMaskRows(pairBC, bassIdx),
                options.ensembleTotal,
                pairAC_rec ? applyBassRoleCompatibilityMaskRows(pairAC_rec, bassIdx) : undefined
            );

            if (!possibleAssignment) {
                if (!spacingFeasible) {
                    stageStats.tripleVoiceRejected++;
                } else {
                    stageStats.tripleP4BassRejected++;
                }
                passesGlobalLineageStage(stageStats, false);
                continue;
            }
            
            const key = toTripleKey(vA, p1.vB, vC, d1, d2, p1.t, p2.t);
            harmonicallyValidTriples.add(key);

            const nextTransition: NextTransition = {
                nextVariantIndex: vC,
                delayTicks: d2,
                transpositionDelta: p2.t,
                pairRecord: pairBC,
                isRestrictedInterval: pairBC.isRestrictedInterval,
                isFreeInterval: pairBC.isFreeInterval
            };
            appendWindowTransition(vA, p1.vB, d1, p1.t, nextTransition);

            stageStats.harmonicallyValidTriples++;
        }
    }

    // --- Triplet suffix/prefix index for triplet-join Phase A ---
    // Each TripletRecord captures a valid triplet with its pairwise records for
    // cross-triplet dissonance union checks. Indexed by suffix (last two entries)
    // and prefix (first two entries) for efficient joining of overlapping windows.
    interface TripletRecord {
        vA: number; vB: number; vC: number;
        d1: number; d2: number;
        tAB: number; tBC: number;
        pairAB: PairwiseCompatibilityRecord;
        pairBC: PairwiseCompatibilityRecord;
        pairAC: PairwiseCompatibilityRecord | null; // null if A and C don't overlap
    }

    const allTripletRecords: TripletRecord[] = [];
    // Suffix index: key = `${vB}|${vC}|${d2}|${tBC}` → triplets ending with that pair
    const tripletsBySuffix = new Map<string, TripletRecord[]>();
    // Prefix index: key = `${vA}|${vB}|${d1}|${tAB}` → triplets starting with that pair
    const tripletsByPrefix = new Map<string, TripletRecord[]>();

    for (const p1 of validPairsList) {
        const pairAB = getPairRecord(p1.vA, p1.vB, p1.d, p1.t);
        if (!pairAB) continue;
        const nextPairsForIdx = pairsByFirst.get(p1.vB) || [];
        for (const p2 of nextPairsForIdx) {
            const tripleKey = toTripleKey(p1.vA, p1.vB, p2.vB, p1.d, p2.d, p1.t, p2.t);
            if (!harmonicallyValidTriples.has(tripleKey)) continue;

            const pairBC = getPairRecord(p2.vA, p2.vB, p2.d, p2.t)!;
            const dAC = p1.d + p2.d;
            const tAC = p1.t + p2.t;
            const lenA = variants[p1.vA].lengthTicks;
            const pairAC = dAC < lenA ? getPairRecord(p1.vA, p2.vB, dAC, tAC) ?? null : null;

            const rec: TripletRecord = {
                vA: p1.vA, vB: p1.vB, vC: p2.vB,
                d1: p1.d, d2: p2.d,
                tAB: p1.t, tBC: p2.t,
                pairAB, pairBC, pairAC
            };
            allTripletRecords.push(rec);

            const suffixKey = `${rec.vB}|${rec.vC}|${rec.d2}|${rec.tBC}`;
            let suffixList = tripletsBySuffix.get(suffixKey);
            if (!suffixList) { suffixList = []; tripletsBySuffix.set(suffixKey, suffixList); }
            suffixList.push(rec);

            const prefixKey = `${rec.vA}|${rec.vB}|${rec.d1}|${rec.tAB}`;
            let prefixList = tripletsByPrefix.get(prefixKey);
            if (!prefixList) { prefixList = []; tripletsByPrefix.set(prefixKey, prefixList); }
            prefixList.push(rec);
        }
    }

    // Index triplets by first variant for seeding
    const tripletsByFirstVariant = new Map<number, TripletRecord[]>();
    for (const rec of allTripletRecords) {
        let list = tripletsByFirstVariant.get(rec.vA);
        if (!list) { list = []; tripletsByFirstVariant.set(rec.vA, list); }
        list.push(rec);
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
        nInv: number;
        nTrunc: number;
        nRestricted: number;
        nFree: number;
        usedLongDelays: Set<number>; // A.1: delays > Sb/3 must be globally unique
        longDelaySignature: string;
    }

    // --- Active-tail DAG key ---
    // Two nodes are merge-equivalent if they produce the same set of future expansions.
    // Future expansion depends ONLY on:
    //   1. Entries still sounding ("active") — these determine overlap pair checks for new candidates
    //   2. The transition window (last 2 entries) — for indexed transition lookups
    //   3. The previous-previous delay — for expansion recoil (when the 3rd-to-last entry is inactive)
    //   4. Quotas (nInv, nTrunc, nRestricted, nFree)
    //   5. Used long delays (A.1 uniqueness)
    // Items 1-2 subsume voice end times: active entries fully determine which voices are occupied;
    // non-active voices are always available since their end time <= lastEntry.startTick < any candidate.
    function getDagNodeKey(node: DagNode): string {
        const depth = node.chain.length;
        if (depth <= 1) return 'root';

        const lastEntry = node.chain[depth - 1];
        const lastStartTicks = Math.round(lastEntry.startBeat * ppq);

        // Active entries: entries whose sound extends past the last entry's start time.
        // Only these can overlap with future candidates (which start after lastEntry).
        // The last entry itself is always active; encode it and all earlier still-sounding entries.
        let activeSig = '';
        for (let k = depth - 1; k >= 0; k--) {
            const e = node.chain[k];
            const eStart = Math.round(e.startBeat * ppq);
            // Upper-bound early termination: if even the longest variant can't reach lastStartTicks
            // from this entry's start, no earlier entry can either.
            if (eStart + subjectLengthTicks <= lastStartTicks) break;
            const eEnd = eStart + variants[node.variantIndices[k]].lengthTicks;
            if (eEnd > lastStartTicks) {
                activeSig += `${node.variantIndices[k]},${eStart},${e.transposition};`;
            }
        }

        // Previous-previous delay: needed for expansion recoil (A.3) when depth >= 3.
        // If the 3rd-to-last entry is active, this is derivable from activeSig; including
        // it explicitly is cheap and handles the case where it has gone inactive.
        let prevPrevDelay = -1;
        if (depth >= 3) {
            prevPrevDelay = Math.round(node.chain[depth - 2].startBeat * ppq)
                         - Math.round(node.chain[depth - 3].startBeat * ppq);
        }

        return `${depth}|${activeSig}|pp:${prevPrevDelay}|q:${node.nInv},${node.nTrunc},${node.nRestricted},${node.nFree}|ld:${node.longDelaySignature}`;
    }

    // D.4: Post-hoc CSP voice assignment.
    // Assigns voice indices to a completed chain via backtracking, enforcing:
    //   - Voice ordering constraints for ALL temporal pairs (§B), not just simultaneous ones
    //   - §C re-entry (voice may not accept a new entry until 1 beat before its occupant ends)
    //   - P4 bass-role dissonance constraint for overlapping pairs
    // Returns the chain with voiceIndex filled in, or null if no valid assignment exists.
    function assignVoices(chain: StrettoChainOption[], vIndices: number[]): StrettoChainOption[] | null {
        const n = chain.length;
        const voices = new Array<number>(n).fill(-1);
        const bassIdx = options.ensembleTotal - 1;

        // Two entries conflict in time if they sound simultaneously (with 1-beat re-entry window).
        function conflicts(i: number, j: number): boolean {
            const iStart = Math.round(chain[i].startBeat * ppq);
            const jStart = Math.round(chain[j].startBeat * ppq);
            if (iStart > jStart) return conflicts(j, i);
            const iEnd = iStart + variants[vIndices[i]].lengthTicks;
            return jStart < iEnd - ppq;
        }

        function valid(pos: number, v: number): boolean {
            for (let k = 0; k < pos; k++) {
                // Voice ordering applies to ALL temporal pairs — even after prior entry has ended.
                if (!isVoicePairAllowedForTransposition(
                    voices[k], v,
                    chain[pos].transposition - chain[k].transposition,
                    options.ensembleTotal,
                    false
                )) return false;
                // §C: entries that conflict in time cannot share a voice.
                if (conflicts(k, pos) && voices[k] === v) return false;
                // P4 bass-role dissonance: only applicable to overlapping pairs.
                if (conflicts(k, pos)) {
                    const kStart = Math.round(chain[k].startBeat * ppq);
                    const posStart = Math.round(chain[pos].startBeat * ppq);
                    const [eIdx, lIdx] = kStart <= posStart ? [k, pos] : [pos, k];
                    const relDelay = Math.round(chain[lIdx].startBeat * ppq) - Math.round(chain[eIdx].startBeat * ppq);
                    const relTrans = chain[lIdx].transposition - chain[eIdx].transposition;
                    const rec = getPairRecord(vIndices[eIdx], vIndices[lIdx], relDelay, relTrans);
                    if (rec?.hasFourth) {
                        const eV = kStart <= posStart ? voices[k] : v;
                        const lV = kStart <= posStart ? v : voices[k];
                        let bassRole: PairwiseBassRole = 'none';
                        if (eV === bassIdx && lV !== bassIdx) bassRole = 'a';
                        else if (lV === bassIdx && eV !== bassIdx) bassRole = 'b';
                        if (bassRole !== 'none' && !rec.bassRoleCompatible[bassRole]) return false;
                    }
                }
            }
            return true;
        }

        function backtrack(pos: number): boolean {
            if (pos === n) return true;
            for (let v = 0; v < options.ensembleTotal; v++) {
                if (valid(pos, v)) {
                    voices[pos] = v;
                    if (backtrack(pos + 1)) return true;
                }
            }
            return false;
        }

        if (!backtrack(0)) return null;
        return chain.map((e, i) => ({ ...e, voiceIndex: voices[i] }));
    }

    function buildChainNoteEvents(chain: StrettoChainOption[], variantIndices: number[]): NoteEvent[] {
        const events: NoteEvent[] = [];
        for (let k = 0; k < chain.length; k++) {
            const eStart = Math.round(chain[k].startBeat * ppq);
            for (const n of variants[variantIndices[k]].notes) {
                events.push([eStart + n.relTick, eStart + n.relTick + n.durationTicks, n.pitch + chain[k].transposition]);
            }
        }
        return events;
    }

    function expandNode(node: DagNode): DagNode[] {
        const successors: DagNode[] = [];
        const { chain, variantIndices, nInv, nTrunc, nRestricted, nFree, usedLongDelays, longDelaySignature } = node;
        const depth = chain.length;
        const prevEntry = chain[depth - 1];

        // Sb/3 rule relaxations (A.1 repeat allowed, A.3 recoil skip) only activate
        // in the final third AND at depth >= 7. For chains of length >= 7, entries e1-e6
        // always use strict rules so triplet precomputation is simpler (no short-delay branches).
        const isFinalThird = depth >= 7 && depth >= options.targetChainLength - Math.ceil(options.targetChainLength / 3);
        const prevEntryLengthTicks = chain[depth - 1].length;

        // Hoist chain note events once per node so checkMetricCompliance doesn't rebuild per candidate
        const chainNoteEvents = buildChainNoteEvents(chain, variantIndices);

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
                // A.3 Expansion recoil: if d_{n-1} > d_{n-2} and d_{n-1} > Sb/3, then d_n < d_{n-2} - 0.5.
                // Under strict gate (depth < 7), the Sb/3 threshold is bypassed — recoil always applies.
                const recoilThresholdMet = !isFinalThird || prevDelayTicks > (prevSubjectLengthTicks / 3);
                if (prevDelayTicks > prevPrevDelayTicks && recoilThresholdMet) {
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

        let indexedTransitionsByDelay: TransitionBucketsByDelay | null = null;
        if (depth >= 2) {
            const windowDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
            const windowTranspositionDelta = chain[depth - 1].transposition - chain[depth - 2].transposition;
            stageStats.transitionWindowLookups++;
            const windowMap = getWindowTransitions(
                variantIndices[depth - 2],
                variantIndices[depth - 1],
                windowDelayTicks,
                windowTranspositionDelta
            );
            if (windowMap) {
                stageStats.transitionsReturned += windowMap.size;
                indexedTransitionsByDelay = windowMap;
            }

            // No indexed transition window means the chain prefix cannot be extended
            // under the second-order transition model; prune immediately.
            if (!indexedTransitionsByDelay || indexedTransitionsByDelay.size === 0) {
                return successors;
            }
        }

        for (const delayTicks of possibleDelaysTicks) {
            // A.1 Global Uniqueness: delays > Sb/3 must be unique across the chain.
            // Under the strict rule gate (depth < 7), ALL delays are treated as long
            // so uniqueness is always required. This simplifies triplet precomputation.
            const delayIsLong = delayTicks > oneThirdSubjectTicks || !isFinalThird;
            if (delayIsLong && usedLongDelays.has(delayTicks)) {
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
                const indexedTransitions = indexedTransitionsByDelay?.get(delayTicks);
                if (!indexedTransitions || indexedTransitions.length === 0) {
                    continue;
                }
                for (const transition of indexedTransitions) {
                    const t = prevTransposition + transition.transpositionDelta;
                    if (t === prevTransposition) continue;
                    // Keep absolute entry transpositions in the configured admissible set.
                    // Without this guard, summing adjacent legal deltas can drift to values
                    // (e.g. 14) outside the historical transposition vocabulary.
                    if (!allowedTranspositions.has(t)) continue;
                    // A.7 meetsAdjacentTranspositionSeparation: guaranteed by triplet precomp
                    stageStats.candidateTransitionsEnumerated++;
                    candidateTransitions.push({
                        varIdx: transition.nextVariantIndex,
                        t,
                        immPair: transition.pairRecord!,
                        isRestricted: transition.isRestrictedInterval!,
                        isFree: transition.isFreeInterval!
                    });
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
                    if (!allowedTranspositions.has(t)) continue;
                    for (let varIdx = 0; varIdx < variants.length; varIdx++) {
                        // A.9: e1 must not be inverted
                        if (depth === 1 && variants[varIdx].type === 'I') continue;
                        // A.10: no truncated entries at delay >= 0.5*Sb
                        if (delayTicks >= subjectLengthTicks / 2 && variants[varIdx].truncationBeats > 0) continue;
                        const immPrevVarIdx = variantIndices[depth - 1];
                        const immRelTrans = t - chain[depth - 1].transposition;
                        const immPair = getPairRecord(immPrevVarIdx, varIdx, delayTicks, immRelTrans);
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
                // A.9, A.10, A.8, A.2: depth=1 checked during candidate construction;
                // depth>=2 guaranteed by triplet precomp (A.7, A.8, A.10, A.2, A.5).

                if (isInv && !checkQuota(options.inversionMode, nInv)) continue;
                if (isTrunc && !checkQuota(options.truncationMode, nTrunc)) continue;

                const nextRestricted = nRestricted + (isRestricted ? 1 : 0);
                    const nextFree = nFree + (isFree ? 1 : 0);

                    if (nextRestricted > 1 && nextRestricted >= nextFree) continue;
                    if (isRestricted && !checkQuota(options.thirdSixthMode, nRestricted)) continue;
                    if (options.disallowComplexExceptions && (isInv || isTrunc) && isRestricted) continue;

                    // C.3: No duplicate transpositions among active entries at this entry point.
                    // An entry is "active" if its notes are still sounding when the new entry begins.
                    let transpositionDuplicate = false;
                    for (let k = chain.length - 1; k >= 0; k--) {
                        const kEntry = chain[k];
                        const kStartTicks = Math.round(kEntry.startBeat * ppq);
                        if (kStartTicks + subjectLengthTicks <= absStartTicks) break;
                        const kEndTicks = kStartTicks + variants[variantIndices[k]].lengthTicks;
                        if (absStartTicks >= kEndTicks) continue;
                        if (kEntry.transposition === t) { transpositionDuplicate = true; break; }
                    }
                    if (transpositionDuplicate) continue;

                    // Collect overlapping pairwise records for this candidate.
                    // Iterate backward: entries are chronologically ordered, so once an
                    // entry's start + maxVariantLength can't reach the candidate, no
                    // earlier entry can overlap either.
                    const overlappingPairs: { entry: StrettoChainOption; pairRecord: PairwiseCompatibilityRecord }[] = [];
                    let harmonicFail = false;
                    for (let k = chain.length - 2; k >= 0; k--) {
                        const prevE = chain[k];
                        const prevStartTicks = Math.round(prevE.startBeat * ppq);
                        if (prevStartTicks + subjectLengthTicks <= absStartTicks) break;
                        const prevVarIdx = variantIndices[k];
                        const prevEndTicks = prevStartTicks + variants[prevVarIdx].lengthTicks;
                        if (absStartTicks >= prevEndTicks) continue;

                        const relDelay = absStartTicks - prevStartTicks;
                        const relTrans = t - prevE.transposition;
                        const pairRecord = getPairRecord(prevVarIdx, varIdx, relDelay, relTrans);
                        if (!pairRecord) {
                            harmonicFail = true;
                            break;
                        }
                        overlappingPairs.push({ entry: prevE, pairRecord });
                    }
                    if (harmonicFail) continue;

                    // Combined dissonance-run gate: collect precomputed run spans from
                    // all overlapping pairs and check whether they form a texture-level
                    // streak longer than 2. Uses 'none' bass-role (fewest dissonance runs;
                    // 'a'/'b' can only add more via P4-as-bass) so pruning is conservative.
                    // Cheaper than checkMetricCompliance, so runs first.
                    const allRunSpans: SimultaneitySpan[] = [...immPair.bassRoleDissonanceRunSpans.none];
                    for (const { pairRecord } of overlappingPairs) {
                        for (const s of pairRecord.bassRoleDissonanceRunSpans.none) allRunSpans.push(s);
                    }
                    if (violatesCombinedDissonanceStarts(allRunSpans, ppq, offsetTicks)) continue;

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
                    if (!checkMetricCompliance(variant, metricProbeEntry, chain, variants, variantIndices, ppq, offsetTicks, tsNum, tsDenom, chainNoteEvents)) continue;

                    // D.0: Pre-search voice domain filter — skip candidates with no valid voice
                    // given e0's register constraints. Voice assignment is post-hoc (Option D).
                    if ((allowedVoicesForTrans.get(t)?.length ?? 0) === 0) continue;

                    edgesTraversed++;
                    // Propagate A.1 delay-set: under strict gate (depth < 7), all delays are tracked.
                    const needsNewLongDelaySet = delayIsLong && !usedLongDelays.has(delayTicks);
                    const newUsedLongDelays = needsNewLongDelaySet
                        ? new Set(usedLongDelays).add(delayTicks)
                        : usedLongDelays;
                    const newLongDelaySignature = needsNewLongDelaySet
                        ? Array.from(newUsedLongDelays).sort((a, b) => a - b).join(',')
                        : longDelaySignature;

                    successors.push({
                        chain: [...chain, metricProbeEntry],
                        variantIndices: [...variantIndices, varIdx],
                        nInv: nInv + (isInv ? 1 : 0),
                        nTrunc: nTrunc + (isTrunc ? 1 : 0),
                        nRestricted: nextRestricted,
                        nFree: nextFree,
                        usedLongDelays: newUsedLongDelays,
                        longDelaySignature: newLongDelaySignature
                    });
                }
            }

        return successors;
    }

    const oneThirdSubjectTicks = subjectLengthTicks / 3;

    // Deferred partial storage: raw chain data without voice assignment.
    // Voice assignment is deferred to post-search to avoid expensive CSP during traversal.
    interface DeferredPartial {
        chain: StrettoChainOption[];
        variantIndices: number[];
    }
    const deferredPartials: DeferredPartial[] = [];

    // Phase A/B boundary: BFS up to this depth, then DFS beyond.
    // The BFS handles depths 1–PHASE_A_DEPTH where DAG merging prunes the frontier.
    // Beyond this depth, delays are tight (branching factor ~1-20), so DFS is cheaper
    // than maintaining a frontier Map with key computation and merging.
    const PHASE_A_DEPTH = Math.min(6, options.targetChainLength);

    let frontier: DagNode[] = [{
        chain: [{ startBeat: 0, transposition: 0, type: 'N', length: variants[0].lengthTicks, voiceIndex: options.subjectVoiceIndex }],
        variantIndices: [0],
        nInv: 0,
        nTrunc: 0,
        nRestricted: 0,
        nFree: 1,
        usedLongDelays: new Set<number>(),
        longDelaySignature: ''
    }];

    let maxFrontierSize = frontier.length;
    let maxFrontierClassCount = 0;
    let frontierSizeAtTermination = 0;
    let frontierClassesAtTermination = 0;

    // --- Helper: check time/node limits and handle timeout extension ---
    function checkLimits(): boolean {
        if (Date.now() - startTime > activeTimeLimitMs) {
            const canExtend = timeoutExtensionAppliedMs === 0 && shouldExtendTimeoutNearCompletion(maxDepth, options.targetChainLength);
            if (canExtend) {
                timeoutExtensionAppliedMs = NEAR_COMPLETION_TIMEOUT_EXTENSION_MS;
                activeTimeLimitMs += timeoutExtensionAppliedMs;
            } else {
                if (!terminationReason) terminationReason = 'Timeout';
                return true;
            }
        }
        return false;
    }

    // --- Helper: record a completed chain ---
    function recordCompletedChain(chain: StrettoChainOption[], variantIndices: number[]): void {
        const sig = getChainSignature(chain);
        if (!seenSignatures.has(sig)) {
            seenSignatures.add(sig);
            const assigned = assignVoices([...chain], [...variantIndices]);
            if (assigned !== null) {
                unscoredResults.push({ entries: assigned, variantIndices: [...variantIndices] });
            }
        }
    }

    // --- Helper: record a partial chain (deferred voice assignment) ---
    function recordDeferredPartial(chain: StrettoChainOption[], variantIndices: number[]): void {
        if (deferredPartials.length >= MAX_PARTIALS) return;
        const sig = getChainSignature(chain);
        if (!seenPartialSigs.has(sig)) {
            seenPartialSigs.add(sig);
            deferredPartials.push({ chain: [...chain], variantIndices: [...variantIndices] });
        }
    }

    // --- Phase B: DFS from Phase A frontier to target depth ---
    // At this depth, delays are very tight (progressive tightening), so branching
    // factor is ~1-20 per level. DFS is cheaper than BFS frontier management.
    // Long-range pair checks are sparse: cumulative delay typically exceeds Sb,
    // so entries 3+ apart rarely overlap.
    function dfsExtend(node: DagNode): void {
        nodesVisited++;
        operationCounter++;
        maxDepth = Math.max(maxDepth, node.chain.length);

        if (node.chain.length === options.targetChainLength) {
            recordCompletedChain(node.chain, node.variantIndices);
            return;
        }

        if (node.chain.length >= 3) {
            recordDeferredPartial(node.chain, node.variantIndices);
        }

        if (checkLimits()) return;

        const successors = expandNode(node);
        for (const successor of successors) {
            dfsExtend(successor);
            if (terminationReason) return;
        }
    }

    // --- Triplet-Join Phase A (target >= 7) or BFS Phase A (target <= 6) ---
    // For long chains, the triplet-join builds 7-entry prefixes (e0 + e1–e6) by
    // seeding with valid triplets and extending one entry at a time via the
    // transition window index. This avoids re-deriving constraints already
    // established during triplet precomputation.

    if (options.targetChainLength >= 7 && allTripletRecords.length > 0) {
        // --- Triplet-Join Phase A: build 7-entry prefixes (e0–e6) ---
        const e0Entry: StrettoChainOption = {
            startBeat: 0, transposition: 0, type: 'N',
            length: variants[0].lengthTicks, voiceIndex: options.subjectVoiceIndex
        };
        const e0VarIdx = 0;
        const halfSubjectTicks = subjectLengthTicks / 2;
        const quarterSubjectTicks = subjectLengthTicks / 4;

        // Triplet-join state: tracks a growing prefix chain e0–eK.
        interface TripletJoinState {
            chain: StrettoChainOption[];
            variantIndices: number[];
            delays: number[]; // adjacent delays in ticks (delays[0] = e0→e1, delays[1] = e1→e2, ...)
            transpositions: number[]; // absolute transpositions
            nInv: number;
            nTrunc: number;
            nRestricted: number;
            nFree: number;
            usedLongDelays: Set<number>;
        }

        // Extend a triplet-join state by one entry (adding eK at depth K).
        // Returns valid successor states or empty array.
        function tripletJoinExtend(state: TripletJoinState): TripletJoinState[] {
            const depth = state.chain.length; // current chain length = next entry index
            if (depth < 3) return []; // need at least e0,e1,e2 before extending

            // Look up transition window for the last two entries
            const prevPrevVarIdx = state.variantIndices[depth - 2];
            const prevVarIdx = state.variantIndices[depth - 1];
            const prevDelay = state.delays[state.delays.length - 1];
            const prevTransDelta = state.transpositions[depth - 1] - state.transpositions[depth - 2];
            const windowMap = getWindowTransitions(prevPrevVarIdx, prevVarIdx, prevDelay, prevTransDelta);
            if (!windowMap || windowMap.size === 0) return [];

            const prevEntry = state.chain[depth - 1];
            const prevStartTicks = Math.round(prevEntry.startBeat * ppq);
            const prevEntryLen = prevEntry.length;

            // Compute delay bounds (same logic as expandNode)
            let minD = delayStep;
            let maxD = Math.floor(prevEntryLen * (2 / 3));

            const prevDelayTicks = state.delays[state.delays.length - 1];
            const prevSubjectLen = prevEntry.length;

            // A.2 Half-length contraction (OR form)
            if (prevDelayTicks >= (prevSubjectLen / 2)) maxD = Math.min(maxD, prevDelayTicks - delayStep);
            else maxD = Math.min(maxD, prevDelayTicks + delayStep);

            // A.5 Maximum contraction bound
            minD = Math.max(minD, prevDelayTicks - Math.floor(prevSubjectLen / 4));

            // A.3 Expansion recoil (strict: always applies for depth < 7)
            if (depth >= 3 && state.delays.length >= 2) {
                const prevPrevDelay = state.delays[state.delays.length - 2];
                if (prevDelayTicks > prevPrevDelay) {
                    maxD = Math.min(maxD, prevPrevDelay - delayStep);
                }
            }

            // A.4 Post-truncation contraction
            const prevIsTrunc = variants[prevVarIdx].truncationBeats > 0;
            if (prevIsTrunc && prevDelayTicks >= (prevSubjectLen / 3)) {
                maxD = Math.min(maxD, prevDelayTicks - (2 * delayStep));
            }

            minD = Math.ceil(minD / delayStep) * delayStep;
            maxD = Math.floor(maxD / delayStep) * delayStep;

            const results: TripletJoinState[] = [];

            for (let d = minD; d <= maxD; d += delayStep) {
                // A.1 Global uniqueness (strict: all delays are long for depth < 7)
                if (state.usedLongDelays.has(d)) continue;

                // A.1 No adjacent equal delays
                if (Math.abs(d - prevDelayTicks) < 1) continue;

                const indexedTransitions = windowMap.get(d);
                if (!indexedTransitions || indexedTransitions.length === 0) continue;

                const absStartTicks = prevStartTicks + d;
                const absStartBeat = absStartTicks / ppq;
                const prevTrans = state.transpositions[depth - 1];

                for (const transition of indexedTransitions) {
                    const t = prevTrans + transition.transpositionDelta;
                    if (t === prevTrans) continue;
                    if (!allowedTranspositions.has(t)) continue;
                    // A.7, A.8, A.10, A.2 within-triplet: guaranteed by triplet precomp

                    const varIdx = transition.nextVariantIndex;
                    const variant = variants[varIdx];
                    const isInv = variant.type === 'I';
                    const isTrunc = variant.truncationBeats > 0;

                    // Quota checks
                    if (isInv && !checkQuota(options.inversionMode, state.nInv)) continue;
                    if (isTrunc && !checkQuota(options.truncationMode, state.nTrunc)) continue;

                    const nextRestricted = state.nRestricted + (transition.isRestrictedInterval ? 1 : 0);
                    const nextFree = state.nFree + (transition.isFreeInterval ? 1 : 0);
                    if (nextRestricted > 1 && nextRestricted >= nextFree) continue;
                    if (transition.isRestrictedInterval && !checkQuota(options.thirdSixthMode, state.nRestricted)) continue;
                    if (options.disallowComplexExceptions && (isInv || isTrunc) && transition.isRestrictedInterval) continue;

                    // Voice domain filter
                    if ((allowedVoicesForTrans.get(t)?.length ?? 0) === 0) continue;

                    // C.3: No duplicate transpositions among active entries
                    let transpositionDuplicate = false;
                    for (let k = depth - 1; k >= 0; k--) {
                        const kEntry = state.chain[k];
                        const kStartTicks = Math.round(kEntry.startBeat * ppq);
                        if (kStartTicks + subjectLengthTicks <= absStartTicks) break;
                        const kEndTicks = kStartTicks + variants[state.variantIndices[k]].lengthTicks;
                        if (absStartTicks >= kEndTicks) continue;
                        if (kEntry.transposition === t) { transpositionDuplicate = true; break; }
                    }
                    if (transpositionDuplicate) continue;

                    // Long-range pairwise checks: verify all overlapping pairs not covered by triplet windows
                    let harmonicFail = false;
                    const immPair = transition.pairRecord!;
                    const allRunSpans: SimultaneitySpan[] = [...immPair.bassRoleDissonanceRunSpans.none];

                    for (let k = depth - 3; k >= 0; k--) {
                        const kEntry = state.chain[k];
                        const kStart = Math.round(kEntry.startBeat * ppq);
                        if (kStart + subjectLengthTicks <= absStartTicks) break;
                        const kVarIdx = state.variantIndices[k];
                        const kEnd = kStart + variants[kVarIdx].lengthTicks;
                        if (absStartTicks >= kEnd) continue;

                        const relDelay = absStartTicks - kStart;
                        const relTrans = t - kEntry.transposition;
                        const pr = getPairRecord(kVarIdx, varIdx, relDelay, relTrans);
                        if (!pr) { harmonicFail = true; break; }
                        for (const s of pr.bassRoleDissonanceRunSpans.none) allRunSpans.push(s);
                    }
                    if (harmonicFail) continue;

                    // Combined dissonance-run gate on immediate + long-range pairs
                    if (violatesCombinedDissonanceStarts(allRunSpans, ppq, offsetTicks)) continue;

                    // Metric compliance
                    const metricProbeEntry: StrettoChainOption = {
                        startBeat: absStartBeat, transposition: t,
                        type: variant.type, length: variant.lengthTicks, voiceIndex: 0
                    };
                    const chainNoteEvents = buildChainNoteEvents(state.chain, state.variantIndices);
                    if (!checkMetricCompliance(variant, metricProbeEntry, state.chain, variants, state.variantIndices, ppq, offsetTicks, tsNum, tsDenom, chainNoteEvents)) continue;

                    const newUsedLongDelays = new Set(state.usedLongDelays);
                    newUsedLongDelays.add(d);

                    results.push({
                        chain: [...state.chain, metricProbeEntry],
                        variantIndices: [...state.variantIndices, varIdx],
                        delays: [...state.delays, d],
                        transpositions: [...state.transpositions, t],
                        nInv: state.nInv + (isInv ? 1 : 0),
                        nTrunc: state.nTrunc + (isTrunc ? 1 : 0),
                        nRestricted: nextRestricted,
                        nFree: nextFree,
                        usedLongDelays: newUsedLongDelays
                    });
                }
            }
            return results;
        }

        // --- Seed: iterate firstDelay × e1 transposition × triplet ---
        // The triplet's tAB/tBC are RELATIVE transposition deltas, so we must
        // independently enumerate e1's absolute transposition and derive e2/e3.
        const minFirstDelay = Math.ceil(halfSubjectTicks / delayStep) * delayStep;
        const maxFirstDelay = Math.floor(subjectLengthTicks * (2 / 3) / delayStep) * delayStep;

        for (let firstDelay = minFirstDelay; firstDelay <= maxFirstDelay; firstDelay += delayStep) {
            if (terminationReason) break;

            // Iterate over valid e0→e1 pairs at this delay from the pairwise table
            for (let vA = 0; vA < variants.length; vA++) {
                if (terminationReason) break;
                // A.9: e1 must not be inverted
                if (variants[vA].type === 'I') continue;
                // A.10: no truncated entries at delay >= 0.5*Sb (firstDelay is always >= 0.5*Sb)
                if (variants[vA].truncationBeats > 0) continue;
                const transMap = pairwiseCompatibleTriplets.get(e0VarIdx)?.get(vA)?.get(firstDelay);
                if (!transMap) continue;

                const tripletsForVA = tripletsByFirstVariant.get(vA);
                if (!tripletsForVA || tripletsForVA.length === 0) continue;

                for (const [tE1, e0e1Pair] of transMap) {
                    if (terminationReason) break;

                    // A.7 Adjacent transposition separation: |t_e0 - t_e1| >= 5
                    if (Math.abs(tE1) < 5) continue;
                    if (!allowedTranspositions.has(tE1)) continue;
                    if ((allowedVoicesForTrans.get(tE1)?.length ?? 0) === 0) continue;
                    if (!e0e1Pair.meetsAdjacentTranspositionSeparation) continue;

                    // Iterate triplets starting with vA.
                    // This is precomputation (analogous to Stage 2/3), not chain-state expansion,
                    // so only operationCounter is incremented (for event-loop yield), not nodesVisited.
                    for (const triplet of tripletsForVA) {
                        operationCounter++;
                        if (shouldYieldToEventLoop(operationCounter)) {
                            await new Promise<void>((resolve) => setTimeout(resolve, 0));
                        }
                        if (checkLimits()) break;

                        const { vB, vC, d1: delayAB, d2: delayBC, tAB, tBC } = triplet;

                        // A.5 Maximum contraction: |firstDelay - delayAB| <= Sb/4
                        if (firstDelay - delayAB > quarterSubjectTicks) continue;
                        if (delayAB - firstDelay > quarterSubjectTicks) continue;

                        // A.2 Half-length contraction (OR form)
                        if ((firstDelay >= halfSubjectTicks || delayAB >= halfSubjectTicks) && delayAB >= firstDelay) continue;

                        // A.1 Cross-boundary uniqueness (within-triplet d1≠d2 guaranteed by triplet precomp)
                        if (firstDelay === delayAB || firstDelay === delayBC) continue;

                        // A.3 Expansion recoil: if delayAB > firstDelay, then delayBC < firstDelay - delayStep
                        if (delayAB > firstDelay && delayBC >= firstDelay) continue;

                        // Derive absolute transpositions for e2 and e3
                        const tE2 = tE1 + tAB;
                        const tE3 = tE2 + tBC;
                        if (!allowedTranspositions.has(tE2) || !allowedTranspositions.has(tE3)) continue;
                        if ((allowedVoicesForTrans.get(tE2)?.length ?? 0) === 0) continue;
                        if ((allowedVoicesForTrans.get(tE3)?.length ?? 0) === 0) continue;

                        // C.3: No duplicate transpositions among active entries.
                        const varA = variants[vA];
                        const varB = variants[vB];
                        const varC = variants[vC];
                        // e0 (t=0) is always active at e1 start (firstDelay < Sb).
                        // e1 (t=tE1) is active at e2 start if e1Start + lenA > e2Start.
                        // e0 is active at e2 start if e2Start < Sb.
                        // Similarly check e3.
                        if (tE1 === 0) continue; // e1 same transposition as e0
                        const e1Start_pre = firstDelay;
                        const e2Start_pre = firstDelay + delayAB;
                        const e3Start_pre = e2Start_pre + delayBC;
                        // At e2 entry: check against active entries (e0, e1)
                        {
                            if (tE2 === 0 && e2Start_pre < subjectLengthTicks) continue; // e0 still active, same trans
                            if (tE2 === tE1 && e2Start_pre < e1Start_pre + varA.lengthTicks) continue; // e1 still active, same trans
                        }
                        // At e3 entry: check against active entries (e0, e1, e2)
                        {
                            if (tE3 === 0 && e3Start_pre < subjectLengthTicks) continue;
                            if (tE3 === tE1 && e3Start_pre < e1Start_pre + varA.lengthTicks) continue;
                            if (tE3 === tE2 && e3Start_pre < e2Start_pre + varB.lengthTicks) continue;
                        }

                        // Quota checks
                        let nInv = 0, nTrunc = 0, nRestricted = 0, nFree = 1;
                        if (varA.type === 'I') nInv++;
                        if (varA.truncationBeats > 0) nTrunc++;
                        if (varB.type === 'I') nInv++;
                        if (varB.truncationBeats > 0) nTrunc++;
                        if (varC.type === 'I') nInv++;
                        if (varC.truncationBeats > 0) nTrunc++;

                        // Interval class quotas
                        if (e0e1Pair.isRestrictedInterval) nRestricted++;
                        if (e0e1Pair.isFreeInterval) nFree++;
                        if (triplet.pairAB.isRestrictedInterval) nRestricted++;
                        if (triplet.pairAB.isFreeInterval) nFree++;
                        if (triplet.pairBC.isRestrictedInterval) nRestricted++;
                        if (triplet.pairBC.isFreeInterval) nFree++;

                        if (nInv > 0 && !checkQuota(options.inversionMode, nInv - 1)) continue;
                        if (nTrunc > 0 && !checkQuota(options.truncationMode, nTrunc - 1)) continue;
                        if (nRestricted > 1 && nRestricted >= nFree) continue;

                        // e0 pairwise: check e0→e2 if overlapping
                        const cumDelay_e0e2 = firstDelay + delayAB;
                        let e0e2Pair: PairwiseCompatibilityRecord | undefined;
                        if (cumDelay_e0e2 < subjectLengthTicks) {
                            e0e2Pair = getPairRecord(e0VarIdx, vB, cumDelay_e0e2, tE2);
                            if (!e0e2Pair) continue;
                        }
                        // e0→e3 if overlapping
                        const cumDelay_e0e3 = cumDelay_e0e2 + delayBC;
                        let e0e3Pair: PairwiseCompatibilityRecord | undefined;
                        if (cumDelay_e0e3 < subjectLengthTicks) {
                            e0e3Pair = getPairRecord(e0VarIdx, vC, cumDelay_e0e3, tE3);
                            if (!e0e3Pair) continue;
                        }

                        // Combined dissonance check for seed (e0, e1, e2, e3)
                        const seedSpans: SimultaneitySpan[] = [
                            ...e0e1Pair.bassRoleDissonanceRunSpans.none,
                            ...triplet.pairAB.bassRoleDissonanceRunSpans.none,
                            ...triplet.pairBC.bassRoleDissonanceRunSpans.none
                        ];
                        if (triplet.pairAC) {
                            for (const s of triplet.pairAC.bassRoleDissonanceRunSpans.none) seedSpans.push(s);
                        }
                        if (e0e2Pair) {
                            for (const s of e0e2Pair.bassRoleDissonanceRunSpans.none) seedSpans.push(s);
                        }
                        if (e0e3Pair) {
                            for (const s of e0e3Pair.bassRoleDissonanceRunSpans.none) seedSpans.push(s);
                        }
                        if (violatesCombinedDissonanceStarts(seedSpans, ppq, offsetTicks)) continue;

                        // Build seed chain entries
                        const e1Start = firstDelay;
                        const e2Start = firstDelay + delayAB;
                        const e3Start = e2Start + delayBC;

                        const seedChain: StrettoChainOption[] = [
                            e0Entry,
                            { startBeat: e1Start / ppq, transposition: tE1, type: varA.type, length: varA.lengthTicks, voiceIndex: 0 },
                            { startBeat: e2Start / ppq, transposition: tE2, type: varB.type, length: varB.lengthTicks, voiceIndex: 0 },
                            { startBeat: e3Start / ppq, transposition: tE3, type: varC.type, length: varC.lengthTicks, voiceIndex: 0 }
                        ];

                        // Metric compliance for seed
                        const seedNoteEvents = buildChainNoteEvents(seedChain.slice(0, 3), [e0VarIdx, vA, vB]);
                        const e3Probe = seedChain[3];
                        if (!checkMetricCompliance(varC, e3Probe, seedChain.slice(0, 3), variants, [e0VarIdx, vA, vB], ppq, offsetTicks, tsNum, tsDenom, seedNoteEvents)) continue;

                        maxDepth = Math.max(maxDepth, 4);

                        const usedDelays = new Set<number>([firstDelay, delayAB, delayBC]);

                        const seedState: TripletJoinState = {
                            chain: seedChain,
                            variantIndices: [e0VarIdx, vA, vB, vC],
                            delays: [firstDelay, delayAB, delayBC],
                            transpositions: [0, tE1, tE2, tE3],
                            nInv, nTrunc, nRestricted, nFree,
                            usedLongDelays: usedDelays
                        };

                        // Record seed as partial
                        recordDeferredPartial(seedState.chain, seedState.variantIndices);

                        // Extend to e4, e5, e6 via stack-based DFS to depth 7
                        const extensionStack: TripletJoinState[] = [seedState];
                        while (extensionStack.length > 0) {
                            if (terminationReason) break;
                            operationCounter++;
                            if (shouldYieldToEventLoop(operationCounter)) {
                                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                            }
                            if (checkLimits()) break;
                            const current = extensionStack.pop()!;
                            const currentDepth = current.chain.length;

                            // At depth 7 (e0–e6): this is a complete Phase A prefix
                            if (currentDepth >= 7) {
                                const longDelaySig = Array.from(current.usedLongDelays).sort((a, b) => a - b).join(',');
                                const dagNode: DagNode = {
                                    chain: current.chain,
                                    variantIndices: current.variantIndices,
                                    nInv: current.nInv,
                                    nTrunc: current.nTrunc,
                                    nRestricted: current.nRestricted,
                                    nFree: current.nFree,
                                    usedLongDelays: current.usedLongDelays,
                                    longDelaySignature: longDelaySig
                                };

                                if (currentDepth === options.targetChainLength) {
                                    recordCompletedChain(dagNode.chain, dagNode.variantIndices);
                                } else {
                                    recordDeferredPartial(dagNode.chain, dagNode.variantIndices);
                                    // Phase B: DFS extension with relaxed rules (depth >= 7)
                                    dfsExtend(dagNode);
                                }
                                maxDepth = Math.max(maxDepth, currentDepth);
                                continue;
                            }

                            // Extend by one entry
                            const successors = tripletJoinExtend(current);
                            for (const succ of successors) {
                                nodesVisited++;
                                maxDepth = Math.max(maxDepth, succ.chain.length);
                                if (succ.chain.length >= 3) {
                                    recordDeferredPartial(succ.chain, succ.variantIndices);
                                }
                                extensionStack.push(succ);
                            }
                        }
                    } // end triplet loop
                } // end tE1 loop
            } // end vA loop
        } // end firstDelay loop

        // Cross-triplet dissonance union check is integrated into tripletJoinExtend
        // via the long-range pair collection. Future: cluster ban for 3+ simultaneous
        // voices where no pair is consonant.

    } else {
        // --- Phase A: BFS to PHASE_A_DEPTH (target <= 6 or no triplets) ---
        // Uses DAG merging to prune equivalent frontier nodes at each layer.
        while (frontier.length > 0) {
            maxFrontierSize = Math.max(maxFrontierSize, frontier.length);
            const nextLayer = new Map<string, DagNode>();
            let stopTraversal = false;

            for (const node of frontier) {
                nodesVisited++;
                operationCounter++;
                maxDepth = Math.max(maxDepth, node.chain.length);

                if (shouldYieldToEventLoop(operationCounter)) {
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                }

                if (checkLimits()) {
                    stopTraversal = true;
                    break;
                }

                // If target reached during Phase A (target <= PHASE_A_DEPTH)
                if (node.chain.length === options.targetChainLength) {
                    recordCompletedChain(node.chain, node.variantIndices);
                    continue;
                }

                // At Phase A boundary: switch to DFS for remaining depth
                if (node.chain.length >= PHASE_A_DEPTH) {
                    if (node.chain.length >= 3) {
                        recordDeferredPartial(node.chain, node.variantIndices);
                    }
                    // Launch DFS from this node
                    const successors = expandNode(node);
                    for (const successor of successors) {
                        dfsExtend(successor);
                        if (terminationReason) {
                            stopTraversal = true;
                            break;
                        }
                    }
                    if (stopTraversal) break;
                    continue;
                }

                // Collect partial during BFS (deferred voice assignment)
                if (node.chain.length >= 3) {
                    recordDeferredPartial(node.chain, node.variantIndices);
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

            // Record frontier state at termination (last iteration before loop exits).
            if (frontier.length === 0 || stopTraversal) {
                const termFrontier = stopTraversal ? Array.from(nextLayer.values()) : [];
                frontierSizeAtTermination = termFrontier.length;
                maxFrontierClassCount = maxFrontierSize;
                frontierClassesAtTermination = termFrontier.length;
            }
        }
    }

    // --- POST-SEARCH: Score all found chains ---
    let sourceUnscored = unscoredResults;
    let stopReason: StrettoSearchReport['stats']['stopReason'] = terminationReason || (unscoredResults.length > 0 ? 'Success' : 'Exhausted');

    // Fallback to partials if no full-length results.
    // Voice assignment is deferred to here to avoid expensive CSP during traversal.
    if (unscoredResults.length === 0 && deferredPartials.length > 0) {
        for (const dp of deferredPartials) {
            const assigned = assignVoices(dp.chain, dp.variantIndices);
            if (assigned !== null) {
                unscoredPartials.push({ entries: assigned, variantIndices: dp.variantIndices });
            }
        }
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
                nodeBudgetUsedPercent: 0, // No node budget — time-only gating
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
