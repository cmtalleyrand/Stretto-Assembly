

export interface TrackInfo {
  id: number;
  name: string;
  instrument: {
    name: string;
    number: number;
    family: string;
  };
  noteCount: number;
  ornamentCount?: number;
}

export enum AppState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  ERROR = 'ERROR',
  GENERATING = 'GENERATING', 
  SUCCESS = 'SUCCESS',
}

export type MidiEventType = 'pitchBend' | 'controlChange' | 'programChange';

export interface MidiEventCounts {
  pitchBend: number;
  controlChange: number;
  programChange: number;
}

export type TempoChangeMode = 'speed' | 'time';

export type InversionMode = 'off' | 'global' | '1beat' | '2beats' | 'measure' | '2measures' | '4measures' | '8measures';

export type OutputStrategy = 'combine' | 'separate_tracks' | 'separate_voices';

export type VoiceAssignmentMode = 'auto' | 'manual'; 

export type RhythmFamily = 'Simple' | 'Triple' | 'Quintuplet';

export type HarmonicAnalysisMode = 'attack' | 'sustain' | 'hybrid' | 'arpeggio_window' | 'hia_v2';

export type PitchAnalysisMode = 'modal' | 'frequency';

export type HybridVoiceRole = 'sustain' | 'attack' | 'arpeggio' | 'ignore';

export type ArpeggioStrategy = 'note_based' | 'time_based';

export interface RhythmRule {
    enabled: boolean;
    family: RhythmFamily;
    minNoteValue: string; 
}

export interface AnalysisSection {
    id: string;
    name: string;
    startMeasure: number;
    endMeasure: number;
    harmonyMode: HarmonicAnalysisMode;
    pitchStatsMode: PitchAnalysisMode;
    
    // Granular Harmony Settings
    chordTolerance: string; 
    chordMinDuration: string; 
    arpeggioWindowVal: string; // Replaces bucketSizeBeats
    ignorePassingMotion: boolean; 
    
    // Hybrid Specifics
    hybridConfig: {
        voiceRoles: Record<number, HybridVoiceRole>;
        arpStrategy: ArpeggioStrategy;
        arpHistoryCount: number; 
        arpHistoryTime: string; 
    };

    // Reporting
    debugLogging?: boolean;
}

export interface ModalConversionOptions {
    enabled: boolean;
    root: number; 
    modeName: string; 
    mappings: Record<number, number>; 
}

export interface ConversionOptions {
    tempo: number;
    timeSignature: {
        numerator: number;
        denominator: number;
    };
    tempoChangeMode: TempoChangeMode;
    originalTempo: number;
    transposition: number;
    noteTimeScale: number;
    inversionMode: InversionMode;
    
    // Rhythm Processing Options
    primaryRhythm: RhythmRule;
    secondaryRhythm: RhythmRule;
    
    quantizationValue: string; 
    
    quantizeDurationMin: string; 
    shiftToMeasure: boolean;
    detectOrnaments: boolean; 
    modalConversion: ModalConversionOptions;
    removeShortNotesThreshold: number; 
    pruneOverlaps: boolean; 
    pruneThresholdIndex: number;
    // Voice Separation Logic
    voiceSeparationOverlapTolerance: number; 
    voiceSeparationPitchBias: number; 
    voiceSeparationMaxVoices: number; 
    voiceSeparationDisableChords: boolean; 
    voiceAssignmentMode: VoiceAssignmentMode; 
    
    // Export Options
    outputStrategy: OutputStrategy;
    
    // Global Voice Naming
    voiceNames: Record<number, string>;

    // Analysis Options
    sections: AnalysisSection[];
}

export interface NoteRole {
    name: string;
    midi: number;
    role: 'Root' | '3rd' | '5th' | 'Ext' | 'NCT';
}

export interface HarmonicRegion {
    startTick: number;
    endTick: number;
    type: 'consonant_stable' | 'dissonant_primary' | 'dissonant_secondary' | 'dissonant_tertiary' | 'dissonant_severe';
    errorType?: 'parallel' | 'direct' | null;
    intervalLabel: string;
    description?: string;
    detailedInfo?: {
        chordName: string;
        root?: string;
        quality?: string;
        allNotes: string[];
        noteDetails: NoteRole[];
        chordTones: string[];
        ncts: string[];
    };
}

export interface PianoRollTrackData {
    notes: {
        midi: number;
        ticks: number;
        durationTicks: number;
        velocity: number;
        name: string;
        voiceIndex?: number;
        isOrnament?: boolean;
    }[]; 
    name: string;
    ppq: number;
    timeSignature: {
        numerator: number;
        denominator: number;
    };
    harmonicRegions?: HarmonicRegion[];
}

export interface NoteValueStat {
    name: string;
    count: number;
    percentage: number;
    standardMultiplier: number; 
}

export interface ChordMatch {
    name: string;
    root: string;
    quality: string;
    bass?: string;
    inversion?: string;
    score: number;
    missingNotes: string[];
}

export interface ChordEvent {
    timestamp: number; 
    measure: number;   
    formattedTime: string; 
    name: string;      
    root: string;
    quality: string;
    bass?: string;     
    inversion?: string; 
    ticks: number;     
    constituentNotes: string[]; 
    missingNotes: string[]; 
    alternatives: ChordMatch[];
    debugInfo?: string; 
}

export interface RawNote {
    midi: number;
    ticks: number;
    durationTicks: number;
    velocity: number;
    name: string;
    time?: number;
    duration?: number;
    voiceIndex?: number;
    isOrnament?: boolean;
}

export interface TransformationStats {
    notesQuantized: number;
    notesDurationChanged: number;
    notesExtended: number;
    notesShortened: number;
    avgShiftTicks: number;
    notesRemovedDuration: number;
    notesRemovedOverlap: number;
    notesTruncatedOverlap: number;
    totalNotesInput: number;
    totalNotesOutput: number;
    inputGridAlignment: number;
    outputGridAlignment: number;
}

export interface PitchStats {
    count: number;
    durationTicks: number;
}

export interface TrackAnalysisData {
    trackName: string;
    topNoteValues: NoteValueStat[];
    outputNoteValues?: NoteValueStat[]; 
    
    voiceRhythmStats?: Record<number, NoteValueStat[]>;

    gridAlignmentScore: number; 
    durationConsistencyScore: number; 
    averageOffsetTicks: number;
    totalNotes: number;
    detectedGridType: string; 
    pitchClassHistogram: Record<number, number>; 
    chordsSustain: ChordEvent[]; 
    chordsAttack: ChordEvent[];  
    chordsHybrid?: ChordEvent[]; 
    chordsArpeggioWindow?: ChordEvent[];
    chordsBucketed?: ChordEvent[]; 
    bestKeyPrediction?: { root: number, mode: string, score: number };
    
    pitchStatsGlobal?: Record<number, PitchStats>;
    pitchStatsByVoice?: Record<number, Record<number, PitchStats>>;

    voiceIntervals: Record<number, number>; 
    voiceIntervalsByVoice?: Record<number, Record<number, number>>;

    transformationStats?: TransformationStats;

    notesRaw: RawNote[]; 
    ppq: number;
    timeSignature: { numerator: number, denominator: number };
    tempo: number;
    
    voiceCount: number;
}

// --- Stretto Specific Types ---

export type StrettoGrade = 'STRONG' | 'VIABLE' | 'INVALID';

export type StrettoListSortKey = 'grade' | 'delay' | 'interval' | 'dissonance' | 'nct' | 'intensity' | 'entry' | 'errors';

export interface StrettoListFilterContext {
    selectedPitches: string[];
    selectedIntervals: string[];
    selectedDelays: string[];
    maxDissonance: number;
    onlyResolved: boolean;
    visibleCount: number;
    totalCount: number;
    sortKey: StrettoListSortKey;
    sortDir: 'asc' | 'desc';
}

export interface StrettoError {
    tick: number;
    timeFormatted: string;
    type: 'Parallel 5th' | 'Parallel 8ve' | 'Direct 5th' | 'Direct 8ve' | 'Consecutive Dissonance' | 'Unresolved Dissonance';
    details: string;
    severity: 'fatal' | 'warning';
}

export interface StrettoCandidate {
    id: string;
    intervalSemis: number;
    intervalLabel: string;
    delayBeats: number;
    delayTicks: number;
    /** Triplet only: absolute offset of e2 from e0 in beats (= d_te_1 + d_te_2) */
    delayBeats2?: number;
    grade: StrettoGrade;
    errors: StrettoError[];
    notes: RawNote[]; // The combined notes of Subject + Answer
    regions?: HarmonicRegion[]; // Visualization data
    detectedChords?: string[]; // List of chord names found in this texture
    dissonanceRatio: number; // Ratio of dissonant time to overlapping time
    nctRatio?: number;
    pairDissonanceScore: number; // Duration weighted count of all dissonant pairs
    endsOnDissonance: boolean;
}

export interface StrettoConfig {
    intervals: {
        unison: boolean;
        octave: boolean; // +/- 1 & 2
        fifth: boolean; // +/- P5
        fourth: boolean; // +/- P4
    };
    maxDistanceBeats: number; // calculated limit
}

export interface StrettoChainOption {
    startBeat: number; // Relative to start of piece (or previous entry if chained logic, but logic usually normalized to 0)
    transposition: number;
    type: 'N' | 'I'; // Normal or Inverted
    length: number; // Full or Truncated length in ticks
    voiceIndex: number;
}

/**
 * Canonical representation for chain entries, where delay is measured from the
 * immediately previous entry (`d_i`), not from the origin entry `e0`.
 * `delayBeatsFromPreviousEntry` is a first-class stored value in canonical form.
 *
 * Invariants:
 * - For `e0`: `delayBeatsFromPreviousEntry = 0` (sentinel, not a real delay —
 *   rule evaluators must skip index 0 when applying delay-based constraints
 *   such as A.2–A.6), `transpositionSemitones = 0`, `isInverted = false`,
 *   and `isTruncated = false`.
 * - For every entry index `i > 0`: `delayBeatsFromPreviousEntry >= 0`.
 * - Monotone nondecreasing chain timing: defining
 *   `t_i = Σ_{k=0..i} chain[k].delayBeatsFromPreviousEntry`, then
 *   `t_i >= t_{i-1}` for every `i > 0`.
 */
export interface CanonicalStrettoChainEntry {
    delayBeatsFromPreviousEntry: number;
    transpositionSemitones: number;
    voiceIndex: number;
    isInverted: boolean;
    isTruncated: boolean;
}

export interface LegacyChainOptionConversionContext {
    /**
     * Absolute start beat of the previous chain entry in legacy coordinates.
     * Defaults to 0, which is the correct predecessor for `e0`.
     */
    previousStartBeatFromE0?: number;

    /**
     * If provided, truncation is inferred via `legacy.length < fullLengthTicks`.
     * If omitted, truncation defaults to `false`.
     */
    fullLengthTicks?: number;
}

export interface CanonicalChainEntryConversionContext {
    /**
     * Absolute start beat of the previous chain entry in legacy coordinates.
     * Defaults to 0, which is the correct predecessor for `e0`.
     */
    previousStartBeatFromE0?: number;

    /**
     * Explicit legacy length in ticks for this entry.
     */
    lengthTicks?: number;

    /**
     * Full (non-truncated) legacy length in ticks.
     * Used when `lengthTicks` is omitted and `isTruncated` is `false`.
     */
    fullLengthTicks?: number;

    /**
     * Truncated legacy length in ticks.
     * Used when `lengthTicks` is omitted and `isTruncated` is `true`.
     */
    truncatedLengthTicks?: number;
}

function resolveLegacyLengthTicks(
    canonical: CanonicalStrettoChainEntry,
    context: CanonicalChainEntryConversionContext
): number {
    if (typeof context.lengthTicks === 'number') return context.lengthTicks;
    if (canonical.isTruncated) {
        if (typeof context.truncatedLengthTicks === 'number') return context.truncatedLengthTicks;
        throw new Error('Missing length context: truncated canonical entries require truncatedLengthTicks or explicit lengthTicks.');
    }

    if (typeof context.fullLengthTicks === 'number') return context.fullLengthTicks;
    throw new Error('Missing length context: non-truncated canonical entries require fullLengthTicks or explicit lengthTicks.');
}

export function fromLegacyChainOption(
    legacy: StrettoChainOption,
    context: LegacyChainOptionConversionContext = {}
): CanonicalStrettoChainEntry {
    const hasFullLength = typeof context.fullLengthTicks === 'number';
    const previousStartBeatFromE0 = context.previousStartBeatFromE0 ?? 0;

    return {
        delayBeatsFromPreviousEntry: legacy.startBeat - previousStartBeatFromE0,
        transpositionSemitones: legacy.transposition,
        voiceIndex: legacy.voiceIndex,
        isInverted: legacy.type === 'I',
        isTruncated: hasFullLength ? legacy.length < context.fullLengthTicks! : false,
    };
}

export function toLegacyChainOption(
    canonical: CanonicalStrettoChainEntry,
    context: CanonicalChainEntryConversionContext = {}
): StrettoChainOption {
    const previousStartBeatFromE0 = context.previousStartBeatFromE0 ?? 0;
    const length = resolveLegacyLengthTicks(canonical, context);

    return {
        startBeat: previousStartBeatFromE0 + canonical.delayBeatsFromPreviousEntry,
        transposition: canonical.transpositionSemitones,
        type: canonical.isInverted ? 'I' : 'N',
        length,
        voiceIndex: canonical.voiceIndex,
    };
}


export interface LegacyChainOptionsConversionContext {
    /**
     * If provided, truncation is inferred via `legacy.length < fullLengthTicks`
     * for every entry in the chain.
     */
    fullLengthTicks?: number;
}

export interface CanonicalChainOptionsConversionContext {
    /**
     * Optional explicit length for each output legacy entry. When provided for an
     * index, it has highest precedence.
     */
    lengthTicksByIndex?: number[];

    /**
     * Full (non-truncated) length used as shared fallback for indices without
     * `lengthTicksByIndex[index]`.
     */
    fullLengthTicks?: number;

    /**
     * Truncated length used as shared fallback for indices without
     * `lengthTicksByIndex[index]`.
     */
    truncatedLengthTicks?: number;
}

/**
 * Converts a full legacy chain to canonical entries.
 *
 * This function eliminates caller-managed predecessor bookkeeping by deriving
 * each `delayBeatsFromPreviousEntry` from adjacent legacy `startBeat` values
 * in a single O(n) pass.
 */
export function fromLegacyChainOptions(
    legacyEntries: StrettoChainOption[],
    context: LegacyChainOptionsConversionContext = {}
): CanonicalStrettoChainEntry[] {
    let previousStartBeatFromE0 = 0;

    return legacyEntries.map((legacy, index) => {
        // Invariant: legacy startBeat values must be monotone non-decreasing.
        // A negative computed delay (i > 0) means the input chain is not ordered
        // correctly and would silently corrupt rule evaluations that depend on d_i.
        if (index > 0 && legacy.startBeat < previousStartBeatFromE0) {
            throw new Error(
                `fromLegacyChainOptions: entry ${index} startBeat (${legacy.startBeat}) ` +
                `is less than previous startBeat (${previousStartBeatFromE0}). ` +
                `Chain entries must be in non-decreasing temporal order.`
            );
        }
        const canonical = fromLegacyChainOption(legacy, {
            previousStartBeatFromE0,
            fullLengthTicks: context.fullLengthTicks,
        });
        previousStartBeatFromE0 = legacy.startBeat;
        return canonical;
    });
}

/**
 * Converts a full canonical chain to legacy entries.
 *
 * This function reconstructs absolute legacy `startBeat` coordinates from
 * relative delays via cumulative summation in a single O(n) pass.
 */
export function toLegacyChainOptions(
    canonicalEntries: CanonicalStrettoChainEntry[],
    context: CanonicalChainOptionsConversionContext = {}
): StrettoChainOption[] {
    let previousStartBeatFromE0 = 0;

    return canonicalEntries.map((canonical, index) => {
        const legacy = toLegacyChainOption(canonical, {
            previousStartBeatFromE0,
            lengthTicks: context.lengthTicksByIndex?.[index],
            fullLengthTicks: context.fullLengthTicks,
            truncatedLengthTicks: context.truncatedLengthTicks,
        });
        previousStartBeatFromE0 = legacy.startBeat;
        return legacy;
    });
}

export interface ScoreLogItem {
    reason: string;
    points: number;
}

export type CanonHarmonyClass =
    | 'full_triad'
    | 'full_7th_or_6th'
    | 'incomplete_7th_or_6th'
    | 'non_chord';

export interface CanonChordSpan {
    label: string;
    harmonyClass: CanonHarmonyClass;
    durationBeats: number;
    nctCount: number;
    dissonant: boolean;
}

export interface CanonScoreBreakdown {
    analyzedBeats: number;
    dissonantBeats: number;
    nctBeats: number;
    parallelPerfectCount: number;
    unisonCount: number;
    harmonyCounts: {
        fullTriad: number;
        full7thOr6th: number;
        incomplete7thOr6th: number;
        nonChord: number;
    };
    contributions: {
        harmonyBonus: number;
        dissonancePenalty: number;
        dissonanceResolutionBonus: number;
        nctPenalty: number;
        parallelPenalty: number;
        unisonPenalty: number;
        stepBonus: number;
        truncationPenalty: number;
    };
    chordSequence: CanonChordSpan[];
}

export interface ScoreLog {
    base: number; // Base utility anchor (0 in current scorer)
    penalties: ScoreLogItem[];
    bonuses: ScoreLogItem[];
    breakdown?: CanonScoreBreakdown;
    total: number;
}

export interface StrettoChainResult {
    id: string;
    entries: StrettoChainOption[];
    warnings: string[];
    score: number;
    scoreLog?: ScoreLog;
    variations?: StrettoChainResult[];
    detectedChords?: string[];
    dissonanceRatio?: number;
    nctRatio?: number;
    pairDissonanceScore?: number;
    isValid?: boolean;
    maxDissonanceRunEvents?: number;
}

export interface StrettoSearchReport {
    results: StrettoChainResult[];
    stats: {
        nodesVisited: number;
        edgesTraversed?: number;
        timeMs: number;
        stopReason: 'Success' | 'Timeout' | 'NodeLimit' | 'Exhausted';
        maxDepthReached: number;
        metricOffsetTicks?: number;
        timeoutExtensionAppliedMs?: number;
        finalizationScoredCount?: number;
        tripletEnumerationTruncated?: boolean;
        tripletBudgetMs?: number;
        completionDiagnostics?: {
            structurallyCompleteChainsFound: number;
            prefixAdmissibleCompleteChainsFound: number;
            distinctStructuralChainCount: number;
            scoringValidChainsFound: number;
            finalizationRejectedVoiceAssignment: number;
            finalizationRejectedScoringInvalid: number;
            maxDissonanceRunEventsHistogram?: Record<string, number>;
        };
        coverage?: {
            nodeBudgetUsedPercent: number | null;
            exploredWorkItems: number;
            liveFrontierWorkItems: number;
            maxFrontierSize: number;
            maxFrontierClassCount: number;
            depthHistogram: Record<string, number>;
            averageBranchesByDepth?: Record<string, number>;
            validChainsRatioByDepth?: Record<string, number>;
            invalidByPrecomputedAdmissibilityRatioByDepth?: Record<string, number>;
            invalidByOtherChecksRatioByDepth?: Record<string, number>;
            completionLowerBound?: number | null;
            completionLowerBoundIsHeuristic?: boolean;
            completionLowerBoundAssumptions?: {
                monotoneQueuedWorkItems: boolean;
                branchingFactorStationarity?: boolean;
                conservativeBranchUpperEnvelope?: boolean;
            };
            edgesTraversed: number;
            frontierSizeAtTermination: number;
            frontierClassesAtTermination: number;
            completionRatioLowerBound?: number | null;
        };
        stageTiming?: {
            admissibilityMs: number;
            pairwiseMs: number;
            tripletMs: number;
            dagMs: number;
        };
        stageStats?: {
            validDelayCount: number;
            transpositionCount: number;
            pairwiseTotal: number;
            pairwiseCompatible: number;
            pairwiseWithFourth: number;
            pairwiseWithVoiceCrossing: number;
            pairwiseP4TwoVoiceDissonant: number;
            pairwiseParallelRejected?: number;
            tripleCandidates: number;
            triplePairwiseRejected: number;
            tripletRejectA10?: number;
            tripletRejectA8?: number;
            tripletRejectDelayShape?: number;
            tripletRejectPairBCMissing?: number;
            tripletRejectAdjSepBC?: number;
            tripletRejectPairACMissing?: number;
            tripletRejectLowerBound?: number;
            tripletRejectParallel?: number;
            tripletRejectVoice?: number;
            tripletRejectP4Bass?: number;
            tripletRejectNoDelayContext?: number;
            tripletRejectedTotal?: number;
            tripletAcceptedTotal?: number;
            tripletCandidatesAccepted?: number;
            tripletDistinctShapesAccepted?: number;
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
            dissonanceSpans?: { startTick: number; endTick: number }[];
            p4Spans?: { startTick: number; endTick: number }[];
            parallelPerfectLocationTicks?: number[];
            transitionWindowLookups?: number;
            transitionsReturned?: number;
            candidateTransitionsEnumerated?: number;
            voiceTransitionProbeCount?: number;
            voiceTransitionProbeBaselineCount?: number;
            prunedByPrefixAdmissibility?: number;
        };
    };
}

export type StrettoConstraintMode = 'None' | 'Unlimited' | number;
export type StrettoDelaySearchCategory = 'stretto' | 'canon';

export interface StrettoSearchOptions {
    ensembleTotal: number;
    targetChainLength: number;
    delaySearchCategory?: StrettoDelaySearchCategory;
    canonDelayMinBeats?: number;
    canonDelayMaxBeats?: number;
    subjectVoiceIndex: number;
    truncationMode: StrettoConstraintMode;
    truncationTargetBeats: number; 
    inversionMode: StrettoConstraintMode;
    useChromaticInversion: boolean; 
    thirdSixthMode: StrettoConstraintMode;
    pivotMidi: number; // For inversion
    requireConsonantEnd: boolean;
    disallowComplexExceptions: boolean;
    maxPairwiseDissonance: number;
    allowP4RunLengthExtension?: boolean;
    voiceNames?: Record<number, string>;
    meterNumerator?: number;
    meterDenominator?: number;
    scaleRoot: number; // 0-11
    scaleMode: string; // 'Major', 'Natural Minor', 'Harmonic Minor', etc.
    maxSearchTimeMs?: number;
    collectDiagnosticSpans?: boolean;
    strettoMinDelayBeats?: number;
    useAutoTruncation?: boolean;
}

// --- Canon Search Types ---

export type CanonInversionPattern = 'none' | 'alternating' | 'all-inverted';

/**
 * 'independent' — enumerate all valid V-tuples where each voice slot may use
 *                 any allowed interval, subject to voice-spacing rules.
 * 'cumulative'  — for every T in the allowed interval set, build the tuple
 *                 [0, T, 2T, 3T, …]; only tuples that satisfy voice-spacing
 *                 rules are kept.
 * 'independent_reentry_free' — like independent, but on re-entry cycles a voice
 *                 slot may use a different transposition than its first-cycle value.
 */
export type CanonTranspositionMode = 'independent' | 'cumulative' | 'independent_reentry_free';

export interface CanonSearchOptions {
    ensembleTotal: number;
    delayMinBeats: number;
    delayMaxBeats: number;
    chainLengthMin: number;
    chainLengthMax: number;
    allowInversions: boolean;
    allowThirdSixth: boolean;
    pivotMidi: number;
    useChromaticInversion: boolean;
    scaleRoot: number;
    scaleMode: string;
    subjectVoiceIndex: number;
    transpositionMode: CanonTranspositionMode;
    /** 0–1: maximum allowed dissonant-duration fraction between adjacent voice pairs. Default 0.5. */
    dissonanceThreshold: number;
    voiceNames?: Record<number, string>;
}

export interface CanonChainResult {
    id: string;
    entries: StrettoChainOption[];
    score: number;
    scoreLog?: ScoreLog;
    delayBeats: number;
    /** One transposition value per voice slot (index = voice index 0…V-1). */
    transpositionSteps: number[];
    chainLength: number;
    inversionPattern: CanonInversionPattern;
    detectedChords?: string[];
    autoTruncatedBeats: number;
    warnings: string[];
}

export interface CanonSearchReport {
    results: CanonChainResult[];
    totalEvaluated: number;
    timeMs: number;
}
