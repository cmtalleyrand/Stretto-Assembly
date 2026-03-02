
# Stretto Generator Rules & Logic (v4.3 Strict)

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

## 2. Scoring Metrics (S1-S4)
Candidates that pass the Hard Constraints are ranked by a composite score derived from these four strict metrics.

### Metric S1: Dissonance Ratio (Unweighted)
The fraction of polyphonic duration that contains any dissonance.
*   **Formula:** $TotalDissonantTime / TotalPolyphonicTime$
*   **Ideal:** Lower is better.

### Metric S2: Dissonance Ratio (Weighted)
Similar to S1, but dissonances occurring on **Strong Beats** are penalized more heavily (1.5x weight).
*   **Ideal:** Lower is better.

### Metric S3: Non-Chord Tone (NCT) Ratio
Measures harmonic stability by fitting vertical slices to a strict **Chord Template Library** (Triads, 7ths, Aug6).
*   **Formula:** $\sum (TotalPitches - ChordTones) / (TotalPolyphonicBeats * AvgVoiceCount)$
*   **Ideal:** Lower indicates cleaner, more triadic harmony.

### Metric S4: Unprepared Dissonance Ratio
A rigorous contrapuntal check. A dissonance is only "forgiven" if it is **Prepared**.
*   **Preparation Rule (P1):** The voice must have been consonant against the bass in the previous time step.
*   **Motion Rule (P2):** The dissonance must arise from a single voice moving (or the bass moving), not simultaneous leaps into a clash.
*   **Formula:** $UnpreparedEvents / TotalDissonantEvents$
*   **Ideal:** 0.0 (All dissonances are prepared suspensions or passing tones).

## 3. Analysis Definitions

### Consonance vs. Dissonance
*   **Consonant:** P1, m3, M3, P5, m6, M6, P8.
*   **Dissonant:** m2, M2, TT, m7, M7. 
*   **Contextual:** P4 is dissonant **only** against the bass.

### Parallel Motion Check
Both voices moving into a Perfect 5th or Octave interval from another Perfect interval of the same class is a fatal error.
