import { RawNote } from '../../../../types';

// --- Weights & Constants (Protected) ---
export const WEIGHT_STRONG_BEAT = 1.2;     // Measure Downbeat
export const WEIGHT_MEDIUM_BEAT = 1.0;     // Secondary Strong Beat
export const WEIGHT_WEAK_BEAT = 0.75;      // Weak Beats
export const WEIGHT_SUBDIVISION = 0.6;     // Main Subdivisions
export const WEIGHT_OFF_BEAT = 0.5;        // Off-grid

export const MOD_APPROACH_LEAP = 1.2;
export const MOD_APPROACH_STEP = 0.8;
export const MOD_APPROACH_OTHER = 1.0;

export const DECAY_PER_QUARTER = 0.25;

// Penalty Constants (New Formula)
export const PENALTY_SUBTRACTION = 0.15;
export const PENALTY_FLOOR = 0.02;

// Role Weights (Evidence)
export const WEIGHT_ROLE_ROOT = 1.1;
export const WEIGHT_ROLE_3RD = 1.05; // Includes Altered 5ths
export const WEIGHT_ROLE_7TH = 0.95; // Includes Extensions
export const WEIGHT_ROLE_5TH = 0.90; // Includes 6ths

// Inversion Weights (Still relevant for Quality Score)
export const BONUS_ROOT_IN_BASS = 0.1;
export const PENALTY_THIRD_IN_BASS = 0.1;
export const PENALTY_FIFTH_IN_BASS = 0.2;
export const PENALTY_SEVENTH_IN_BASS = 0.25;

// Strict Structural Penalties for Quality Score
export const PENALTY_MISSING_3RD = 0.25; 
export const PENALTY_MISSING_5TH = 0.1;
export const BONUS_SEVENTH = 0.05; 
export const PENALTY_MISSING_7TH = 2.0;
export const PENALTY_MISSING_6TH = 2.0;
export const PENALTY_MISSING_ALTERED_5TH = 2.0; 

export const BEAM_WIDTH = 25;

export const INTERVAL_NAMES = ['Root', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];
export const CONSONANT_INTERVALS = [0, 3, 4, 7, 8, 9]; 
export const DISSONANT_INTERVALS = [1, 2, 5, 6, 10, 11]; 

// --- Interfaces ---

export interface NoteLinks {
    prev: RawNote | null;
    next: RawNote | null;
}

export interface HIANote extends RawNote {
    baseSalience: number;
    voicePrevMidi?: number;
    approachModifier: number; 
}

export interface BeatWindow {
    index: number;
    startTick: number;
    midTick: number;
    endTick: number;
    activeNotes: HIANote[];
}

export interface ChordCandidate {
    root: number;
    quality: string;
    intervals: number[];
    bass: number;
    baselineQ: number;
    name: string;
}

// --- Deep Audit Interfaces ---

export interface AuditInputNote {
    name: string;
    midi: number;
    durationQuarters: number;
    metricWeight: number;
    approachModifier: number;
    decay: number;
    finalSalience: number; // Base * Decay
    roleWeight?: number;   // The weight applied based on interval role
    weightedSalience?: number; // Final evidence value
    isSuspension: boolean;
    voiceIndex: number;
    onsetFormatted: string; 
    isExcluded?: boolean;
    exclusionReason?: string;
}

export interface AuditFactor {
    noteName: string; 
    label: string; 
    value: number; 
}

export interface AuditCandidate {
    name: string; 
    qualityScore: number;
    qualityLog: string[]; 
    evidenceTotal: number;
    evidenceBreakdown: AuditFactor[];
    penaltyTotal: number;
    penaltyBreakdown: AuditFactor[];
    pathScore: number; 
    stepScore: number; 
    finalScore: number; 
}

export interface AuditLogStep {
    tick: number;
    formattedTime: string;
    prevChord: string; 
    inputs: AuditInputNote[];
    winner: AuditCandidate;
    runnersUp: AuditCandidate[];
}

export interface ViterbiNode {
    chord: ChordCandidate;
    score: number;
    path: ViterbiNode[]; 
    assignedNotes: Set<HIANote>;
    audit: AuditLogStep; 
    _prevNodeIdx: number;
}