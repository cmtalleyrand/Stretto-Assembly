
import { RawNote, StrettoChainResult, StrettoSearchOptions, StrettoChainOption, StrettoConstraintMode, StrettoSearchReport } from '../../types';
import { INTERVALS, SCALE_INTERVALS } from './strettoConstants';
import { calculateStrettoScore, SubjectVariant, InternalNote } from './strettoScoring';
import { getInvertedPitch } from './strettoCore';
import { buildTranspositionRuleTables, TranspositionIndex as RuleTranspositionIndex } from './stretto-opt/ruleTables';
import { createCompatMatrix } from './stretto-opt/compatMatrix';
import { buildVoiceTranspositionAdmissibilityIndex } from './stretto-opt/voiceTranspositionAdmissibility';

// --- Constants & Types ---
// Node budget removed — time is the only search limit.
const DEFAULT_TIME_LIMIT_MS = 30000;
const NEAR_COMPLETION_TIMEOUT_EXTENSION_MS = 10000;
const FINALIZATION_TIMEOUT_GRACE_MS = 1500;
const MIN_TIMEOUT_FINALIZATION_CANDIDATES = 64;
const MAX_RESULTS = 50;
const EVENT_LOOP_YIELD_INTERVAL = 1024;
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

type StrettoPrecomputeBackend = 'map' | 'dense';
export type StrettoAdmissibilityMode = 'full' | 'delay-variant-only' | 'disabled';

export interface StrettoPrecomputeConfig {
    backend?: StrettoPrecomputeBackend;
    admissibilityMode?: StrettoAdmissibilityMode;
}

type PairwiseByTransposition = Map<number, PairwiseCompatibilityRecord>;
type PairwiseByDelay = Map<number, PairwiseByTransposition>;
type PairwiseByVariantB = Map<number, PairwiseByDelay>;
type PairwiseByVariantA = Map<number, PairwiseByVariantB>;

type TransitionBucketsByDelay = Map<number, NextTransition[]>;
type TransitionByTranspositionDelta = Map<number, TransitionBucketsByDelay>;
type TransitionByDelayAB = Map<number, TransitionByTranspositionDelta>;
type TransitionByDelayA = Map<number, TransitionByDelayAB>;
type TransitionByVariantRight = Map<number, TransitionByDelayA>;
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

interface SortedNote {
    start: number;
    end: number;
    pitch: number;
}

interface SortedNoteTimeline {
    notes: readonly SortedNote[];
    boundaryTicks: readonly number[];
}

interface PairwiseTripletPrecomputeIndex {
    setPairRecord(vA: number, vB: number, d: number, t: number, record: PairwiseCompatibilityRecord): void;
    getPairRecord(vA: number, vB: number, d: number, t: number): PairwiseCompatibilityRecord | undefined;
    getValidPairs(): PairTuple[];
    getPairsByFirstVariant(variantA: number): PairTuple[];
    forEachPairTransposition(vA: number, vB: number, d: number, iteratee: (t: number, record: PairwiseCompatibilityRecord) => void): void;
    appendWindowTransition(
        variantLeft: number,
        variantRight: number,
        delayATicks: number,
        delayABTicks: number,
        transpositionDelta: number,
        transition: NextTransition
    ): void;
    getWindowTransitions(
        variantLeft: number,
        variantRight: number,
        delayATicks: number,
        delayABTicks: number,
        transpositionDelta: number
    ): TransitionBucketsByDelay | undefined;
    addTripletShapeKey(key: string): void;
    hasTripletShapeKey(key: string): boolean;
    getTripletShapeCount(): number;
}

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

export type StrettoSearchProgressStage = 'pairwise' | 'triplet' | 'dag';

export interface StrettoSearchProgressUpdate {
    stage: StrettoSearchProgressStage;
    completedUnits: number;
    totalUnits: number;
    terminal: boolean;
    telemetry: {
        validPairs: number;
        validTriplets: number;
        chainsFound: number;
        maxDepthReached: number;
        targetChainLength: number;
        pairwiseOperationsProcessed: number;
        tripletOperationsProcessed: number;
        dagNodesExpanded: number;
        dagEdgesEvaluated: number;
        dagExploredWorkItems: number;
        dagLiveFrontierWorkItems: number;
        dagHeuristicCompletionRatio?: number;
    };
}

export function shouldExtendTimeoutNearCompletion(maxDepthReached: number, targetChainLength: number): boolean {
    return maxDepthReached >= Math.max(1, targetChainLength - 1);
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

function pairScore(record: PairwiseCompatibilityRecord): number {
    return Math.round(record.dissonanceRatio * 1000);
}

function transpositionIntervalClass(transposition: number): number {
    return ((transposition % 12) + 12) % 12;
}

export function isPerfectBehaviorSensitiveIntervalClass(intervalClass: number): boolean {
    return intervalClass === 0 || intervalClass === 5 || intervalClass === 7;
}

export function foldTranspositionWithinSpan(transposition: number, subjectSpanSemitones: number): number {
    if (!Number.isFinite(subjectSpanSemitones) || subjectSpanSemitones < 0) return transposition;
    let best = transposition;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let k = -4; k <= 4; k++) {
        const candidate = transposition + (12 * k);
        if (Math.abs(candidate) > subjectSpanSemitones) continue;
        const distance = Math.abs(candidate);
        if (distance < bestDistance || (distance === bestDistance && candidate < best)) {
            best = candidate;
            bestDistance = distance;
        }
    }
    if (bestDistance !== Number.POSITIVE_INFINITY) return best;

    // Fallback: choose nearest octave-equivalent transposition to 0 when span is too narrow.
    const nearest = transposition - (12 * Math.round(transposition / 12));
    return Object.is(nearest, -0) ? 0 : nearest;
}

export function shouldReuseCanonicalPairwiseScan(
    intervalClass: number,
    canonicalFlags?: { hasFourth: boolean; hasParallelPerfect58: boolean }
): boolean {
    if (!isPerfectBehaviorSensitiveIntervalClass(intervalClass)) return true;
    return Boolean(canonicalFlags && !canonicalFlags.hasFourth && !canonicalFlags.hasParallelPerfect58);
}

function buildDiversifiedPriorityOrder(
    pairs: PairTuple[],
    pairQuality: (pair: PairTuple) => number
): PairTuple[] {
    if (pairs.length <= 1) return pairs;
    const sorted = [...pairs].sort((left, right) => pairQuality(left) - pairQuality(right));
    const seenDelayCounts = new Map<number, number>();
    const seenIntervalClassCounts = new Map<number, number>();
    return sorted
        .map((pair, sortedIndex) => {
            const intervalClass = transpositionIntervalClass(pair.t);
            const delayCount = seenDelayCounts.get(pair.d) ?? 0;
            const intervalCount = seenIntervalClassCounts.get(intervalClass) ?? 0;
            seenDelayCounts.set(pair.d, delayCount + 1);
            seenIntervalClassCounts.set(intervalClass, intervalCount + 1);
            // Lexicographic objective:
            // 1) Pairwise dissonance quality (dominant term)
            // 2) Diversity of delay values and transposition interval classes
            // 3) Stable fallback to original quality ordering
            const diversityPenalty = (delayCount * 2) + intervalCount;
            return {
                pair,
                score: (pairQuality(pair) * 1000) + diversityPenalty,
                sortedIndex
            };
        })
        .sort((left, right) => {
            if (left.score !== right.score) return left.score - right.score;
            return left.sortedIndex - right.sortedIndex;
        })
        .map((entry) => entry.pair);
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
    tripletRejectA10: number;
    tripletRejectA8: number;
    tripletRejectDelayShape: number;
    tripletRejectPairBCMissing: number;
    tripletRejectAdjSepBC: number;
    tripletRejectPairACMissing: number;
    tripletRejectLowerBound: number;
    tripletRejectParallel: number;
    tripletRejectVoice: number;
    tripletRejectP4Bass: number;
    tripleLowerBoundRejected: number;
    tripleParallelRejected: number;
    tripleVoiceRejected: number;
    tripleP4BassRejected: number;
    tripletRejectNoDelayContext: number;
    tripletRejectedTotal: number;
    tripletAcceptedTotal: number;
    tripletCandidatesAccepted: number;
    tripletDistinctShapesAccepted: number;
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
    prunedByPrefixAdmissibility: number;
}

type AdmissiblePairIndex = Map<number, Map<number, Map<number, Set<number>>>>;

interface EntryStateAdmissibilityModel {
    admissiblePairKeys: AdmissiblePairIndex | null;
    // Valid delay transitions, keyed as "${vPrev}:${vNext}:${dPrev}:${dNext}".
    // dPrev/dNext are consecutive adjacent delays (in ticks) between neighboring entries.
    // Indexed by absolute chain position p (1-based entry index), i.e. index p stores
    // transitions (d_{p-1} -> d_p) observed while expanding DFS state.depth = p.
    // Only populated by delay-variant admissibility mode; null otherwise.
    validDelayTransitions: Set<string>[] | null;
    statesVisited: number;
}

const TRIPLET_REJECT_REASON = {
    A10: 'tripletRejectA10',
    A8: 'tripletRejectA8',
    DELAY_SHAPE: 'tripletRejectDelayShape',
    PAIR_BC_MISSING: 'tripletRejectPairBCMissing',
    ADJ_SEP_BC: 'tripletRejectAdjSepBC',
    PAIR_AC_MISSING: 'tripletRejectPairACMissing',
    LOWER_BOUND: 'tripletRejectLowerBound',
    PARALLEL: 'tripletRejectParallel',
    VOICE: 'tripletRejectVoice',
    P4_BASS: 'tripletRejectP4Bass',
    NO_DELAY_CONTEXT: 'tripletRejectNoDelayContext'
} as const;

type TripletRejectReason = typeof TRIPLET_REJECT_REASON[keyof typeof TRIPLET_REJECT_REASON];

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

interface PrefixDissonanceState {
    macroRunCount: number;
    macroRunEnd: number;
    macroRunFirstStart: number;
    violated: boolean;
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

function incrementTripletRejectCounter(stageStats: StageStats, reason: TripletRejectReason): void {
    switch (reason) {
        case TRIPLET_REJECT_REASON.A10:
            stageStats.tripletRejectA10++;
            break;
        case TRIPLET_REJECT_REASON.A8:
            stageStats.tripletRejectA8++;
            break;
        case TRIPLET_REJECT_REASON.DELAY_SHAPE:
            stageStats.tripletRejectDelayShape++;
            break;
        case TRIPLET_REJECT_REASON.PAIR_BC_MISSING:
            stageStats.tripletRejectPairBCMissing++;
            break;
        case TRIPLET_REJECT_REASON.ADJ_SEP_BC:
            stageStats.tripletRejectAdjSepBC++;
            break;
        case TRIPLET_REJECT_REASON.PAIR_AC_MISSING:
            stageStats.tripletRejectPairACMissing++;
            stageStats.triplePairwiseRejected++;
            break;
        case TRIPLET_REJECT_REASON.LOWER_BOUND:
            stageStats.tripletRejectLowerBound++;
            stageStats.tripleLowerBoundRejected++;
            break;
        case TRIPLET_REJECT_REASON.PARALLEL:
            stageStats.tripletRejectParallel++;
            stageStats.tripleParallelRejected++;
            break;
        case TRIPLET_REJECT_REASON.VOICE:
            stageStats.tripletRejectVoice++;
            stageStats.tripleVoiceRejected++;
            break;
        case TRIPLET_REJECT_REASON.P4_BASS:
            stageStats.tripletRejectP4Bass++;
            stageStats.tripleP4BassRejected++;
            break;
        case TRIPLET_REJECT_REASON.NO_DELAY_CONTEXT:
            stageStats.tripletRejectNoDelayContext++;
            break;
        default:
            break;
    }
    passesTripletStage(stageStats, false);
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

async function buildEntryStateAdmissibilityModel(
    variants: SubjectVariant[],
    allowedAbsoluteTranspositions: number[],
    relativeTranspositionDeltas: number[],
    delayStep: number,
    targetChainLength: number,
    options: StrettoSearchOptions
): Promise<EntryStateAdmissibilityModel> {
    const isCanonDelaySearch = options.delaySearchCategory === 'canon';
    const ppq = delayStep * 2;
    const canonDelayMinTicksRaw = Math.round((options.canonDelayMinBeats ?? 1) * ppq);
    const canonDelayMaxTicksRaw = Math.round((options.canonDelayMaxBeats ?? 4) * ppq);
    const canonDelayLowerTicks = Math.max(delayStep, Math.min(canonDelayMinTicksRaw, canonDelayMaxTicksRaw));
    const canonDelayUpperTicks = Math.max(delayStep, Math.max(canonDelayMinTicksRaw, canonDelayMaxTicksRaw));
    const canonDelayMinTicks = Math.ceil(canonDelayLowerTicks / delayStep) * delayStep;
    const canonDelayMaxTicks = Math.floor(canonDelayUpperTicks / delayStep) * delayStep;
    const isCanonicalDelayAllowed = (delayTicks: number): boolean => (
        !isCanonDelaySearch || (delayTicks >= canonDelayMinTicks && delayTicks <= canonDelayMaxTicks)
    );
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
    let operationCounter = 0;

    while (stack.length > 0) {
        const state = stack.pop()!;
        operationCounter++;
        if (shouldYieldToEventLoop(operationCounter)) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (state.depth >= targetChainLength) continue;

        let minD = delayStep;
        let maxD = Math.floor(state.prevEntryLengthTicks * (2 / 3));
        if (state.depth === 1) {
            if (isCanonDelaySearch) {
                minD = canonDelayMinTicks;
                maxD = canonDelayMaxTicks;
            } else {
                minD = Math.floor(state.prevEntryLengthTicks * 0.5);
            }
        } else {
            const prevDelayTicks = state.prevDelayTicks!;
            const prevSubjectLengthTicks = state.prevEntryLengthTicks;
            if (isCanonDelaySearch) {
                minD = prevDelayTicks;
                maxD = prevDelayTicks;
            } else {
                minD = Math.max(minD, prevDelayTicks - Math.floor(prevSubjectLengthTicks / 4));

                if (state.prevPrevDelayTicks !== null) {
                    const prevPrevDelayTicks = state.prevPrevDelayTicks;
                    if (prevDelayTicks > prevPrevDelayTicks && prevDelayTicks > (prevSubjectLengthTicks / 3)) {
                        maxD = Math.min(maxD, prevPrevDelayTicks - delayStep);
                    }
                }
            }

        }

        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;
        if (minD > maxD) continue;

        for (let delayTicks = minD; delayTicks <= maxD; delayTicks += delayStep) {
            if (!isCanonicalDelayAllowed(delayTicks)) continue;
            if (state.depth >= 2) {
                const prevDelayTicks = state.prevDelayTicks!;
                const halfSubjectTicks = state.prevEntryLengthTicks / 2;
                if (!isCanonDelaySearch && (prevDelayTicks >= halfSubjectTicks || delayTicks >= halfSubjectTicks) && delayTicks >= prevDelayTicks) continue;
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

    return { admissiblePairKeys, validDelayTransitions: null, statesVisited: visited.size };
}

// Cheaper admissibility DFS: only tracks (depth, variantIndex, delay, nInv, nTrunc) —
// no transposition dimension. Enforces variant quotas and delay rules (A.2–A.5, A.6)
// but not transposition constraints. For each reachable (vA, vB, d), every transposition
// is considered admissible; the admissibilityMatrix is then populated for all tIdx.
async function buildDelayVariantAdmissibilityModel(
    variants: SubjectVariant[],
    delayStep: number,
    targetChainLength: number,
    options: StrettoSearchOptions
): Promise<EntryStateAdmissibilityModel> {
    const isCanonDelaySearch = options.delaySearchCategory === 'canon';
    const ppq = delayStep * 2;
    const canonDelayMinTicksRaw = Math.round((options.canonDelayMinBeats ?? 1) * ppq);
    const canonDelayMaxTicksRaw = Math.round((options.canonDelayMaxBeats ?? 4) * ppq);
    const canonDelayLowerTicks = Math.max(delayStep, Math.min(canonDelayMinTicksRaw, canonDelayMaxTicksRaw));
    const canonDelayUpperTicks = Math.max(delayStep, Math.max(canonDelayMinTicksRaw, canonDelayMaxTicksRaw));
    const canonDelayMinTicks = Math.ceil(canonDelayLowerTicks / delayStep) * delayStep;
    const canonDelayMaxTicks = Math.floor(canonDelayUpperTicks / delayStep) * delayStep;
    const isCanonicalDelayAllowed = (delayTicks: number): boolean => (
        !isCanonDelaySearch || (delayTicks >= canonDelayMinTicks && delayTicks <= canonDelayMaxTicks)
    );

    // admissiblePairKeys: vA → vB → delay → Set (placeholder — transpositions added at matrix-build time)
    const admissiblePairKeys: AdmissiblePairIndex = new Map();
    const addAdmissiblePair = (vA: number, vB: number, d: number): void => {
        let byVB = admissiblePairKeys.get(vA);
        if (!byVB) { byVB = new Map(); admissiblePairKeys.set(vA, byVB); }
        let byD = byVB.get(vB);
        if (!byD) { byD = new Map(); byVB.set(vB, byD); }
        if (!byD.has(d)) byD.set(d, new Set());
    };
    // (vPrev, vNext, dPrev, dNext) valid delay transitions — O(1) lookup at triplet stage
    // replacing A.10, A.8, and delay-shape checks (bounded expansion, A.2, A.5, A.4).
    const validDelayTransitionsByAbsPos: Set<string>[] = Array.from(
        { length: Math.max(0, targetChainLength + 1) },
        () => new Set<string>()
    );
    const fullSubjectHalfTicks = variants[0].lengthTicks / 2;

    interface DVState {
        depth: number;
        prevVariantIndex: number;
        prevEntryLengthTicks: number;
        prevDelayTicks: number | null;
        prevPrevDelayTicks: number | null;
        nInv: number;
        nTrunc: number;
    }

    const stack: DVState[] = [{
        depth: 1,
        prevVariantIndex: 0,
        prevEntryLengthTicks: variants[0].lengthTicks,
        prevDelayTicks: null,
        prevPrevDelayTicks: null,
        nInv: 0,
        nTrunc: 0
    }];
    const visited = new Set<string>();
    let operationCounter = 0;

    while (stack.length > 0) {
        const state = stack.pop()!;
        operationCounter++;
        if (shouldYieldToEventLoop(operationCounter)) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (state.depth >= targetChainLength) continue;

        let minD = delayStep;
        let maxD = Math.floor(state.prevEntryLengthTicks * (2 / 3));
        if (state.depth === 1) {
            if (isCanonDelaySearch) { minD = canonDelayMinTicks; maxD = canonDelayMaxTicks; }
            else { minD = Math.floor(state.prevEntryLengthTicks * 0.5); }
        } else {
            const prevDelayTicks = state.prevDelayTicks!;
            const prevSubjectLengthTicks = state.prevEntryLengthTicks;
            if (isCanonDelaySearch) { minD = prevDelayTicks; maxD = prevDelayTicks; }
            else {
                minD = Math.max(minD, prevDelayTicks - Math.floor(prevSubjectLengthTicks / 4));
                if (state.prevPrevDelayTicks !== null) {
                    const ppd = state.prevPrevDelayTicks;
                    if (prevDelayTicks > ppd && prevDelayTicks > (prevSubjectLengthTicks / 3)) {
                        maxD = Math.min(maxD, ppd - delayStep);
                    }
                }
            }
        }
        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;
        if (minD > maxD) continue;

        for (let delayTicks = minD; delayTicks <= maxD; delayTicks += delayStep) {
            if (!isCanonicalDelayAllowed(delayTicks)) continue;
            if (state.depth >= 2) {
                const prevDelayTicks = state.prevDelayTicks!;
                const halfSubjectTicks = state.prevEntryLengthTicks / 2;
                if (!isCanonDelaySearch && (prevDelayTicks >= halfSubjectTicks || delayTicks >= halfSubjectTicks) && delayTicks >= prevDelayTicks) continue;
            }

            for (let nextVariantIndex = 0; nextVariantIndex < variants.length; nextVariantIndex++) {
                const nextVariant = variants[nextVariantIndex];
                const isInv = nextVariant.type === 'I';
                const isTrunc = nextVariant.truncationBeats > 0;
                const prevVariant = variants[state.prevVariantIndex];
                const prevIsInv = prevVariant.type === 'I';
                const prevIsTrunc = prevVariant.truncationBeats > 0;
                if ((prevIsInv || prevIsTrunc) && (isInv || isTrunc)) continue;
                // A.9: entry e1 (depth=1, the first successor to the root) must not be inverted
                if (state.depth === 1 && isInv) continue;
                if (isInv && !checkQuota(options.inversionMode, state.nInv)) continue;
                if (isTrunc && !checkQuota(options.truncationMode, state.nTrunc)) continue;
                // A.10: no truncated entry at delay >= 0.5*Sb
                if (!isCanonDelaySearch && isTrunc && delayTicks >= fullSubjectHalfTicks) continue;

                addAdmissiblePair(state.prevVariantIndex, nextVariantIndex, delayTicks);
                // key = "${vPrev}:${vNext}:${dPrev}:${dNext}"
                if (state.prevDelayTicks !== null) {
                    validDelayTransitionsByAbsPos[state.depth].add(
                        `${state.prevVariantIndex}:${nextVariantIndex}:${state.prevDelayTicks}:${delayTicks}`
                    );
                }

                const nextInv = state.nInv + (isInv ? 1 : 0);
                const nextTrunc = state.nTrunc + (isTrunc ? 1 : 0);
                const nextDepth = state.depth + 1;
                const visitKey = [nextDepth, nextVariantIndex, delayTicks, state.prevDelayTicks ?? -1, nextInv, nextTrunc].join('|');
                if (visited.has(visitKey)) continue;
                visited.add(visitKey);
                stack.push({
                    depth: nextDepth,
                    prevVariantIndex: nextVariantIndex,
                    prevEntryLengthTicks: nextVariant.lengthTicks,
                    prevDelayTicks: delayTicks,
                    prevPrevDelayTicks: state.prevDelayTicks,
                    nInv: nextInv,
                    nTrunc: nextTrunc
                });
            }
        }
    }

    return { admissiblePairKeys, validDelayTransitions: validDelayTransitionsByAbsPos, statesVisited: visited.size };
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

function buildSortedNoteTimeline(variant: SubjectVariant): SortedNoteTimeline {
    const notes = variant.notes
        .map((n) => ({
            start: n.relTick,
            end: n.relTick + n.durationTicks,
            pitch: n.pitch
        }))
        .sort((a, b) => a.start - b.start);

    const boundaryTicks: number[] = [];
    for (const n of notes) {
        boundaryTicks.push(n.start, n.end);
    }
    boundaryTicks.sort((a, b) => a - b);
    const uniqueBoundaries: number[] = [];
    for (let i = 0; i < boundaryTicks.length; i++) {
        if (i === 0 || boundaryTicks[i] !== boundaryTicks[i - 1]) uniqueBoundaries.push(boundaryTicks[i]);
    }
    return { notes, boundaryTicks: uniqueBoundaries };
}

function mergeTimelineBoundariesWithShift(
    boundariesA: readonly number[],
    boundariesB: readonly number[],
    shiftB: number
): number[] {
    const merged: number[] = [];
    let i = 0;
    let j = 0;
    while (i < boundariesA.length || j < boundariesB.length) {
        const a = i < boundariesA.length ? boundariesA[i] : Number.POSITIVE_INFINITY;
        const b = j < boundariesB.length ? boundariesB[j] + shiftB : Number.POSITIVE_INFINITY;
        const next = a <= b ? a : b;
        if (merged.length === 0 || merged[merged.length - 1] !== next) merged.push(next);
        if (a === next) i++;
        if (b === next) j++;
    }
    return merged;
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
    skipSpans: boolean = false,
    timelineA?: SortedNoteTimeline,
    timelineB?: SortedNoteTimeline
 ): PairwiseScanResult {
    const resolvedTimelineA = timelineA ?? buildSortedNoteTimeline(variantA);
    const resolvedTimelineB = timelineB ?? buildSortedNoteTimeline(variantB);
    const notesA = resolvedTimelineA.notes;
    const notesB = resolvedTimelineB.notes;
    const sortedPoints = mergeTimelineBoundariesWithShift(
        resolvedTimelineA.boundaryTicks,
        resolvedTimelineB.boundaryTicks,
        delayTicks
    );

    let prevP1: number | null = null;
    let prevP2: number | null = null;
    let prevWasParallel = false;

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
        while (ptrB < notesB.length - 1 && (notesB[ptrB].end + delayTicks) <= start) ptrB++;

        const activeA = (ptrA < notesA.length && notesA[ptrA].start <= start && notesA[ptrA].end > start) ? notesA[ptrA] : null;
        const activeB = (ptrB < notesB.length && (notesB[ptrB].start + delayTicks) <= start && (notesB[ptrB].end + delayTicks) > start) ? notesB[ptrB] : null;

        if (!activeA || !activeB) {
            // Monophony: consecutive parallel tracking is broken by a rest; tick-duration clock restarts.
            // The dissonance event counter (dissRunLength) and lastIsDiss are preserved —
            // only a consonant interval resets the event count.
            prevP1 = null; prevP2 = null;
            prevWasParallel = false;
            dissRunTicks = 0;
            continue;
        }

        overlapTicks += dur;

        const p1 = activeA.pitch;
        const p2 = activeB.pitch + transposition;
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

        // Rule 5: Parallel Perfects — delay-conditional consecutive rule.
        // At d > Sb/3: any single parallel motion to P5/P8 is forbidden.
        // At d ≤ Sb/3: only two back-to-back parallel motions are forbidden.
        // Monophony (handled above) resets prevWasParallel, so consecutive tracking
        // cannot span a rest in either voice.
        if (prevP1 !== null && prevP2 !== null) {
            const prevLo = Math.min(prevP1, prevP2);
            const prevHi = Math.max(prevP1, prevP2);
            const prevInt = (prevHi - prevLo) % 12;
            const deltaVoice1 = p1 - prevP1;
            const deltaVoice2 = p2 - prevP2;
            if (isForbiddenParallelPerfectMotion(prevInt, deltaVoice1, deltaVoice2)) {
                const oneThird = variantA.lengthTicks / 3;
                if (prevWasParallel || delayTicks > oneThird) {
                    hasParallelPerfect58 = true;
                }
                prevWasParallel = true;
                if (!skipSpans) parallelPerfectStartTicks.push(start);
                if (isStrongBeat(start, ppqParam, tsNum, tsDenom)) {
                    strongBeatParallels++;
                } else {
                    weakBeatParallels++;
                }
            } else {
                prevWasParallel = false;
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
    metricOffset: number = 0,
    tsNum: number = 4,
    tsDenom: number = 4
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
        const isStrong = isStrongBeat(span.startTick + metricOffset, ppq, tsNum, tsDenom);
        if (macroRunCount > 2) return true;
        if (isStrong && macroRunCount > 1) return true;
        if (macroRunCount === 2) {
            const prevIsStrong = isStrongBeat(prevStart + metricOffset, ppq, tsNum, tsDenom);
            if (isStrong || prevIsStrong) return true;
        }
        if (macroRunCount === 1) prevStart = span.startTick;
    }
    return false;
}

function extendPrefixDissonanceState(
    previous: PrefixDissonanceState,
    deltaRunSpans: SimultaneitySpan[],
    ppq: number,
    metricOffset: number = 0,
    tsNum: number = 4,
    tsDenom: number = 4
): PrefixDissonanceState {
    if (previous.violated || deltaRunSpans.length === 0) return previous;
    const nextState: PrefixDissonanceState = { ...previous };
    const sortedDelta = [...deltaRunSpans].sort((a, b) => a.startTick - b.startTick);
    for (const span of sortedDelta) {
        if (span.startTick <= nextState.macroRunEnd) {
            nextState.macroRunCount++;
            nextState.macroRunEnd = Math.max(nextState.macroRunEnd, span.endTick);
        } else {
            nextState.macroRunCount = 1;
            nextState.macroRunEnd = span.endTick;
            nextState.macroRunFirstStart = span.startTick;
        }
        const isStrong = isStrongBeat(span.startTick + metricOffset, ppq, tsNum, tsDenom);
        if (nextState.macroRunCount > 2) {
            nextState.violated = true;
            break;
        }
        if (isStrong && nextState.macroRunCount > 1) {
            nextState.violated = true;
            break;
        }
        if (nextState.macroRunCount === 2) {
            const prevIsStrong = isStrongBeat(nextState.macroRunFirstStart + metricOffset, ppq, tsNum, tsDenom);
            if (isStrong || prevIsStrong) {
                nextState.violated = true;
                break;
            }
        }
    }
    return nextState;
}

function rebaseRunSpansToAbsolute(runSpans: SimultaneitySpan[], pairAnchorStartTick: number): SimultaneitySpan[] {
    if (runSpans.length === 0) return [];
    return runSpans.map((span) => ({
        startTick: span.startTick + pairAnchorStartTick,
        endTick: span.endTick + pairAnchorStartTick
    }));
}

class MapPrecomputeIndex implements PairwiseTripletPrecomputeIndex {
    private readonly pairwiseCompatibleTriplets: PairwiseByVariantA = new Map();
    private readonly validPairsList: PairTuple[] = [];
    private readonly pairsByFirstVariant: Map<number, PairTuple[]> = new Map();
    private readonly transitionsByWindow: TransitionByVariantLeft = new Map();
    private readonly harmonicallyValidTripletShapes = new Set<string>();

    setPairRecord(vA: number, vB: number, d: number, t: number, record: PairwiseCompatibilityRecord): void {
        let byVariantB = this.pairwiseCompatibleTriplets.get(vA);
        if (!byVariantB) {
            byVariantB = new Map();
            this.pairwiseCompatibleTriplets.set(vA, byVariantB);
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
        const pair: PairTuple = { vA, vB, d, t };
        this.validPairsList.push(pair);
        const byFirst = this.pairsByFirstVariant.get(vA);
        if (byFirst) byFirst.push(pair);
        else this.pairsByFirstVariant.set(vA, [pair]);
    }

    getPairRecord(vA: number, vB: number, d: number, t: number): PairwiseCompatibilityRecord | undefined {
        return this.pairwiseCompatibleTriplets.get(vA)?.get(vB)?.get(d)?.get(t);
    }

    getValidPairs(): PairTuple[] {
        return this.validPairsList;
    }

    getPairsByFirstVariant(variantA: number): PairTuple[] {
        return this.pairsByFirstVariant.get(variantA) ?? [];
    }

    forEachPairTransposition(vA: number, vB: number, d: number, iteratee: (t: number, record: PairwiseCompatibilityRecord) => void): void {
        const byTransposition = this.pairwiseCompatibleTriplets.get(vA)?.get(vB)?.get(d);
        if (!byTransposition) return;
        for (const [t, record] of byTransposition.entries()) {
            iteratee(t, record);
        }
    }

    appendWindowTransition(
        variantLeft: number,
        variantRight: number,
        delayATicks: number,
        delayABTicks: number,
        transpositionDelta: number,
        transition: NextTransition
    ): void {
        let byVariantRight = this.transitionsByWindow.get(variantLeft);
        if (!byVariantRight) {
            byVariantRight = new Map();
            this.transitionsByWindow.set(variantLeft, byVariantRight);
        }
        let byDelayA = byVariantRight.get(variantRight);
        if (!byDelayA) {
            byDelayA = new Map();
            byVariantRight.set(variantRight, byDelayA);
        }
        let byDelayAB = byDelayA.get(delayATicks);
        if (!byDelayAB) {
            byDelayAB = new Map();
            byDelayA.set(delayATicks, byDelayAB);
        }
        let byTranspositionDelta = byDelayAB.get(delayABTicks);
        if (!byTranspositionDelta) {
            byTranspositionDelta = new Map();
            byDelayAB.set(delayABTicks, byTranspositionDelta);
        }
        let transitionsAtDelay = byTranspositionDelta.get(transpositionDelta);
        if (!transitionsAtDelay) {
            transitionsAtDelay = new Map();
            byTranspositionDelta.set(transpositionDelta, transitionsAtDelay);
        }
        const bucket = transitionsAtDelay.get(transition.delayTicks);
        if (bucket) bucket.push(transition);
        else transitionsAtDelay.set(transition.delayTicks, [transition]);
    }

    getWindowTransitions(
        variantLeft: number,
        variantRight: number,
        delayATicks: number,
        delayABTicks: number,
        transpositionDelta: number
    ): TransitionBucketsByDelay | undefined {
        return this.transitionsByWindow.get(variantLeft)?.get(variantRight)?.get(delayATicks)?.get(delayABTicks)?.get(transpositionDelta);
    }

    addTripletShapeKey(key: string): void {
        this.harmonicallyValidTripletShapes.add(key);
    }

    hasTripletShapeKey(key: string): boolean {
        return this.harmonicallyValidTripletShapes.has(key);
    }

    getTripletShapeCount(): number {
        return this.harmonicallyValidTripletShapes.size;
    }
}

class DensePrecomputeIndex implements PairwiseTripletPrecomputeIndex {
    private readonly variantCount: number;
    private readonly transpositions: number[];
    private readonly delayCount: number;
    private readonly transpositionCount: number;
    private readonly delayToIndex: Map<number, number>;
    private readonly transpositionToIndex: Map<number, number>;
    private readonly pairRecordStore: Array<PairwiseCompatibilityRecord | undefined>;
    private readonly validPairsList: PairTuple[] = [];
    private readonly pairsByFirstVariant: Map<number, PairTuple[]> = new Map();
    private readonly transitionsByWindow = new Map<string, TransitionBucketsByDelay>();
    private readonly harmonicallyValidTripletShapes = new Set<string>();

    constructor(variantCount: number, delays: number[], transpositions: number[]) {
        this.variantCount = variantCount;
        this.delayCount = delays.length;
        this.transpositionCount = transpositions.length;
        this.delayToIndex = new Map(delays.map((delay, idx) => [delay, idx]));
        this.transpositionToIndex = new Map(transpositions.map((t, idx) => [t, idx]));
        this.pairRecordStore = new Array(variantCount * variantCount * this.delayCount * this.transpositionCount);
        this.transpositions = transpositions;
    }

    private getPairIndex(vA: number, vB: number, d: number, t: number): number | null {
        const delayIdx = this.delayToIndex.get(d);
        const transpositionIdx = this.transpositionToIndex.get(t);
        if (delayIdx === undefined || transpositionIdx === undefined) return null;
        return ((((vA * this.variantCount) + vB) * this.delayCount) + delayIdx) * this.transpositionCount + transpositionIdx;
    }

    private toWindowKey(variantLeft: number, variantRight: number, delayATicks: number, delayABTicks: number, transpositionDelta: number): string {
        return `${variantLeft}|${variantRight}|${delayATicks}|${delayABTicks}|${transpositionDelta}`;
    }

    setPairRecord(vA: number, vB: number, d: number, t: number, record: PairwiseCompatibilityRecord): void {
        const idx = this.getPairIndex(vA, vB, d, t);
        if (idx === null || this.pairRecordStore[idx]) return;
        this.pairRecordStore[idx] = record;
        const pair: PairTuple = { vA, vB, d, t };
        this.validPairsList.push(pair);
        const byFirst = this.pairsByFirstVariant.get(vA);
        if (byFirst) byFirst.push(pair);
        else this.pairsByFirstVariant.set(vA, [pair]);
    }

    getPairRecord(vA: number, vB: number, d: number, t: number): PairwiseCompatibilityRecord | undefined {
        const idx = this.getPairIndex(vA, vB, d, t);
        return idx === null ? undefined : this.pairRecordStore[idx];
    }

    getValidPairs(): PairTuple[] {
        return this.validPairsList;
    }

    getPairsByFirstVariant(variantA: number): PairTuple[] {
        return this.pairsByFirstVariant.get(variantA) ?? [];
    }

    forEachPairTransposition(vA: number, vB: number, d: number, iteratee: (t: number, record: PairwiseCompatibilityRecord) => void): void {
        for (const t of this.transpositions) {
            const rec = this.getPairRecord(vA, vB, d, t);
            if (rec) iteratee(t, rec);
        }
    }

    appendWindowTransition(
        variantLeft: number,
        variantRight: number,
        delayATicks: number,
        delayABTicks: number,
        transpositionDelta: number,
        transition: NextTransition
    ): void {
        const key = this.toWindowKey(variantLeft, variantRight, delayATicks, delayABTicks, transpositionDelta);
        let transitionBuckets = this.transitionsByWindow.get(key);
        if (!transitionBuckets) {
            transitionBuckets = new Map();
            this.transitionsByWindow.set(key, transitionBuckets);
        }
        const bucket = transitionBuckets.get(transition.delayTicks);
        if (bucket) bucket.push(transition);
        else transitionBuckets.set(transition.delayTicks, [transition]);
    }

    getWindowTransitions(
        variantLeft: number,
        variantRight: number,
        delayATicks: number,
        delayABTicks: number,
        transpositionDelta: number
    ): TransitionBucketsByDelay | undefined {
        return this.transitionsByWindow.get(this.toWindowKey(variantLeft, variantRight, delayATicks, delayABTicks, transpositionDelta));
    }

    addTripletShapeKey(key: string): void {
        this.harmonicallyValidTripletShapes.add(key);
    }

    hasTripletShapeKey(key: string): boolean {
        return this.harmonicallyValidTripletShapes.has(key);
    }

    getTripletShapeCount(): number {
        return this.harmonicallyValidTripletShapes.size;
    }
}

function resolvePrecomputeBackend(config?: StrettoPrecomputeConfig): StrettoPrecomputeBackend {
    // Serialized task marker (post 6A–6D rebase): backend switch is isolated to precompute index wiring.
    if (config?.backend === 'map' || config?.backend === 'dense') return config.backend;
    return process.env.STRETTO_PRECOMPUTE_BACKEND === 'map' ? 'map' : 'dense';
}

// --- Generator ---

export async function searchStrettoChains(
    rawSubject: RawNote[],
    options: StrettoSearchOptions,
    ppq: number,
    onProgress?: (progress: StrettoSearchProgressUpdate) => void,
    internalConfig?: StrettoPrecomputeConfig
): Promise<StrettoSearchReport> {

    const startTime = Date.now();
    let nodesVisited = 0;
    let edgesTraversed = 0;
    let maxDepth = 0;
    let pairwiseOperationsProcessed = 0;
    let tripletOperationsProcessed = 0;
    let dagNodesExpanded = 0;
    let dagEdgesEvaluated = 0;
    let dagExploredWorkItems = 0;
    let dagLiveFrontierWorkItems = 0;
    let dagHeuristicCompletionRatio: number | undefined = undefined;
    let operationCounter = 0;
    let lastProgressEmitMs = 0;
    let fullChainsFound = 0;
    let structurallyCompleteChainsFound = 0;
    let prefixAdmissibleCompleteChainsFound = 0;
    let finalizationScoredCount = 0;
    let finalizationRejectedScoringInvalid = 0;
    let finalizationRejectedVoiceAssignment = 0;
    const maxDissonanceRunEventsHistogram: Record<string, number> = {};
    const configuredTimeLimitMs = Number.isFinite(options.maxSearchTimeMs) ? Math.max(1, Math.floor(options.maxSearchTimeMs as number)) : DEFAULT_TIME_LIMIT_MS;
    const enablePrefixAdmissibilityGate = process.env.STRETTO_DISABLE_PREFIX_ADMISSIBILITY !== '1';
    let activeTimeLimitMs = configuredTimeLimitMs;
    let timeoutExtensionAppliedMs = 0;
    let tripletBudgetMs = 0;
    let tripletEnumerationTruncated = false;
    let terminationReason: StrettoSearchReport['stats']['stopReason'] | null = null;
    const emitStageProgress = (
        stage: StrettoSearchProgressStage,
        completedUnits: number,
        totalUnits: number,
        force: boolean = false,
        terminal: boolean = false
    ): void => {
        if (!onProgress) return;
        const boundedTotal = Math.max(1, Math.floor(totalUnits));
        const boundedCompleted = Math.max(0, Math.min(Math.floor(completedUnits), boundedTotal));
        const now = Date.now();
        if (!force && (now - lastProgressEmitMs) < 100) return;
        lastProgressEmitMs = now;
        onProgress({
            stage,
            completedUnits: boundedCompleted,
            totalUnits: boundedTotal,
            terminal,
            telemetry: {
                validPairs: stageStats.pairwiseCompatible,
                validTriplets: stageStats.harmonicallyValidTriples,
                chainsFound: fullChainsFound,
                maxDepthReached: maxDepth,
                targetChainLength: options.targetChainLength,
                pairwiseOperationsProcessed,
                tripletOperationsProcessed,
                dagNodesExpanded,
                dagEdgesEvaluated,
                dagExploredWorkItems,
                dagLiveFrontierWorkItems,
                dagHeuristicCompletionRatio
            }
        });
    };
    
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
                    tripletRejectA10: 0,
                    tripletRejectA8: 0,
                    tripletRejectDelayShape: 0,
                    tripletRejectPairBCMissing: 0,
                    tripletRejectAdjSepBC: 0,
                    tripletRejectPairACMissing: 0,
                    tripletRejectLowerBound: 0,
                    tripletRejectParallel: 0,
                    tripletRejectVoice: 0,
                    tripletRejectP4Bass: 0,
                    tripleLowerBoundRejected: 0,
                    tripleParallelRejected: 0,
                    tripleVoiceRejected: 0,
                    tripleP4BassRejected: 0,
                    tripletRejectNoDelayContext: 0,
                    tripletRejectedTotal: 0,
                    tripletAcceptedTotal: 0,
                    tripletCandidatesAccepted: 0,
                    tripletDistinctShapesAccepted: 0,
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
                    candidateTransitionsEnumerated: 0,
                    prunedByPrefixAdmissibility: 0
                }
            }
        };
    }
    
    const subjectLengthTicks = Math.max(...baseNotes.map(n => n.relTick + n.durationTicks));
    const subjectMinPitch = Math.min(...baseNotes.map((n) => n.pitch));
    const subjectMaxPitch = Math.max(...baseNotes.map((n) => n.pitch));
    const subjectSpanSemitones = Math.max(0, subjectMaxPitch - subjectMinPitch);
    
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
    const sortedVariantTimelines = variants.map((variant) => buildSortedNoteTimeline(variant));

    // Delays happen in half-beat intervals (8th notes)
    const delayStep = ppq / 2;
    const isCanonDelaySearch = options.delaySearchCategory === 'canon';

    // Adjacent delays: used for triplet enumeration (rule A.6 cap at 2/3 Sb)
    const validAdjacentDelays: number[] = [];
    const maxAdjacentDelayTicks = Math.floor(subjectLengthTicks * (2/3));
    const canonDelayMinTicksRaw = Math.round((options.canonDelayMinBeats ?? 1) * ppq);
    const canonDelayMaxTicksRaw = Math.round((options.canonDelayMaxBeats ?? 4) * ppq);
    const canonDelayLowerTicks = Math.max(delayStep, Math.min(canonDelayMinTicksRaw, canonDelayMaxTicksRaw));
    const canonDelayUpperTicks = Math.max(delayStep, Math.max(canonDelayMinTicksRaw, canonDelayMaxTicksRaw));
    const maxPairwiseDelayTicks = subjectLengthTicks - delayStep;
    const normalizedCanonDelayMinTicks = Math.ceil(canonDelayLowerTicks / delayStep) * delayStep;
    const normalizedCanonDelayMaxTicks = Math.floor(Math.min(canonDelayUpperTicks, maxPairwiseDelayTicks) / delayStep) * delayStep;
    const canonDelayTicks = new Set<number>();
    if (isCanonDelaySearch && normalizedCanonDelayMinTicks <= normalizedCanonDelayMaxTicks) {
        for (let d = normalizedCanonDelayMinTicks; d <= normalizedCanonDelayMaxTicks; d += delayStep) {
            canonDelayTicks.add(d);
        }
    }
    for (let d = delayStep; d <= maxAdjacentDelayTicks; d += delayStep) {
        if (!isCanonDelaySearch || canonDelayTicks.has(d)) validAdjacentDelays.push(d);
    }

    // Pairwise delays: extends to Sb - delayStep for long-range pair lookups.
    // Entries i and j overlap whenever cumulative delay < Sb, which can exceed 2/3 Sb.
    const validPairwiseDelays: number[] = [];
    for (let d = delayStep; d <= maxPairwiseDelayTicks; d += delayStep) {
        if (!isCanonDelaySearch || canonDelayTicks.has(d)) validPairwiseDelays.push(d);
    }

    // Legacy alias used by stageStats and admissibility model
    const validDelays = validAdjacentDelays;
    const halfSubjectTicks = subjectLengthTicks / 2;
    const oneQuarterSubjectTicks = subjectLengthTicks / 4;
    const oneThirdSubjectTicks = subjectLengthTicks / 3;
    // User-specified floor on every d_i (independent of depth-1 0.5×Sb rule).
    const userMinDelayTicks = options.strettoMinDelayBeats != null
        ? Math.ceil(Math.round(options.strettoMinDelayBeats * ppq) / delayStep) * delayStep
        : 0;
    const satisfiesHalfLengthTrigger = (previousDelayTicks: number, nextDelayTicks: number): boolean => (
        !((previousDelayTicks >= halfSubjectTicks || nextDelayTicks >= halfSubjectTicks) && nextDelayTicks >= previousDelayTicks)
    );
    const satisfiesMaximumContractionBound = (previousDelayTicks: number, nextDelayTicks: number): boolean => (
        previousDelayTicks - nextDelayTicks <= oneQuarterSubjectTicks
    );
    const satisfiesPostTruncationContraction = (
        previousVariantIndex: number,
        previousDelayTicks: number,
        nextDelayTicks: number
    ): boolean => (
        !(variants[previousVariantIndex].truncationBeats > 0
            && previousDelayTicks >= oneThirdSubjectTicks
            && nextDelayTicks > previousDelayTicks - ppq)
    );
    const satisfiesExpansionRecoil = (delayA: number, delayB: number, delayC: number): boolean => (
        !(delayB > delayA && delayB > oneThirdSubjectTicks && delayC >= delayA - delayStep)
    );
    const hasPairwiseHighDelayUniqueness = (...delays: number[]): boolean => {
        for (let i = 0; i < delays.length; i++) {
            if (delays[i] <= oneThirdSubjectTicks) continue;
            for (let j = i + 1; j < delays.length; j++) {
                if (delays[j] <= oneThirdSubjectTicks) continue;
                if (delays[i] === delays[j]) return false;
            }
        }
        return true;
    };
    
    const transpositions = Array.from(INTERVALS.TRAD_TRANSPOSITIONS);
    if (options.thirdSixthMode !== 'None') {
        INTERVALS.THIRD_SIXTH_TRANSPOSITIONS.forEach(t => transpositions.push(t));
    }
    const absoluteTranspositionToIndex = new Map(transpositions.map((t, idx) => [t, idx]));
    const voiceTranspositionAdmissibilityIndex = buildVoiceTranspositionAdmissibilityIndex({
        targetChainLength: options.targetChainLength,
        voiceCount: options.ensembleTotal,
        transpositionCount: transpositions.length,
        rootVoiceIndex: options.subjectVoiceIndex,
        transpositionPairPredicate: (tPrevIdx, tCurrIdx) => Math.abs(transpositions[tCurrIdx] - transpositions[tPrevIdx]) >= 5
    });
    const allowedTranspositions = new Set(transpositions);
    const relativeTranspositionDeltas = Array.from(new Set(
        transpositions.flatMap((left) => transpositions.map((right) => right - left))
    ));
    // Precomputed rule table: O(1) typed-array lookups replace repeated inline interval
    // class tests inside the pairwise loop (isRestricted, isFree, adjacentSeparation).
    const transpositionRuleTable = buildTranspositionRuleTables(relativeTranspositionDeltas);
    const precomputeBackend = resolvePrecomputeBackend(internalConfig);


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
        tripletRejectA10: 0,
        tripletRejectA8: 0,
        tripletRejectDelayShape: 0,
        tripletRejectPairBCMissing: 0,
        tripletRejectAdjSepBC: 0,
        tripletRejectPairACMissing: 0,
        tripletRejectLowerBound: 0,
        tripletRejectParallel: 0,
        tripletRejectVoice: 0,
        tripletRejectP4Bass: 0,
        tripleLowerBoundRejected: 0,
        tripleParallelRejected: 0,
        tripleVoiceRejected: 0,
        tripleP4BassRejected: 0,
        tripletRejectNoDelayContext: 0,
        tripletRejectedTotal: 0,
        tripletAcceptedTotal: 0,
        tripletCandidatesAccepted: 0,
        tripletDistinctShapesAccepted: 0,
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
        candidateTransitionsEnumerated: 0,
        prunedByPrefixAdmissibility: 0
    };

    const precomputeIndex: PairwiseTripletPrecomputeIndex = precomputeBackend === 'dense'
        ? new DensePrecomputeIndex(variants.length, validPairwiseDelays, relativeTranspositionDeltas)
        : new MapPrecomputeIndex();

    const collectSpans = options.collectDiagnosticSpans === true;
    const forceFullPairwiseDiagnostic = collectSpans || process.env.STRETTO_DIAGNOSTIC_FULL_PAIRWISE === '1';
    const admissibilityMode: StrettoAdmissibilityMode = forceFullPairwiseDiagnostic
        ? 'disabled'
        : (internalConfig?.admissibilityMode ?? 'delay-variant-only');

    // Emit concrete stage metadata before structural admissibility precompute begins.
    // This phase can be expensive for larger option spaces; emitting here ensures
    // UI transitions out of heartbeat-only status immediately.
    emitStageProgress('pairwise', 0, 1, true);
    const t0Admissibility = Date.now();
    const entryStateAdmissibilityModel = admissibilityMode === 'disabled'
        ? { admissiblePairKeys: null, validDelayTransitions: null, statesVisited: 0 }
        : admissibilityMode === 'delay-variant-only'
            ? await buildDelayVariantAdmissibilityModel(variants, delayStep, options.targetChainLength, options)
            : await buildEntryStateAdmissibilityModel(
                variants,
                transpositions,
                relativeTranspositionDeltas,
                delayStep,
                options.targetChainLength,
                options
            );
    const admissibilityMs = Date.now() - t0Admissibility;

    // Translate the admissibility model's nested-Map structure into a dense compat matrix
    // so the pairwise hot-loop uses a single byte-array probe instead of 4-level Map chaining.
    // Both validAdjacentDelays and validPairwiseDelays share the same delayStep stride from the
    // same origin, so the pairwise loop's dIdx equals the adjacent-delay index for every d ≤ maxAdjacentDelayTicks.
    const admissiblePairKeys = entryStateAdmissibilityModel.admissiblePairKeys;
    const validDelayTransitionsByAbsPos = entryStateAdmissibilityModel.validDelayTransitions;
    const validDelayTransitionsStartPos = validDelayTransitionsByAbsPos?.[2] ?? null;
    const validDelayTransitionsInteriorPos = validDelayTransitionsByAbsPos
        ? (() => {
            const interior = new Set<string>();
            for (let absPos = 3; absPos < validDelayTransitionsByAbsPos.length; absPos++) {
                for (const key of validDelayTransitionsByAbsPos[absPos]) interior.add(key);
            }
            return interior;
        })()
        : null;
    const transpToIdx = new Map(relativeTranspositionDeltas.map((t, i) => [t, i]));
    const adjDelayToIdx = (d: number) => Math.round(d / delayStep) - 1;
    const admissibilityMatrix = admissiblePairKeys
        ? (() => {
            const m = createCompatMatrix({
                V: variants.length,
                D: validAdjacentDelays.length,
                T: relativeTranspositionDeltas.length
            });
            for (const [vA, byB] of admissiblePairKeys) {
                for (const [vB, byD] of byB) {
                    for (const [d, transpSet] of byD) {
                        const d_idx = adjDelayToIdx(d);
                        if (d_idx < 0 || d_idx >= validAdjacentDelays.length) continue;
                        if (admissibilityMode === 'delay-variant-only') {
                            // Mark ALL transpositions admissible for this (vA, vB, d)
                            for (let tIdx = 0; tIdx < relativeTranspositionDeltas.length; tIdx++) {
                                m.set(vA, vB, d_idx, tIdx, { status: 1, constraintClass: 0 });
                            }
                        } else {
                            for (const t of transpSet) {
                                const ti = transpToIdx.get(t);
                                if (ti === undefined) continue;
                                m.set(vA, vB, d_idx, ti, { status: 1, constraintClass: 0 });
                            }
                        }
                    }
                }
            }
            return m;
        })()
        : null;

    let pairwiseTotalUnits = 0;
    for (let iA = 0; iA < variants.length; iA++) {
        const vA = variants[iA];
        for (let iB = 0; iB < variants.length; iB++) {
            for (let dIdx = 0; dIdx < validPairwiseDelays.length; dIdx++) {
                const d = validPairwiseDelays[dIdx];
                if (d >= vA.lengthTicks) break;
                const isAdjDelay = dIdx < validAdjacentDelays.length;
                for (let tIdx = 0; tIdx < relativeTranspositionDeltas.length; tIdx++) {
                    if (admissibilityMatrix && isAdjDelay
                        && admissibilityMatrix.get(iA, iB, dIdx, tIdx).status === 0) {
                        continue;
                    }
                    pairwiseTotalUnits++;
                }
            }
        }
    }
    let pairwiseCompletedUnits = 0;
    emitStageProgress('pairwise', 0, pairwiseTotalUnits, true);

    const scanCache = new Map<string, PairwiseScanResult>();
    const canonicalPerfectGuardFlags = new Map<string, { hasFourth: boolean; hasParallelPerfect58: boolean }>();

    // Phase 1: STRUCTURAL PAIRWISE PRECOMPUTATION
    // Compute all 3 bass-role scans (none, a, b) at precomp time so traversal never re-scans.
    // Also precompute interval class metadata for quota checks.
    const t0Pairwise = Date.now();
    for (let iA = 0; iA < variants.length; iA++) {
        const vA = variants[iA];
        for (let iB = 0; iB < variants.length; iB++) {
            const vB = variants[iB];
            // Optimization: if variant A is truncated, pairs only overlap when d < lenA.
            const maxDelayForVA = vA.lengthTicks;
            for (let dIdx = 0; dIdx < validPairwiseDelays.length; dIdx++) {
                const d = validPairwiseDelays[dIdx];
                if (d >= maxDelayForVA) break; // No overlap possible beyond variant A's length
                // Adjacent delays: dIdx maps directly to the compat matrix delay index.
                const isAdjDelay = dIdx < validAdjacentDelays.length;
                for (let tIdx = 0; tIdx < relativeTranspositionDeltas.length; tIdx++) {
                    const t = relativeTranspositionDeltas[tIdx];
                    // Admissibility model only covers adjacent delays (≤ 2/3 Sb).
                    // Extended delays (> 2/3 Sb) are for long-range lookups only — precompute unconditionally.
                    // Matrix byte lookup replaces 4-level Map chain for hot-path filtering.
                    if (admissibilityMatrix && isAdjDelay
                        && admissibilityMatrix.get(iA, iB, dIdx, tIdx).status === 0) {
                        continue;
                    }
                    stageStats.pairwiseTotal++;
                    pairwiseCompletedUnits++;
                    pairwiseOperationsProcessed++;
                    if (pairwiseCompletedUnits % 128 === 0 || pairwiseCompletedUnits === pairwiseTotalUnits) {
                        emitStageProgress('pairwise', pairwiseCompletedUnits, pairwiseTotalUnits);
                    }

                    operationCounter++;
                    if (shouldYieldToEventLoop(operationCounter)) {
                        await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    }

                    const intervalClass = transpositionRuleTable.intervalClassAt(tIdx as RuleTranspositionIndex);
                    const canonicalT = foldTranspositionWithinSpan(t, subjectSpanSemitones);
                    const cachePrefix = `${iA}|${iB}|${d}`;
                    const canonicalFlagKey = `${cachePrefix}|${canonicalT}`;
                    const canonicalFlags = canonicalPerfectGuardFlags.get(canonicalFlagKey);

                    const timelineA = sortedVariantTimelines[iA];
                    const timelineB = sortedVariantTimelines[iB];

                    const resolvePairwiseScan = (bassRoleMode: PairwiseBassRole, skipSpans: boolean): PairwiseScanResult => {
                        const exactKey = `${cachePrefix}|${t}|${bassRoleMode}`;
                        const canonicalKey = `${cachePrefix}|${canonicalT}|${bassRoleMode}`;
                        const canReuseCanonical = shouldReuseCanonicalPairwiseScan(intervalClass, canonicalFlags);
                        const useCanonicalKey = canReuseCanonical || (t === canonicalT);
                        const selectedKey = useCanonicalKey ? canonicalKey : exactKey;

                        const cached = scanCache.get(selectedKey);
                        if (cached) return cached;

                        stageStats.structuralScanInvocations++;
                        const scanTransposition = useCanonicalKey ? canonicalT : t;
                        const computed = checkCounterpointStructureWithBassRole(
                            vA,
                            vB,
                            d,
                            scanTransposition,
                            options.maxPairwiseDissonance,
                            bassRoleMode,
                            ppq,
                            tsNum,
                            tsDenom,
                            skipSpans,
                            timelineA,
                            timelineB
                        );
                        scanCache.set(selectedKey, computed);
                        return computed;
                    };

                    // Neutral scan (P4 treated as provisionally consonant)
                    const pairScan = resolvePairwiseScan('none', !collectSpans);
                    if (!canonicalFlags && t === canonicalT) {
                        canonicalPerfectGuardFlags.set(canonicalFlagKey, {
                            hasFourth: pairScan.hasFourth,
                            hasParallelPerfect58: pairScan.hasParallelPerfect58
                        });
                    }
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
                        ? resolvePairwiseScan('a', true)
                        : pairScan;
                    const bassStrictB = requiresBassRoleRescan
                        ? resolvePairwiseScan('b', true)
                        : pairScan;

                    const disallowLowestPair = shouldPruneLowestVoicePair(bassStrictA.compatible, bassStrictB.compatible);
                    const allowedVoicePairs = buildAllowedVoicePairs(t, options.ensembleTotal, disallowLowestPair);
                    const allowedVoiceMaskRows = buildAllowedVoiceMaskRows(t, options.ensembleTotal, disallowLowestPair);
                    if (allowedVoicePairs.size === 0) {
                        stageStats.pairStageRejected++;
                        continue;
                    }

                    // Rule table lookups replace inline interval class tests.
                    // tIdx aligns with the rule table index because both use the same
                    // deduplicated relativeTranspositionDeltas as their source array.
                    const tRule = tIdx as RuleTranspositionIndex;
                    const isRestrictedInterval = transpositionRuleTable.isRestrictedAt(tRule);
                    const isFreeInterval = transpositionRuleTable.isFreeAt(tRule);

                    // If P4 exists and only 2 voices are active at those points,
                    // the P4 is immediately dissonant (no other voice can provide the bass below).
                    // This is a cheap pruning rule: in a pairwise context, if hasFourth is true,
                    // the lower note IS the bass by definition (only 2 voices sounding).
                    // So check: does treating ALL P4s as dissonant violate the pair?
                    // The bassStrictA/B scans already capture this per-role.
                    // For the "2 voices only" case, both bass-role results tell us the full story.

                    precomputeIndex.setPairRecord(iA, iB, d, t, {
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
                        meetsAdjacentTranspositionSeparation: transpositionRuleTable.meetsAdjacentSeparationAt(tRule)
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

    const pairwiseMs = Date.now() - t0Pairwise;

    // --- PRECOMPUTE TRIPLES ---
    // Numeric window-transition index is precomputed once so expandNode never rebuilds it.
    const t0Triplet = Date.now();
    const validPairsList = precomputeIndex.getValidPairs();

    // Extended-delay pairs (d > 2/3 Sb, added by validPairwiseDelays) are needed for the A→C
    // pairwise lookup (getPairRecord) but must NOT drive p1/p2 triplet enumeration — they
    // represent cumulative offsets, not individual chain delays, and would violate A.6.
    // Pre-filter to adjacent-only for the O(N²) triplet loops; this restores pre-extension perf.
    const adjacentValidPairsList = validPairsList.filter((p) => (
        isCanonDelaySearch ? canonDelayTicks.has(p.d) : p.d <= maxAdjacentDelayTicks
    ));
    const adjacentNextPairsByVariant = new Map<number, PairTuple[]>();
    for (const p of adjacentValidPairsList) {
        let list = adjacentNextPairsByVariant.get(p.vA);
        if (!list) { list = []; adjacentNextPairsByVariant.set(p.vA, list); }
        list.push(p);
    }

    let tripletEnumerationTotalUnits = 0;
    for (const p1 of adjacentValidPairsList) {
        tripletEnumerationTotalUnits += (adjacentNextPairsByVariant.get(p1.vB) ?? []).length;
    }
    const tripletRecordIndexingTotalUnits = tripletEnumerationTotalUnits;
    const tripletTotalUnits = tripletEnumerationTotalUnits + tripletRecordIndexingTotalUnits;
    let tripletCompletedUnits = 0;

    const phase1ElapsedMs = Date.now() - startTime;
    const remainingMs = Math.max(1, configuredTimeLimitMs - phase1ElapsedMs);
    const estimatedTripletMs = pairwiseTotalUnits > 0
        ? Math.ceil((tripletEnumerationTotalUnits / pairwiseTotalUnits) * phase1ElapsedMs * 1.5)
        : remainingMs;
    // Reserve an adaptive Phase A/B window. The reserve scales with remaining budget and
    // keeps non-enumeration traversal from starvation in short time-limit configurations.
    const minSearchBudgetMs = Math.min(
        Math.max(500, remainingMs - 500),
        Math.max(1000, Math.min(3000, Math.floor(remainingMs * 0.25)))
    );
    const tripletBudgetFloorMs = Math.max(500, Math.floor(remainingMs * 0.1));
    const tripletBudgetCapMs = Math.max(250, remainingMs - minSearchBudgetMs);
    const clampTripletBudget = (value: number): number => {
        if (tripletBudgetCapMs <= tripletBudgetFloorMs) return Math.max(1, tripletBudgetCapMs);
        return Math.max(tripletBudgetFloorMs, Math.min(tripletBudgetCapMs, value));
    };
    tripletBudgetMs = clampTripletBudget(Math.max(1, estimatedTripletMs));
    const tripletStartMs = Date.now();
    let tripletDeadlineMs = tripletStartMs + tripletBudgetMs;
    let tripletBudgetCalibrated = false;
    const tripletCalibrationWindowMs = Math.min(2000, Math.max(1000, Math.floor(remainingMs * 0.2)));

    const pairQuality = (pair: PairTuple): number => {
        const record = precomputeIndex.getPairRecord(pair.vA, pair.vB, pair.d, pair.t);
        return record ? pairScore(record) : 999_999;
    };
    const prioritizedAdjacentPairs = buildDiversifiedPriorityOrder(adjacentValidPairsList, pairQuality);
    adjacentValidPairsList.splice(0, adjacentValidPairsList.length, ...prioritizedAdjacentPairs);
    // Sort inner-loop arrays by .d ascending so the fallback path (disabled/full modes)
    // can break as soon as d_te_2 exceeds the bounded-expansion limit.
    for (const [variantIndex, pairs] of adjacentNextPairsByVariant.entries()) {
        adjacentNextPairsByVariant.set(variantIndex, [...pairs].sort((a, b) => a.d - b.d));
    }

    emitStageProgress('triplet', 0, tripletTotalUnits, true);

    const validTripletDelayAs = [0, ...validAdjacentDelays];
    const maxTripletTransitionAbsIndex = Math.max(1, options.targetChainLength - 1);
    // Voice assignment is post-hoc so we check whether ANY ensemble voice pair (vPrev, vCurr)
    // is FSM-admissible at this depth. This preserves terminal coverage pruning (last
    // ensembleTotal entries must cover all voices) while avoiding false negatives from
    // variant indices being mistakenly used as voice labels.
    const hasVoiceTranspositionTripletContext = (
        _transpositionAB: number,
        _transpositionBC: number,
        startReachable: boolean,
        interiorReachable: boolean
    ): boolean => {
        if (startReachable && voiceTranspositionAdmissibilityIndex.hasAnyVoicePairAtPosition(2)) return true;
        if (!interiorReachable) return false;
        for (let absEntryIndex = 3; absEntryIndex <= maxTripletTransitionAbsIndex; absEntryIndex++) {
            if (voiceTranspositionAdmissibilityIndex.hasAnyVoicePairAtPosition(absEntryIndex)) return true;
        }
        return false;
    };

    for (const p1 of adjacentValidPairsList) {
        if (tripletEnumerationTruncated) break;
        const pairAB = precomputeIndex.getPairRecord(p1.vA, p1.vB, p1.d, p1.t);
        if (!pairAB) continue;

        // A.7 on the A→B edge is invariant across all p2 — check once in the outer loop
        // to skip the entire inner loop when it fails (~29% of pairs).
        if (!pairAB.meetsAdjacentTranspositionSeparation) continue;

        const d_te_1 = p1.d;
        const vA = p1.vA;
        const vB = p1.vB;
        const vAVariant = variants[vA];
        const vBVariant = variants[vB];

        const nextPairs = adjacentNextPairsByVariant.get(p1.vB) ?? [];
        for (const p2 of nextPairs) {
            if (Date.now() >= tripletDeadlineMs) {
                tripletEnumerationTruncated = true;
                break;
            }
            stageStats.tripleCandidates++;
            tripletCompletedUnits++;
            tripletOperationsProcessed++;
            operationCounter++;
            if (shouldYieldToEventLoop(operationCounter)) {
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
            if (tripletCompletedUnits % 128 === 0 || tripletCompletedUnits === tripletTotalUnits) {
                emitStageProgress('triplet', tripletCompletedUnits, tripletTotalUnits);
                const elapsedTripletMs = Date.now() - tripletStartMs;
                if (!tripletBudgetCalibrated && elapsedTripletMs >= tripletCalibrationWindowMs && tripletCompletedUnits > 0) {
                    const opsPerMs = tripletCompletedUnits / Math.max(1, elapsedTripletMs);
                    const projectedTripletMs = Math.ceil((tripletTotalUnits / Math.max(0.001, opsPerMs)) * 1.1);
                    tripletBudgetMs = clampTripletBudget(projectedTripletMs);
                    tripletDeadlineMs = tripletStartMs + tripletBudgetMs;
                    tripletBudgetCalibrated = true;
                }
            }

            // All cheap checks before the pairBC index lookup:
            const d_te_2 = p2.d;
            const vC = p2.vB;
            const vCVariant = variants[vC];
            let rejectReason: TripletRejectReason | null = null;

            if (validDelayTransitionsByAbsPos !== null) {
                // Single O(1) probe: key is "${vPrev}:${vNext}:${dPrev}:${dNext}" where
                // vPrev=vB, vNext=vC, dPrev=d_te_1 (delay into B), dNext=d_te_2 (delay into C).
                // Replaces A.10, A.8, bounded expansion, A.2, A.5, A.4.
                const transitionKey = `${vB}:${vC}:${d_te_1}:${d_te_2}`;
                // A candidate can survive only if this transition is reachable in at least
                // one admissible triplet context: chain-start (absolute position p=2) or interior (p>=3).
                const startReachable = Boolean(validDelayTransitionsStartPos?.has(transitionKey));
                const interiorReachable = Boolean(validDelayTransitionsInteriorPos?.has(transitionKey));
                if (!startReachable && !interiorReachable) {
                    rejectReason = TRIPLET_REJECT_REASON.DELAY_SHAPE;
                } else if (!hasVoiceTranspositionTripletContext(p1.t, p2.t, startReachable, interiorReachable)) {
                    rejectReason = TRIPLET_REJECT_REASON.VOICE;
                }
            } else {
                // Fallback for disabled/full-admissibility modes (no transition index available).
                // Inner arrays are sorted by .d ascending; once d_te_2 exceeds the bounded-expansion
                // limit all subsequent pairs also exceed it, so break the inner loop immediately.
                if (!isCanonDelaySearch && d_te_2 > d_te_1 + delayStep) break;
                if (!isCanonDelaySearch) {
                    if (d_te_1 >= halfSubjectTicks && vBVariant.truncationBeats > 0) rejectReason = TRIPLET_REJECT_REASON.A10;
                    else if (d_te_2 >= halfSubjectTicks && vCVariant.truncationBeats > 0) rejectReason = TRIPLET_REJECT_REASON.A10;
                }
                const aTransformed = vAVariant.type === 'I' || vAVariant.truncationBeats > 0;
                const bTransformed = vBVariant.type === 'I' || vBVariant.truncationBeats > 0;
                const cTransformed = vCVariant.type === 'I' || vCVariant.truncationBeats > 0;
                if (!rejectReason && (aTransformed && bTransformed)) rejectReason = TRIPLET_REJECT_REASON.A8;
                if (!rejectReason && (bTransformed && cTransformed)) rejectReason = TRIPLET_REJECT_REASON.A8;
                if (!rejectReason && isCanonDelaySearch && d_te_2 !== d_te_1) {
                    rejectReason = TRIPLET_REJECT_REASON.DELAY_SHAPE;
                }
                if (!isCanonDelaySearch) {
                    if (!rejectReason && !satisfiesHalfLengthTrigger(d_te_1, d_te_2)) rejectReason = TRIPLET_REJECT_REASON.DELAY_SHAPE;
                    if (!rejectReason && !satisfiesMaximumContractionBound(d_te_1, d_te_2)) rejectReason = TRIPLET_REJECT_REASON.DELAY_SHAPE;
                    if (!rejectReason && !satisfiesPostTruncationContraction(vB, d_te_1, d_te_2)) rejectReason = TRIPLET_REJECT_REASON.DELAY_SHAPE;
                }
            }

            if (rejectReason) {
                incrementTripletRejectCounter(stageStats, rejectReason);
                continue;
            }

            // Fetch pairBC only after all cheap checks have passed
            const pairBC = precomputeIndex.getPairRecord(p2.vA, p2.vB, p2.d, p2.t);
            if (!pairBC) {
                incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.PAIR_BC_MISSING);
                continue;
            }

            // A.7 on B→C edge (needs pairBC)
            if (!pairBC.meetsAdjacentTranspositionSeparation) {
                incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.ADJ_SEP_BC);
                continue;
            }

            // Rule: Pair A->C compatibility (if overlapping)
            const dAC = d_te_1 + d_te_2;
            const tAC = p1.t + p2.t;
            
            const lenA = variants[vA].lengthTicks;
            if (dAC < lenA) {
                const pairAC = precomputeIndex.getPairRecord(vA, vC, dAC, tAC);
                if (!pairAC) {
                    incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.PAIR_AC_MISSING);
                    continue;
                }
                if (violatesPairwiseLowerBound(pairAB, options.maxPairwiseDissonance)
                    || violatesPairwiseLowerBound(pairBC, options.maxPairwiseDissonance)
                    || violatesPairwiseLowerBound(pairAC, options.maxPairwiseDissonance)) {
                    incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.LOWER_BOUND);
                    continue;
                }
            } else if (violatesPairwiseLowerBound(pairAB, options.maxPairwiseDissonance)
                || violatesPairwiseLowerBound(pairBC, options.maxPairwiseDissonance)) {
                incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.LOWER_BOUND);
                continue;
            }
            
            // Rule: Voice Spacing for the Triple
            const trans = [0, p1.t, p1.t + p2.t].sort((a,b) => a - b);
            if (trans[2] - trans[0] < 7) {
                passesGlobalLineageStage(stageStats, false);
                incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.PARALLEL);
                continue;
            }

            // Use precomputed allowedVoicePairs from pairwise records to constrain
            // the triplet voice assignment. The pairwise records already encode
            // spacing rules (neighbor, 2-gap, bass-alto), so we intersect them.
            const pairAC_rec = (dAC < lenA) ? precomputeIndex.getPairRecord(vA, vC, dAC, tAC) ?? null : null;

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
                    incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.VOICE);
                } else {
                    incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.P4_BASS);
                }
                passesGlobalLineageStage(stageStats, false);
                continue;
            }

            let tripletHasValidDelayContext = false;
            for (const dCtx of validTripletDelayAs) {
                if (validDelayTransitionsByAbsPos !== null) {
                    const transitionKey = `${vB}:${vC}:${d_te_1}:${d_te_2}`;
                    if (dCtx === 0) {
                        if (!validDelayTransitionsStartPos?.has(transitionKey)) continue;
                    } else {
                        if (!validDelayTransitionsInteriorPos?.has(transitionKey)) continue;
                    }
                }
                if (isCanonDelaySearch) {
                    if (dCtx !== 0 && dCtx !== d_te_1) continue;
                } else {
                    // A.1 local: pairwise high-delay uniqueness across (dCtx, d_te_1, d_te_2)
                    if (!hasPairwiseHighDelayUniqueness(dCtx, d_te_1, d_te_2)) continue;
                }

                // dCtx = 0 is the sentinel for the chain start (no real predecessor before e0).
                // Apply A.3 with dCtx = 0, but skip A.2/A.4/A.5 on the synthetic 0→d_te_1 edge.
                if (!isCanonDelaySearch && dCtx !== 0) {
                    if (!satisfiesHalfLengthTrigger(dCtx, d_te_1)) continue;
                    if (!satisfiesMaximumContractionBound(dCtx, d_te_1)) continue;
                    if (!satisfiesPostTruncationContraction(vA, dCtx, d_te_1)) continue;
                    if (!satisfiesExpansionRecoil(dCtx, d_te_1, d_te_2)) continue;
                }

                tripletHasValidDelayContext = true;

                const nextTransition: NextTransition = {
                    nextVariantIndex: vC,
                    delayTicks: d_te_2,
                    transpositionDelta: p2.t,
                    pairRecord: pairBC,
                    isRestrictedInterval: pairBC.isRestrictedInterval,
                    isFreeInterval: pairBC.isFreeInterval
                };
                precomputeIndex.appendWindowTransition(vA, vB, dCtx, d_te_1, p1.t, nextTransition);
            }

            if (tripletHasValidDelayContext) {
                precomputeIndex.addTripletShapeKey(`${vA}|${vB}|${vC}|${d_te_1}|${d_te_2}|${p1.t}|${p2.t}`);
            } else {
                incrementTripletRejectCounter(stageStats, TRIPLET_REJECT_REASON.NO_DELAY_CONTEXT);
            }
        }
    }

    stageStats.tripletRejectedTotal =
        stageStats.tripletRejectA10
        + stageStats.tripletRejectA8
        + stageStats.tripletRejectDelayShape
        + stageStats.tripletRejectPairBCMissing
        + stageStats.tripletRejectAdjSepBC
        + stageStats.tripletRejectPairACMissing
        + stageStats.tripletRejectLowerBound
        + stageStats.tripletRejectParallel
        + stageStats.tripletRejectVoice
        + stageStats.tripletRejectP4Bass
        + stageStats.tripletRejectNoDelayContext;
    stageStats.tripletCandidatesAccepted = stageStats.tripleCandidates - stageStats.tripletRejectedTotal;
    stageStats.tripletAcceptedTotal = stageStats.tripletCandidatesAccepted;
    stageStats.tripletDistinctShapesAccepted = precomputeIndex.getTripletShapeCount();
    stageStats.harmonicallyValidTriples = stageStats.tripletDistinctShapesAccepted;

    // --- Triplet records for triplet-join Phase A ---
    // Each TripletRecord captures a valid (A,B,C) triplet with its pairwise records
    // for cross-triplet dissonance union checks during seed extension.
    interface TripletRecord {
        vA: number; vB: number; vC: number;
        d_te_1: number; d_te_2: number; // delays: d_te_1 = A→B, d_te_2 = B→C (spec: d_i = delay of entry i rel. to i-1)
        tAB: number; tBC: number;
        pairAB: PairwiseCompatibilityRecord;
        pairBC: PairwiseCompatibilityRecord;
        pairAC: PairwiseCompatibilityRecord | null; // null if A and C don't overlap
    }

    const allTripletRecords: TripletRecord[] = [];

    for (const p1 of adjacentValidPairsList) {
        if (tripletEnumerationTruncated) break;
        const pairAB = precomputeIndex.getPairRecord(p1.vA, p1.vB, p1.d, p1.t);
        if (!pairAB) continue;
        const nextPairsForIdx = adjacentNextPairsByVariant.get(p1.vB) ?? [];
        for (const p2 of nextPairsForIdx) {
            if (Date.now() >= tripletDeadlineMs) {
                tripletEnumerationTruncated = true;
                break;
            }
            tripletCompletedUnits++;
            tripletOperationsProcessed++;
            if (tripletCompletedUnits % 128 === 0 || tripletCompletedUnits === tripletTotalUnits) {
                emitStageProgress('triplet', tripletCompletedUnits, tripletTotalUnits);
                const elapsedTripletMs = Date.now() - tripletStartMs;
                if (!tripletBudgetCalibrated && elapsedTripletMs >= tripletCalibrationWindowMs && tripletCompletedUnits > 0) {
                    const opsPerMs = tripletCompletedUnits / Math.max(1, elapsedTripletMs);
                    const projectedTripletMs = Math.ceil((tripletTotalUnits / Math.max(0.001, opsPerMs)) * 1.1);
                    tripletBudgetMs = clampTripletBudget(projectedTripletMs);
                    tripletDeadlineMs = tripletStartMs + tripletBudgetMs;
                    tripletBudgetCalibrated = true;
                }
            }
            const pairBC = precomputeIndex.getPairRecord(p2.vA, p2.vB, p2.d, p2.t)!;
            const transitionKey = `${p1.vB}:${p2.vB}:${p1.d}:${p2.d}`;
            const startReachable = validDelayTransitionsByAbsPos === null
                ? true
                : Boolean(validDelayTransitionsStartPos?.has(transitionKey));
            const interiorReachable = validDelayTransitionsByAbsPos === null
                ? true
                : Boolean(validDelayTransitionsInteriorPos?.has(transitionKey));
            if (!hasVoiceTranspositionTripletContext(p1.t, p2.t, startReachable, interiorReachable)) {
                continue;
            }
            const dAC = p1.d + p2.d;
            const tAC = p1.t + p2.t;
            const lenA = variants[p1.vA].lengthTicks;
            const pairAC = dAC < lenA ? precomputeIndex.getPairRecord(p1.vA, p2.vB, dAC, tAC) ?? null : null;

            const tripletShapeKey = `${p1.vA}|${p1.vB}|${p2.vB}|${p1.d}|${p2.d}|${p1.t}|${p2.t}`;
            if (!precomputeIndex.hasTripletShapeKey(tripletShapeKey)) continue;

            const rec: TripletRecord = {
                vA: p1.vA, vB: p1.vB, vC: p2.vB,
                d_te_1: p1.d, d_te_2: p2.d,
                tAB: p1.t, tBC: p2.t,
                pairAB, pairBC, pairAC
            };
            allTripletRecords.push(rec);
        }
    }

    // Deferred scoring: store unscored chains during search, score after
    interface UnscoredChain {
        entries: StrettoChainOption[];
        variantIndices: number[];
    }
    const unscoredResults: UnscoredChain[] = [];
    const MAX_PARTIALS = 500; // Cap partial buffer to avoid OOM in difficult searches
    const seenPartialSigs = new Set<string>();

    const seenSignatures = new Set<string>();
    const emptyPrefixDissonanceState: PrefixDissonanceState = {
        macroRunCount: 0,
        macroRunEnd: Number.NEGATIVE_INFINITY,
        macroRunFirstStart: Number.NEGATIVE_INFINITY,
        violated: false
    };

    function estimateCandidateUpperBound(chain: StrettoChainOption[]): number {
        const depth = chain.length;
        const latestStart = Math.round(chain[depth - 1].startBeat * ppq);
        return (depth * 100000) - latestStart;
    }

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
        prefixDissonanceState: PrefixDissonanceState;
        prefixAdmissible: boolean;
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
        // Uses chain[i].length rather than variants[...].lengthTicks so auto-truncation
        // overrides (which shorten chain[i].length) are respected.
        function conflicts(i: number, j: number): boolean {
            const iStart = Math.round(chain[i].startBeat * ppq);
            const jStart = Math.round(chain[j].startBeat * ppq);
            if (iStart > jStart) return conflicts(j, i);
            const iEnd = iStart + chain[i].length;
            return jStart < iEnd - ppq;
        }

        function valid(pos: number, v: number): boolean {
            if (pos === 0) return v === options.subjectVoiceIndex;
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
                    const rec = precomputeIndex.getPairRecord(vIndices[eIdx], vIndices[lIdx], relDelay, relTrans);
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

    // Timeout-only fallback used for user-facing continuity when strict voice assignment
    // fails under hard runtime limits. This enforces non-overlap plus cheap adjacent-edge
    // admissibility from the dense voice/transposition index, and solves all positions
    // using bounded backtracking (no expensive overlap-specific pairwise rescans).
    function assignVoicesGreedyFallback(chain: StrettoChainOption[]): StrettoChainOption[] | null {
        const n = chain.length;
        const starts = new Array<number>(n);
        const ends = new Array<number>(n);
        const tIdx = new Array<number>(n).fill(-1);
        const voices = new Array<number>(n).fill(-1);

        for (let i = 0; i < n; i++) {
            starts[i] = Math.round(chain[i].startBeat * ppq);
            ends[i] = starts[i] + chain[i].length;
            const idx = absoluteTranspositionToIndex.get(chain[i].transposition);
            if (idx === undefined) return null;
            tIdx[i] = idx;
        }

        const conflicts = (i: number, j: number): boolean => {
            if (starts[i] > starts[j]) return conflicts(j, i);
            return starts[j] < ends[i] - ppq;
        };

        const valid = (pos: number, v: number): boolean => {
            if (pos === 0) return v === options.subjectVoiceIndex;
            if (!voiceTranspositionAdmissibilityIndex.has(pos, voices[pos - 1], v, tIdx[pos - 1], tIdx[pos])) {
                return false;
            }
            for (let k = 0; k < pos; k++) {
                if (voices[k] === v && conflicts(k, pos)) return false;
            }
            return true;
        };

        const backtrack = (pos: number): boolean => {
            if (pos === n) return true;
            for (let v = 0; v < options.ensembleTotal; v++) {
                if (!valid(pos, v)) continue;
                voices[pos] = v;
                if (backtrack(pos + 1)) return true;
                voices[pos] = -1;
            }
            return false;
        };

        if (!backtrack(0)) return null;
        return chain.map((entry, i) => ({ ...entry, voiceIndex: voices[i] }));
    }

    // Returns how many chain entries are still active (voice not yet freed) at `atTicks`.
    function countActiveVoices(chain: StrettoChainOption[], vIdxs: number[], atTicks: number): number {
        let count = 0;
        for (let k = 0; k < chain.length; k++) {
            const startK = Math.round(chain[k].startBeat * ppq);
            const endK   = startK + variants[vIdxs[k]].lengthTicks;
            if (startK < atTicks && endK - ppq > atTicks) count++;
        }
        return count;
    }

    // When useAutoTruncation is enabled, find entries where voice capacity is exceeded
    // and shorten the oldest still-active entry to the minimum length that frees a voice.
    // Returns the modified chain copies plus the total beats of auto-truncation applied.
    function resolveAutoTruncations(
        chain: StrettoChainOption[],
        vIdxs: number[]
    ): { chain: StrettoChainOption[]; autoTruncBeats: number } {
        let autoTruncBeats = 0;
        const outChain = [...chain];

        for (let i = options.ensembleTotal; i < outChain.length; i++) {
            const startI = Math.round(outChain[i].startBeat * ppq);
            const active = countActiveVoices(outChain, vIdxs, startI);
            if (active < options.ensembleTotal) continue;

            // Find the oldest active entry (earliest end time that still occupies a voice at startI)
            let oldestK = -1;
            let oldestEnd = Infinity;
            for (let k = 0; k < i; k++) {
                const startK = Math.round(outChain[k].startBeat * ppq);
                const endK   = startK + variants[vIdxs[k]].lengthTicks;
                if (startK < startI && endK - ppq > startI && endK < oldestEnd) {
                    oldestEnd = endK;
                    oldestK = k;
                }
            }
            if (oldestK === -1) continue;

            const startOldest  = Math.round(outChain[oldestK].startBeat * ppq);
            const neededLength = startI + ppq - startOldest;
            const fullLength   = subjectLengthTicks;
            if (neededLength <= 0 || neededLength >= fullLength) continue;

            const truncBeats = (fullLength - neededLength) / ppq;
            autoTruncBeats  += truncBeats;
            outChain[oldestK] = { ...outChain[oldestK], length: neededLength };
        }
        return { chain: outChain, autoTruncBeats };
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
        if (enablePrefixAdmissibilityGate && (!node.prefixAdmissible || node.prefixDissonanceState.violated)) {
            stageStats.prunedByPrefixAdmissibility++;
            return successors;
        }
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
            if (isCanonDelaySearch) {
                minD = normalizedCanonDelayMinTicks;
                maxD = normalizedCanonDelayMaxTicks;
            } else {
                minD = Math.floor(prevEntryLengthTicks * 0.5);
            }
        } else if (depth > 1) {
            const prevDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
            const prevSubjectLengthTicks = chain[depth - 1].length;
            if (isCanonDelaySearch) {
                minD = prevDelayTicks;
                maxD = prevDelayTicks;
            } else {
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
        }

        if (!isCanonDelaySearch && userMinDelayTicks > 0) minD = Math.max(minD, userMinDelayTicks);
        minD = Math.ceil(minD / delayStep) * delayStep;
        maxD = Math.floor(maxD / delayStep) * delayStep;
        for (let d = minD; d <= maxD; d += delayStep) possibleDelaysTicks.push(d);
        possibleDelaysTicks.sort((a, b) => a - b);

        // Deprioritise delays that would likely dead-end due to voice exhaustion:
        // when d_{i-1} was short (< Sb/N), delays where d_i + d_{i-1} < (N-2)*Sb/N
        // are moved to the back so preferred continuations are explored first.
        if (!isCanonDelaySearch && depth >= 2) {
            const prevDelayTicks = Math.round(chain[depth - 1].startBeat * ppq)
                - Math.round(chain[depth - 2].startBeat * ppq);
            const shortThreshold = subjectLengthTicks / options.ensembleTotal;
            if (prevDelayTicks < shortThreshold) {
                const sumFloor = (options.ensembleTotal - 2) * subjectLengthTicks / options.ensembleTotal;
                const preferred: number[] = [];
                const deprioritised: number[] = [];
                for (const d of possibleDelaysTicks) {
                    (d + prevDelayTicks >= sumFloor ? preferred : deprioritised).push(d);
                }
                possibleDelaysTicks.length = 0;
                possibleDelaysTicks.push(...preferred, ...deprioritised);
            }
        }

        let indexedTransitionsByDelay: TransitionBucketsByDelay | null = null;
        if (depth >= 2) {
            const windowDelayA = depth >= 3
                ? Math.round(chain[depth - 2].startBeat * ppq) - Math.round(chain[depth - 3].startBeat * ppq)
                : 0;
            const windowDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
            const windowTranspositionDelta = chain[depth - 1].transposition - chain[depth - 2].transposition;
            stageStats.transitionWindowLookups++;
            const windowMap = precomputeIndex.getWindowTransitions(
                variantIndices[depth - 2],
                variantIndices[depth - 1],
                windowDelayA,
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
            if (isCanonDelaySearch && !canonDelayTicks.has(delayTicks)) continue;
            // A.1 Global Uniqueness: delays > Sb/3 must be unique across the chain.
            // Under the strict rule gate (depth < 7), ALL delays are treated as long
            // so uniqueness is always required. This simplifies triplet precomputation.
            const delayIsLong = delayTicks > oneThirdSubjectTicks || !isFinalThird;
            if (!isCanonDelaySearch) {
                if (delayIsLong && usedLongDelays.has(delayTicks)) {
                    stageStats.globalLineageStageRejected++;
                    continue;
                }
            }

            if (depth >= 2) {
                const prevDelayTicks = Math.round(chain[depth - 1].startBeat * ppq) - Math.round(chain[depth - 2].startBeat * ppq);
                if (!isCanonDelaySearch && Math.abs(delayTicks - prevDelayTicks) < 1) {
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
                    const tPrevIdx = absoluteTranspositionToIndex.get(prevTransposition);
                    const tCurrIdx = absoluteTranspositionToIndex.get(t);
                    if (tPrevIdx === undefined || tCurrIdx === undefined) continue;
                    // Check if any ensemble voice pair admits this transition at this depth.
                    // Voice assignment is post-hoc so we accept if ANY (vPrev, vCurr) is FSM-valid.
                    let voiceAdmissible = false;
                    const nV = options.ensembleTotal;
                    outer1: for (let vp = 0; vp < nV; vp++) {
                        for (let vc = 0; vc < nV; vc++) {
                            if (voiceTranspositionAdmissibilityIndex.has(depth, vp, vc, tPrevIdx, tCurrIdx)) {
                                voiceAdmissible = true; break outer1;
                            }
                        }
                    }
                    if (!voiceAdmissible) continue;
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
                        // A.10: no truncated entries at delay >= 0.5*Sb (disabled in canon-delay mode)
                        if (!isCanonDelaySearch && delayTicks >= subjectLengthTicks / 2 && variants[varIdx].truncationBeats > 0) continue;
                        const immPrevVarIdx = variantIndices[depth - 1];
                        const immRelTrans = t - chain[depth - 1].transposition;
                        const immPair = precomputeIndex.getPairRecord(immPrevVarIdx, varIdx, delayTicks, immRelTrans);
                        if (!immPair) continue;
                        if (!immPair.meetsAdjacentTranspositionSeparation) continue;
                        const tPrevIdx = absoluteTranspositionToIndex.get(chain[depth - 1].transposition);
                        const tCurrIdx = absoluteTranspositionToIndex.get(t);
                        if (tPrevIdx === undefined || tCurrIdx === undefined) continue;
                        let voiceAdmissible2 = false;
                        const nV2 = options.ensembleTotal;
                        outer2: for (let vp = 0; vp < nV2; vp++) {
                            for (let vc = 0; vc < nV2; vc++) {
                                if (voiceTranspositionAdmissibilityIndex.has(depth, vp, vc, tPrevIdx, tCurrIdx)) {
                                    voiceAdmissible2 = true; break outer2;
                                }
                            }
                        }
                        if (!voiceAdmissible2) continue;
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
                dagEdgesEvaluated++;
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
                        const pairRecord = precomputeIndex.getPairRecord(prevVarIdx, varIdx, relDelay, relTrans);
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
                    const immediatePairStartTicks = Math.round(chain[chain.length - 1].startBeat * ppq);
                    const allRunSpans: SimultaneitySpan[] = rebaseRunSpansToAbsolute(
                        immPair.bassRoleDissonanceRunSpans.none,
                        immediatePairStartTicks
                    );
                    for (const { entry, pairRecord } of overlappingPairs) {
                        const pairStartTicks = Math.round(entry.startBeat * ppq);
                        for (const s of rebaseRunSpansToAbsolute(pairRecord.bassRoleDissonanceRunSpans.none, pairStartTicks)) allRunSpans.push(s);
                    }
                    const nextPrefixDissonanceState = extendPrefixDissonanceState(
                        node.prefixDissonanceState,
                        allRunSpans,
                        ppq,
                        offsetTicks,
                        tsNum,
                        tsDenom
                    );
                    if (enablePrefixAdmissibilityGate && nextPrefixDissonanceState.violated) {
                        stageStats.prunedByPrefixAdmissibility++;
                        continue;
                    }

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
                    const needsNewLongDelaySet = !isCanonDelaySearch && delayIsLong && !usedLongDelays.has(delayTicks);
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
                        longDelaySignature: newLongDelaySignature,
                        prefixDissonanceState: nextPrefixDissonanceState,
                        prefixAdmissible: true
                    });
                }
            }

        return successors;
    }
    // Deferred partial storage: raw chain data without voice assignment.
    // Voice assignment is deferred to post-search to avoid expensive CSP during traversal.
    interface DeferredPartial {
        chain: StrettoChainOption[];
        variantIndices: number[];
    }
    const deferredPartials: DeferredPartial[] = [];
    emitStageProgress('triplet', tripletTotalUnits, tripletTotalUnits, true);
    const tripletMs = Date.now() - t0Triplet;
    const t0Dag = Date.now();
    const dagTotalUnits = Math.max(1, options.targetChainLength);
    let dagCompletedUnits = 0;
    dagExploredWorkItems = 0;
    dagLiveFrontierWorkItems = 1; // Root node starts as the initial live work item.
    const queueDagWorkItems = (count: number): void => {
        if (count <= 0) return;
        dagLiveFrontierWorkItems += count;
    };
    const dagDepthHistogram: Map<number, number> = new Map();
    const startDagWorkItem = (depth: number): void => {
        dagExploredWorkItems++;
        dagLiveFrontierWorkItems = Math.max(0, dagLiveFrontierWorkItems - 1);
        dagDepthHistogram.set(depth, (dagDepthHistogram.get(depth) ?? 0) + 1);
    };
    const emitDagProgress = (force: boolean = false, terminal: boolean = false): void => {
        // Monotone heuristic completion: explored / (explored + live frontier).
        // The ratio is traversal-state based and does not rely on chain-depth upper bounds.
        const denom = Math.max(1, dagExploredWorkItems + dagLiveFrontierWorkItems);
        const heuristicRatio = dagExploredWorkItems / denom;
        dagHeuristicCompletionRatio = heuristicRatio;
        const boundedNonTerminalCeiling = Math.max(0, dagTotalUnits - 1);
        const nextCompletedUnits = terminal
            ? dagTotalUnits
            : Math.min(
                boundedNonTerminalCeiling,
                Math.max(dagCompletedUnits, Math.floor(heuristicRatio * dagTotalUnits))
            );
        dagCompletedUnits = nextCompletedUnits;
        emitStageProgress('dag', dagCompletedUnits, dagTotalUnits, force, terminal);
    };
    emitDagProgress(true);

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
        longDelaySignature: '',
        prefixDissonanceState: emptyPrefixDissonanceState,
        prefixAdmissible: true
    }];

    let maxFrontierSize = frontier.length;
    let maxFrontierClassCount = frontier.length;
    let frontierSizeAtTermination = 0;
    let frontierClassesAtTermination = 0;

    // --- Helper: check time/node limits and handle timeout extension ---
    function checkLimits(): boolean {
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs > activeTimeLimitMs) {
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
    function recordCompletedChain(chain: StrettoChainOption[], variantIndices: number[], prefixAdmissible: boolean): void {
        structurallyCompleteChainsFound++;
        fullChainsFound = structurallyCompleteChainsFound;
        if (!prefixAdmissible) return;
        prefixAdmissibleCompleteChainsFound++;
        const sig = getChainSignature(chain);
        if (!seenSignatures.has(sig)) {
            seenSignatures.add(sig);
            unscoredResults.push({ entries: [...chain], variantIndices: [...variantIndices] });
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
    async function dfsExtend(node: DagNode): Promise<void> {
        startDagWorkItem(node.chain.length);
        nodesVisited++;
        dagNodesExpanded++;
        operationCounter++;
        maxDepth = Math.max(maxDepth, node.chain.length);
        emitDagProgress();

        if (shouldYieldToEventLoop(operationCounter)) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }

        if (node.chain.length === options.targetChainLength) {
            recordCompletedChain(node.chain, node.variantIndices, node.prefixAdmissible);
            return;
        }

        if (node.chain.length >= 3) {
            recordDeferredPartial(node.chain, node.variantIndices);
        }

        if (checkLimits()) return;

        const successors = expandNode(node);
        queueDagWorkItems(successors.length);
        for (const successor of successors) {
            await dfsExtend(successor);
            if (terminationReason) return;
        }
    }

    // --- Triplet-Join Phase A (target >= 7) or BFS Phase A (target <= 6) ---
    // For long chains, the triplet-join builds 7-entry prefixes (e0 + e1–e6) by
    // seeding with valid triplets and extending one entry at a time via the
    // transition window index. This avoids re-deriving constraints already
    // established during triplet precomputation.

    if (!isCanonDelaySearch && options.targetChainLength >= 7 && allTripletRecords.length > 0) {
        // --- Triplet-Join Phase A: build 7-entry prefixes (e0–e6) ---
        const e0Entry: StrettoChainOption = {
            startBeat: 0, transposition: 0, type: 'N',
            length: variants[0].lengthTicks, voiceIndex: options.subjectVoiceIndex
        };
        const e0VarIdx = 0;
        const halfSubjectTicks = subjectLengthTicks / 2;

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
            prefixDissonanceState: PrefixDissonanceState;
            prefixAdmissible: boolean;
        }

        // Extend a triplet-join state by one entry (adding eK at depth K).
        // Returns valid successor states or empty array.
        function tripletJoinExtend(state: TripletJoinState): TripletJoinState[] {
            const depth = state.chain.length; // current chain length = next entry index
            if (depth < 3) return []; // need at least e0,e1,e2 before extending
            if (enablePrefixAdmissibilityGate && (!state.prefixAdmissible || state.prefixDissonanceState.violated)) {
                stageStats.prunedByPrefixAdmissibility++;
                return [];
            }

            // Look up transition window for the last two entries
            const prevPrevVarIdx = state.variantIndices[depth - 2];
            const prevVarIdx = state.variantIndices[depth - 1];
            const prevPrevDelay = depth >= 3 ? state.delays[state.delays.length - 2] : 0;
            const prevDelay = state.delays[state.delays.length - 1];
            const prevTransDelta = state.transpositions[depth - 1] - state.transpositions[depth - 2];
            const windowMap = precomputeIndex.getWindowTransitions(prevPrevVarIdx, prevVarIdx, prevPrevDelay, prevDelay, prevTransDelta);
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
                    const immediatePairStartTicks = Math.round(state.chain[depth - 1].startBeat * ppq);
                    const allRunSpans: SimultaneitySpan[] = rebaseRunSpansToAbsolute(
                        immPair.bassRoleDissonanceRunSpans.none,
                        immediatePairStartTicks
                    );

                    for (let k = depth - 3; k >= 0; k--) {
                        const kEntry = state.chain[k];
                        const kStart = Math.round(kEntry.startBeat * ppq);
                        if (kStart + subjectLengthTicks <= absStartTicks) break;
                        const kVarIdx = state.variantIndices[k];
                        const kEnd = kStart + variants[kVarIdx].lengthTicks;
                        if (absStartTicks >= kEnd) continue;

                        const relDelay = absStartTicks - kStart;
                        const relTrans = t - kEntry.transposition;
                        const pr = precomputeIndex.getPairRecord(kVarIdx, varIdx, relDelay, relTrans);
                        if (!pr) { harmonicFail = true; break; }
                        for (const s of rebaseRunSpansToAbsolute(pr.bassRoleDissonanceRunSpans.none, kStart)) allRunSpans.push(s);
                    }
                    if (harmonicFail) continue;

                    // Combined dissonance-run gate on immediate + long-range pairs
                    const nextPrefixDissonanceState = extendPrefixDissonanceState(
                        state.prefixDissonanceState,
                        allRunSpans,
                        ppq,
                        offsetTicks,
                        tsNum,
                        tsDenom
                    );
                    if (enablePrefixAdmissibilityGate && nextPrefixDissonanceState.violated) {
                        stageStats.prunedByPrefixAdmissibility++;
                        continue;
                    }

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
                        usedLongDelays: newUsedLongDelays,
                        prefixDissonanceState: nextPrefixDissonanceState,
                        prefixAdmissible: true
                    });
                }
            }
            return results;
        }

        // --- Seed: iterate firstDelay × e1 transposition × window transitions ---
        // tAB/tBC in TripletRecord are RELATIVE transposition deltas, so we enumerate
        // absolute tE1 first, then derive tE2 = tE1 + tAB, tE3 = tE2 + tBC.
        const minFirstDelay = Math.max(
            Math.ceil(halfSubjectTicks / delayStep) * delayStep,
            userMinDelayTicks
        );
        const maxFirstDelay = Math.floor(subjectLengthTicks * (2 / 3) / delayStep) * delayStep;
        const tripletsByVA = new Map<number, typeof allTripletRecords>();
        for (const tripletRecord of allTripletRecords) {
            if (!tripletsByVA.has(tripletRecord.vA)) {
                tripletsByVA.set(tripletRecord.vA, []);
            }
            tripletsByVA.get(tripletRecord.vA)!.push(tripletRecord);
        }

        for (let firstDelay = minFirstDelay; firstDelay <= maxFirstDelay; firstDelay += delayStep) {
            if (terminationReason) break;

            // Iterate over valid e0→e1 pairs at this delay from the pairwise table
            for (let vA = 0; vA < variants.length; vA++) {
                if (terminationReason) break;
                // A.9: e1 must not be inverted
                if (variants[vA].type === 'I') continue;
                // A.10: no truncated entries at delay >= 0.5*Sb (firstDelay is always >= 0.5*Sb)
                if (variants[vA].truncationBeats > 0) continue;
                const e0e1Pairs: Array<{ tE1: number; e0e1Pair: PairwiseCompatibilityRecord }> = [];
                precomputeIndex.forEachPairTransposition(e0VarIdx, vA, firstDelay, (tE1, e0e1Pair) => {
                    e0e1Pairs.push({ tE1, e0e1Pair });
                });
                if (e0e1Pairs.length === 0) continue;

                for (const { tE1, e0e1Pair } of e0e1Pairs) {
                    if (terminationReason) break;

                    // A.7 Adjacent transposition separation: |t_e0 - t_e1| >= 5
                    if (Math.abs(tE1) < 5) continue;
                    if (!allowedTranspositions.has(tE1)) continue;
                    if ((allowedVoicesForTrans.get(tE1)?.length ?? 0) === 0) continue;
                    if (!e0e1Pair.meetsAdjacentTranspositionSeparation) continue;
                    const firstWindowTransitions = precomputeIndex.getWindowTransitions(e0VarIdx, vA, 0, firstDelay, tE1);
                    if (!firstWindowTransitions || firstWindowTransitions.size === 0) continue;

                    const tripletsForVA = tripletsByVA.get(vA) ?? [];
                    if (tripletsForVA.length === 0) continue;
                    for (const [delayAB, abTransitions] of firstWindowTransitions) {
                        for (const transitionAB of abTransitions) {
                            operationCounter++;
                            if (shouldYieldToEventLoop(operationCounter)) {
                                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                            }
                            if (checkLimits()) break;

                            const vB = transitionAB.nextVariantIndex;
                            const tAB = transitionAB.transpositionDelta;
                            const pairAB = transitionAB.pairRecord!;
                            const tE2 = tE1 + tAB;
                            if (!allowedTranspositions.has(tE2)) continue;
                            if ((allowedVoicesForTrans.get(tE2)?.length ?? 0) === 0) continue;

                            const secondWindowMap = precomputeIndex.getWindowTransitions(vA, vB, firstDelay, delayAB, tAB);
                            if (!secondWindowMap || secondWindowMap.size === 0) continue;

                            const varA = variants[vA];
                            const varB = variants[vB];
                            if (tE1 === 0) continue;
                            const e1Start_pre = firstDelay;
                            const e2Start_pre = firstDelay + delayAB;
                            if (tE2 === 0 && e2Start_pre < subjectLengthTicks) continue;
                            if (tE2 === tE1 && e2Start_pre < e1Start_pre + varA.lengthTicks) continue;

                            for (const [delayBC, bcTransitions] of secondWindowMap) {
                                for (const transitionBC of bcTransitions) {
                                    operationCounter++;
                                    if (shouldYieldToEventLoop(operationCounter)) {
                                        await new Promise<void>((resolve) => setTimeout(resolve, 0));
                                    }
                                    if (checkLimits()) break;

                                    if (firstDelay === delayBC) continue;

                                    const vC = transitionBC.nextVariantIndex;
                                    const tBC = transitionBC.transpositionDelta;
                                    const pairBC = transitionBC.pairRecord!;
                                    const tE3 = tE2 + tBC;
                                    if (!allowedTranspositions.has(tE3)) continue;
                                    if ((allowedVoicesForTrans.get(tE3)?.length ?? 0) === 0) continue;

                                    const varC = variants[vC];
                                    const e3Start_pre = e2Start_pre + delayBC;
                                    if (tE3 === 0 && e3Start_pre < subjectLengthTicks) continue;
                                    if (tE3 === tE1 && e3Start_pre < e1Start_pre + varA.lengthTicks) continue;
                                    if (tE3 === tE2 && e3Start_pre < e2Start_pre + varB.lengthTicks) continue;

                                    let nInv = 0, nTrunc = 0, nRestricted = 0, nFree = 1;
                                    if (varA.type === 'I') nInv++;
                                    if (varA.truncationBeats > 0) nTrunc++;
                                    if (varB.type === 'I') nInv++;
                                    if (varB.truncationBeats > 0) nTrunc++;
                                    if (varC.type === 'I') nInv++;
                                    if (varC.truncationBeats > 0) nTrunc++;

                                    if (e0e1Pair.isRestrictedInterval) nRestricted++;
                                    if (e0e1Pair.isFreeInterval) nFree++;
                                    if (pairAB.isRestrictedInterval) nRestricted++;
                                    if (pairAB.isFreeInterval) nFree++;
                                    if (pairBC.isRestrictedInterval) nRestricted++;
                                    if (pairBC.isFreeInterval) nFree++;

                                    if (nInv > 0 && !checkQuota(options.inversionMode, nInv - 1)) continue;
                                    if (nTrunc > 0 && !checkQuota(options.truncationMode, nTrunc - 1)) continue;
                                    if (nRestricted > 0 && !checkQuota(options.thirdSixthMode, nRestricted - 1)) continue;
                                    if (nRestricted > 1 && nRestricted >= nFree) continue;

                                    const cumDelay_e0e2 = firstDelay + delayAB;
                                    let e0e2Pair: PairwiseCompatibilityRecord | undefined;
                                    if (cumDelay_e0e2 < subjectLengthTicks) {
                                        e0e2Pair = precomputeIndex.getPairRecord(e0VarIdx, vB, cumDelay_e0e2, tE2);
                                        if (!e0e2Pair) continue;
                                    }
                                    const cumDelay_e0e3 = cumDelay_e0e2 + delayBC;
                                    let e0e3Pair: PairwiseCompatibilityRecord | undefined;
                                    if (cumDelay_e0e3 < subjectLengthTicks) {
                                        e0e3Pair = precomputeIndex.getPairRecord(e0VarIdx, vC, cumDelay_e0e3, tE3);
                                        if (!e0e3Pair) continue;
                                    }

                                    const dAC = delayAB + delayBC;
                                    const tAC = tAB + tBC;
                                    const pairAC = dAC < varA.lengthTicks ? precomputeIndex.getPairRecord(vA, vC, dAC, tAC) ?? null : null;

                                    const e0Start = 0;
                                    const e1Start = firstDelay;
                                    const e2Start = firstDelay + delayAB;
                                    const e3Start = e2Start + delayBC;

                                    const seedSpans: SimultaneitySpan[] = [
                                        ...rebaseRunSpansToAbsolute(e0e1Pair.bassRoleDissonanceRunSpans.none, e0Start),
                                        ...rebaseRunSpansToAbsolute(pairAB.bassRoleDissonanceRunSpans.none, e1Start),
                                        ...rebaseRunSpansToAbsolute(pairBC.bassRoleDissonanceRunSpans.none, e2Start)
                                    ];
                                    if (pairAC) {
                                        for (const s of rebaseRunSpansToAbsolute(pairAC.bassRoleDissonanceRunSpans.none, e1Start)) seedSpans.push(s);
                                    }
                                    if (e0e2Pair) {
                                        for (const s of rebaseRunSpansToAbsolute(e0e2Pair.bassRoleDissonanceRunSpans.none, e0Start)) seedSpans.push(s);
                                    }
                                    if (e0e3Pair) {
                                        for (const s of rebaseRunSpansToAbsolute(e0e3Pair.bassRoleDissonanceRunSpans.none, e0Start)) seedSpans.push(s);
                                    }
                                    const seedPrefixDissonanceState = extendPrefixDissonanceState(
                                        emptyPrefixDissonanceState,
                                        seedSpans,
                                        ppq,
                                        offsetTicks,
                                        tsNum,
                                        tsDenom
                                    );
                                    if (enablePrefixAdmissibilityGate && seedPrefixDissonanceState.violated) {
                                        stageStats.prunedByPrefixAdmissibility++;
                                        continue;
                                    }

                                    const seedChain: StrettoChainOption[] = [
                                        e0Entry,
                                        { startBeat: e1Start / ppq, transposition: tE1, type: varA.type, length: varA.lengthTicks, voiceIndex: 0 },
                                        { startBeat: e2Start / ppq, transposition: tE2, type: varB.type, length: varB.lengthTicks, voiceIndex: 0 },
                                        { startBeat: e3Start / ppq, transposition: tE3, type: varC.type, length: varC.lengthTicks, voiceIndex: 0 }
                                    ];

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
                                        usedLongDelays: usedDelays,
                                        prefixDissonanceState: seedPrefixDissonanceState,
                                        prefixAdmissible: true
                                    };

                                    recordDeferredPartial(seedState.chain, seedState.variantIndices);

                                    // Breadth-oriented scheduling avoids fully exhausting one start
                                    // pattern before exploring siblings, improving search diversity.
                                    const extensionQueue: TripletJoinState[] = [seedState];
                                    queueDagWorkItems(1);
                                    let queueIndex = 0;
                                    while (queueIndex < extensionQueue.length) {
                                        if (terminationReason) break;
                                        const current = extensionQueue[queueIndex++];
                                        startDagWorkItem(current.chain.length);
                                        operationCounter++;
                                        if (shouldYieldToEventLoop(operationCounter)) {
                                            await new Promise<void>((resolve) => setTimeout(resolve, 0));
                                        }
                                        if (checkLimits()) break;
                                        const currentDepth = current.chain.length;

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
                                                longDelaySignature: longDelaySig,
                                                prefixDissonanceState: current.prefixDissonanceState,
                                                prefixAdmissible: current.prefixAdmissible
                                            };

                                            if (currentDepth === options.targetChainLength) {
                                                recordCompletedChain(dagNode.chain, dagNode.variantIndices, dagNode.prefixAdmissible);
                                            } else {
                                                recordDeferredPartial(dagNode.chain, dagNode.variantIndices);
                                                queueDagWorkItems(1);
                                                await dfsExtend(dagNode);
                                            }
                                            maxDepth = Math.max(maxDepth, currentDepth);
                                            emitDagProgress();
                                            continue;
                                        }

                                        const successors = tripletJoinExtend(current);
                                        for (const succ of successors) {
                                            nodesVisited++;
                                            dagNodesExpanded++;
                                            maxDepth = Math.max(maxDepth, succ.chain.length);
                                            emitDagProgress();
                                            if (succ.chain.length === options.targetChainLength) {
                                                // Record full-depth chains immediately on generation so a
                                                // subsequent timeout check cannot drop a completed candidate
                                                // that has already satisfied all structural constraints.
                                                recordCompletedChain(succ.chain, succ.variantIndices, succ.prefixAdmissible);
                                                continue;
                                            }
                                            if (succ.chain.length >= 3) {
                                                recordDeferredPartial(succ.chain, succ.variantIndices);
                                            }
                                            extensionQueue.push(succ);
                                            queueDagWorkItems(1);
                                        }
                                    }
                                }
                            }
                        }
                    }
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
            maxFrontierClassCount = Math.max(maxFrontierClassCount, frontier.length);
            const nextLayer = new Map<string, DagNode>();
            let stopTraversal = false;

            for (const node of frontier) {
                startDagWorkItem(node.chain.length);
                nodesVisited++;
                dagNodesExpanded++;
                operationCounter++;
                maxDepth = Math.max(maxDepth, node.chain.length);
                emitDagProgress();

                if (shouldYieldToEventLoop(operationCounter)) {
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                }

                // If target reached during Phase A (target <= PHASE_A_DEPTH)
                if (node.chain.length === options.targetChainLength) {
                    recordCompletedChain(node.chain, node.variantIndices, node.prefixAdmissible);
                    continue;
                }

                if (checkLimits()) {
                    stopTraversal = true;
                    break;
                }

                // At Phase A boundary: switch to DFS for remaining depth
                if (node.chain.length >= PHASE_A_DEPTH) {
                    if (node.chain.length >= 3) {
                        recordDeferredPartial(node.chain, node.variantIndices);
                    }
                    // Launch DFS from this node
                    const successors = expandNode(node);
                    queueDagWorkItems(successors.length);
                    for (const successor of successors) {
                        await dfsExtend(successor);
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
                    queueDagWorkItems(1);
                }
            }

            frontier = resolveNextFrontierLayer(nextLayer, stopTraversal);

            // Record frontier state at termination (last iteration before loop exits).
            if (frontier.length === 0 || stopTraversal) {
                const termFrontier = stopTraversal ? Array.from(nextLayer.values()) : [];
                frontierSizeAtTermination = termFrontier.length;
                maxFrontierClassCount = Math.max(maxFrontierClassCount, termFrontier.length);
                frontierClassesAtTermination = termFrontier.length;
            }
        }
    }

    // --- POST-SEARCH: Reserved finalization stage ---
    let stopReason: StrettoSearchReport['stats']['stopReason'] = terminationReason || (unscoredResults.length > 0 ? 'Success' : 'Exhausted');
    if (unscoredResults.length === 0 && deferredPartials.length > 0) {
        for (const dp of deferredPartials) {
            unscoredResults.push({ entries: dp.chain, variantIndices: dp.variantIndices });
        }
        if (!terminationReason) stopReason = 'Exhausted';
    }

    const sourceUnscored: UnscoredChain[] = unscoredResults;
    sourceUnscored.sort((a, b) => estimateCandidateUpperBound(b.entries) - estimateCandidateUpperBound(a.entries));

    const scoredResults: StrettoChainResult[] = [];
    const timeoutFallbackResults: StrettoChainResult[] = [];
    const finalizationDeadlineMs = terminationReason === 'Timeout'
        ? activeTimeLimitMs + FINALIZATION_TIMEOUT_GRACE_MS
        : activeTimeLimitMs;
    let timeoutFinalizationCandidatesRemaining = terminationReason === 'Timeout'
        ? MIN_TIMEOUT_FINALIZATION_CANDIDATES
        : 0;
    for (const uc of sourceUnscored) {
        const elapsedMs = Date.now() - startTime;
        const timeoutGraceExhausted = elapsedMs >= finalizationDeadlineMs;
        if (timeoutGraceExhausted && timeoutFinalizationCandidatesRemaining <= 0) break;
        if (timeoutFinalizationCandidatesRemaining > 0) timeoutFinalizationCandidatesRemaining--;
        // Auto-truncation: when enabled, attempt to resolve voice-capacity conflicts by
        // shortening the oldest still-active entry before re-trying voice assignment.
        let workEntries = [...uc.entries];
        let autoTruncBeats = 0;
        if (options.useAutoTruncation) {
            const resolved = resolveAutoTruncations(workEntries, uc.variantIndices);
            if (resolved.autoTruncBeats > 0) {
                workEntries = resolved.chain;
                autoTruncBeats = resolved.autoTruncBeats;
            }
        }

        const assigned = assignVoices(workEntries, [...uc.variantIndices]);
        if (assigned === null) {
            finalizationRejectedVoiceAssignment++;
            if (terminationReason === 'Timeout' && timeoutFallbackResults.length < MAX_RESULTS) {
                const provisional = assignVoicesGreedyFallback([...uc.entries]);
                if (provisional) {
                    const scoredFallback = calculateStrettoScore(provisional, variants, uc.variantIndices, options, ppq);
                    timeoutFallbackResults.push({
                        ...scoredFallback,
                        warnings: [...scoredFallback.warnings, 'Timeout fallback: provisional voice assignment used.']
                    });
                }
            }
            continue;
        }
        finalizationScoredCount++;
        const scored = calculateStrettoScore(assigned, variants, uc.variantIndices, options, ppq, autoTruncBeats);
        if (scored.isValid) {
            scoredResults.push(scored);
        } else {
            finalizationRejectedScoringInvalid++;
            const runEvents = scored.maxDissonanceRunEvents ?? 0;
            const histKey = String(runEvents);
            maxDissonanceRunEventsHistogram[histKey] = (maxDissonanceRunEventsHistogram[histKey] ?? 0) + 1;
            if (terminationReason === 'Timeout' && timeoutFallbackResults.length < MAX_RESULTS) {
                timeoutFallbackResults.push({
                    ...scored,
                    warnings: [...scored.warnings, 'Timeout fallback: chain shown despite scoring invalid under strict constraints.']
                });
            }
        }
    }
    fullChainsFound = structurallyCompleteChainsFound;

    const finalizedResults: StrettoChainResult[] = scoredResults.length > 0
        ? scoredResults
        : (terminationReason === 'Timeout' ? timeoutFallbackResults : scoredResults);

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
    for (const res of finalizedResults) {
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

    emitDagProgress(true, true);
    const totalKnownWorkItems = dagExploredWorkItems + dagLiveFrontierWorkItems;
    const completionLowerBound = totalKnownWorkItems > 0
        ? (dagExploredWorkItems / totalKnownWorkItems)
        : null;
    const completionLowerBoundAssumptions = {
        monotoneQueuedWorkItems: true
    };
    const completionLowerBoundIsHeuristic = true;
    const depthHistogram = Array.from(dagDepthHistogram.entries())
        .sort(([depthA], [depthB]) => depthA - depthB)
        .reduce<Record<string, number>>((acc, [depth, count]) => {
            acc[String(depth)] = count;
            return acc;
        }, {});
    const completionRatioLowerBound = completionLowerBound == null ? null : Math.round(completionLowerBound * 100);

    return {
        results: finalResults.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS),
        stats: {
            nodesVisited,
            edgesTraversed,
            timeMs: Date.now() - startTime,
            stageTiming: {
                admissibilityMs,
                pairwiseMs,
                tripletMs,
                dagMs: Date.now() - t0Dag,
            },
            stopReason: stopReason,
            maxDepthReached: maxDepth,
            metricOffsetTicks: offsetTicks,
            timeoutExtensionAppliedMs,
            finalizationScoredCount,
            tripletEnumerationTruncated,
            tripletBudgetMs,
            completionDiagnostics: {
                structurallyCompleteChainsFound,
                prefixAdmissibleCompleteChainsFound,
                scoringValidChainsFound: scoredResults.length,
                finalizationRejectedVoiceAssignment,
                finalizationRejectedScoringInvalid,
                maxDissonanceRunEventsHistogram: Object.keys(maxDissonanceRunEventsHistogram).length > 0
                    ? maxDissonanceRunEventsHistogram
                    : undefined
            },
            coverage: {
                nodeBudgetUsedPercent: null, // No node budget — time-only gating
                exploredWorkItems: dagExploredWorkItems,
                liveFrontierWorkItems: dagLiveFrontierWorkItems,
                maxFrontierSize,
                maxFrontierClassCount,
                depthHistogram,
                completionLowerBound,
                completionLowerBoundIsHeuristic,
                completionLowerBoundAssumptions,
                edgesTraversed,
                frontierSizeAtTermination,
                frontierClassesAtTermination,
                completionRatioLowerBound
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
