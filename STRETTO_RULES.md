
# Stretto Generator Rules & Logic (v4.8 Strict)

This document defines the strict set of rules, constraints, and scoring mechanisms used by the Stretto Assembly algorithm.

## 1. Hard Constraints (The "Gatekeepers")
Any chain candidate that violates *any* of these rules is immediately discarded (pruned) during the search process.

### A. Distance & Rhythm Rules
1.  **Global Uniqueness:** Every delay interval used in the chain must be unique if > 1/3 length.
2.  **Elasticity Limit:** Max expansion of 1 beat between entries.
3.  **Expansion Reaction:** An expansion step must be followed by a contraction.
4.  **Universal Distance Limits:** All entries are allowed a maximum delay of **66% (2/3)** of the subject length.

### B. Voice Interval Constraints (Relative)
The algorithm strictly enforces vertical ordering:
1.  **Neighbor Below ($v+1$):** $T(v) \ge T(v+1)$.
2.  **Neighbor Above ($v-1$):** $T(v) \le T(v-1)$.

### C. Voice Allocation
1.  **Re-entry:** Any voice becomes available for re-entry 1 beat before its final note ends.

### D. Optional Consonant Termination
If `requireConsonantEnd` is enabled, dissonant endpoints invalidate the chain.

## 2. Scoring Metrics (S1-S3)
Candidates that pass the Hard Constraints are ranked by a composite score derived from these three strict metrics.

### Metric S1: Dissonance Ratio (Unweighted)
The fraction of polyphonic duration that contains any dissonance.
*   **Formula:** $TotalDissonantTime / TotalPolyphonicTime$
*   **Ideal:** Lower is better.

### Metric S2: Dissonance Ratio (Weighted)
Similar to S1, but dissonances occurring on **Strong Beats** are penalized more heavily (1.5x weight).
*   **Ideal:** Lower is better.

### Metric S3: Non-Chord Tone (NCT) Ratio
Measures harmonic stability by fitting vertical slices to a strict **Chord Template Library** (Triads, 7ths, Aug6).
*   **Formula:** proportional NCT burden over slices with at least 3 active voices.
*   **Ideal:** Lower indicates cleaner, more triadic harmony.

Metric S4 (Unprepared Dissonance Ratio) is intentionally excluded from the active scorer.

## 3. Scoring Composition
For feasible chains:

$$ S(C)=U_{quality}+B_{compactness}+B_{polyphony}+R_{harmony}-P_{distance}-P_{truncation}-P_{monotony}-P_{harmonyNCT} $$

where

$$ Q = 0.2S1 + 0.3S2 + 0.2S3, \quad U_{quality} = -1000Q $$

and `ScoreLog.base = 0` with no clamp.

Distance penalty decomposition:
1. $-20$ per repeated delay occurrence beyond first use.
2. $-10$ per adjacent delay within $0.5$ beat (left/right counted independently).
3. $-40$ per expansion before the final third of entries.

## 4. Analysis Definitions

### Consonance vs. Dissonance
*   **Consonant:** P1, m3, M3, P5, m6, M6, P8.
*   **Dissonant:** m2, M2, TT, m7, M7. 
*   **Contextual:** P4 is dissonant **only** against the bass.

### Parallel Motion Check
Both voices moving into a Perfect 5th or Octave interval from another Perfect interval of the same class is a fatal error.

## 5. Explicitly Removed Legacy Additions
* per-unique-distance reward,
* inversion bonus,
* chain-length bonus,
* imperfect-consonance bonus,
* score clamping.
