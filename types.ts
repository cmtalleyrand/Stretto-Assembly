

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
    
    // Shadow Grid Options
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

export interface ScoreLogItem {
    reason: string;
    points: number;
}

export interface ScoreLog {
    base: number;
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
        timeMs: number;
        stopReason: 'Success' | 'Timeout' | 'NodeLimit' | 'Exhausted';
        maxDepthReached: number;
    };
}

export type StrettoConstraintMode = 'None' | 'Max 1' | 'Unlimited';

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