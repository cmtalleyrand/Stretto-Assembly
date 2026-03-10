

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
 * - For `e0`: `delayBeatsFromPreviousEntry = 0`, `transpositionSemisFromE0 = 0`,
 *   `isInverted = false`, and `isTruncated = false`.
 * - For every entry index `i > 0`: `delayBeatsFromPreviousEntry >= 0`.
 * - Monotone nondecreasing chain timing: defining
 *   `t_i = Σ_{k=0..i} chain[k].delayBeatsFromPreviousEntry`, then
 *   `t_i >= t_{i-1}` for every `i > 0`.
 */
export interface CanonicalStrettoChainEntry {
    delayBeatsFromPreviousEntry: number;
    transpositionSemisFromE0: number;
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
     * Legacy entries require a tick length field; this defaults to 0 when omitted.
     */
    lengthTicks?: number;
}

export function fromLegacyChainOption(
    legacy: StrettoChainOption,
    context: LegacyChainOptionConversionContext = {}
): CanonicalStrettoChainEntry {
    const hasFullLength = typeof context.fullLengthTicks === 'number';
    const previousStartBeatFromE0 = context.previousStartBeatFromE0 ?? 0;

    return {
        delayBeatsFromPreviousEntry: legacy.startBeat - previousStartBeatFromE0,
        transpositionSemisFromE0: legacy.transposition,
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

    return {
        startBeat: previousStartBeatFromE0 + canonical.delayBeatsFromPreviousEntry,
        transposition: canonical.transpositionSemisFromE0,
        type: canonical.isInverted ? 'I' : 'N',
        length: context.lengthTicks ?? 0,
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
     * Optional explicit length for each output legacy entry. When omitted for an
     * index, `length` defaults to 0 for that output entry.
     */
    lengthTicksByIndex?: number[];
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

    return legacyEntries.map((legacy) => {
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
        });
        previousStartBeatFromE0 = legacy.startBeat;
        return legacy;
    });
}

export interface ScoreLogItem {
    reason: string;
    points: number;
}

export interface ScoreLog {
    base: number; // Base utility anchor (0 in current scorer)
    penalties: ScoreLogItem[];
    bonuses: ScoreLogItem[];
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
}

export interface StrettoSearchReport {
    results: StrettoChainResult[];
    stats: {
        nodesVisited: number;
        edgesTraversed?: number;
        timeMs: number;
        stopReason: 'Success' | 'Timeout' | 'NodeLimit' | 'Exhausted';
        maxDepthReached: number;
        timeoutExtensionAppliedMs?: number;
        coverage?: {
            nodeBudgetUsedPercent: number;
            maxFrontierSize: number;
            maxFrontierClassCount: number;
        };
        stageStats?: {
            validDelayCount: number;
            transpositionCount: number;
            pairwiseTotal: number;
            pairwiseCompatible: number;
            pairwiseWithFourth: number;
            pairwiseWithVoiceCrossing: number;
            tripleCandidates: number;
            triplePairwiseRejected: number;
            tripleLowerBoundRejected: number;
            tripleParallelRejected: number;
            tripleVoiceRejected: number;
            harmonicallyValidTriples: number;
            deterministicDagMergedNodes: number;
        };
    };
}

export type StrettoConstraintMode = 'None' | 'Unlimited' | number;

export interface StrettoSearchOptions {
    ensembleTotal: number;
    targetChainLength: number;
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
    voiceNames?: Record<number, string>;
    scaleRoot: number; // 0-11
    scaleMode: string; // 'Major', 'Natural Minor', 'Harmonic Minor', etc.
}
