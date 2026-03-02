
// Centralized constants for Stretto Generator

export const SCORING = {
    // 1. Polyphony
    // Formula: 300 * (Average Active Voices - 1.5)
    POLYPHONY_BASE_MULT: 300,
    POLYPHONY_OFFSET: 1.5,

    // 2. Dissonance (Proportional)
    DISS_WEIGHT_BASS: 1.0,
    DISS_WEIGHT_UPPER: 0.8,
    
    // New Proportional Logic: Start penalty at 45%
    DISS_PENALTY_START: 0.45, 
    DISS_PENALTY_SLOPE: 2000, 
    
    BUCKET_SWEET_MIN: 0.2,
    BUCKET_SWEET_MAX: 0.4,
    BUCKET_SWEET_SCORE: 300,
    
    // 3. Distance / Rhythm
    // NOTE: Clumping/Expansion are now HARD CONSTRAINTS in the generator logic.
    DIST_VARIETY_BONUS: 50,        // Per unique distance > 1
    
    // 4. Compactness (Bonuses)
    COMPACT_HYPER_THRESH: 0.25,
    COMPACT_HYPER_BONUS: 50,
    COMPACT_TIGHT_THRESH: 0.50,
    COMPACT_TIGHT_BONUS: 25,

    // 5. Structure
    INVERSION_BONUS: 100,
    CHAIN_LENGTH_BONUS: 10,
    TRUNCATION_PENALTY_PER_BEAT: 20,
    WARNING_PENALTY: 100,
    MONOTONY_PENALTY: 100, // Interval repetition
    IMPERFECT_CONS_BONUS: 30, // 3rds/6ths

    // 6. Harmonic Quality (New)
    HARMONY_ACTIVATION_VOICES: 3,
    HARMONY_MIN_DURATION_16THS: 2, // 8th note (assuming 4 16ths per beat)
    HARMONY_FULL_CHORD_REWARD: 20, // Per beat of full chord
    HARMONY_NCT_PENALTY_MULT: 10, // Per beat of NCT
};

export const INTERVALS = {
    // m2, M2, TT, m7, M7
    DISSONANT_SIMPLE: new Set([1, 2, 6, 10, 11]), 
    // P1, m3, M3, P5, m6, M6, P8
    CONSONANT: new Set([0, 3, 4, 7, 8, 9, 12]),
    
    THIRD_SIXTH_TRANSPOSITIONS: new Set([3, 4, 8, 9, -3, -4, -8, -9, 15, 16, 20, 21, -15, -16, -20, -21]),
    
    // Standard and Compound Perfect Intervals (Expanded to include P18/P19)
    TRAD_TRANSPOSITIONS: new Set([
        0, 12, -12, 24, -24, // Unison/Octaves
        7, -5, 19, -17, 31, -29, // 5ths (and compound 5ths: P5, P12, P19)
        5, -7, 17, -19, 29, -31  // 4ths (and compound 4ths: P4, P11, P18)
    ])
};

export const SCALE_INTERVALS: Record<string, number[]> = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
    'Melodic Minor': [0, 2, 3, 5, 7, 9, 11], 
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Locrian': [0, 1, 3, 5, 6, 8, 10]
};

// Vocabulary constrained to Triads, 6ths, 7ths.
// 9ths/add9s are explicitly excluded so they register as NCTs.
export const CHORD_SHAPES = [
    // Triads
    { name: 'Maj', intervals: [0, 4, 7] },
    { name: 'Min', intervals: [0, 3, 7] },
    { name: 'Dim', intervals: [0, 3, 6] },
    { name: 'Aug', intervals: [0, 4, 8] },
    { name: '5', intervals: [0, 7] }, // Power chords
    // 6ths (Preferred over 7ths if applicable)
    { name: 'Maj6', intervals: [0, 4, 7, 9] },
    { name: 'm6', intervals: [0, 3, 7, 9] },
    // 7ths
    { name: 'Dom7', intervals: [0, 4, 7, 10] },
    { name: 'Maj7', intervals: [0, 4, 7, 11] },
    { name: 'm7', intervals: [0, 3, 7, 10] },
    { name: 'm7b5', intervals: [0, 3, 6, 10] },
    { name: 'dim7', intervals: [0, 3, 6, 9] },
    { name: 'mM7', intervals: [0, 3, 7, 11] },
];

// Added Maj6 and m6 as consonant (often treated as stable in non-strict/jazz contexts, or per user request)
export const CONSONANT_QUALITIES = new Set(['Maj', 'Min', 'Aug', '5', 'Maj6', 'm6']);
