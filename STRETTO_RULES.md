
# Stretto Generator Rules & Logic (v4.8 Strict)

This document defines the strict set of rules, constraints, and scoring mechanisms used by the Stretto Assembly algorithm.

## ⚠ Critical Delay-Contraction Safeguards (Persistent Failure Prevention)
These rules explicitly prevent chains where added entries fail to increase stretto compactness.

Notation: $n$ is entry index, $d_n$ is delay between entries $(n-1)\rightarrow n$, $Sb$ is current entry subject length in beats, and $B$ is one beat.

1. **Half-length contraction trigger:** if $d_{n-1} > Sb/2$, then $d_n < d_{n-1} - 0.5B$.
2. **Expansion recoil trigger:** if $d_{n-1} > d_{n-2}$ and $d_{n-1} > Sb/3$, then $d_n < d_{n-2} - 0.5B$.
3. **Post-truncation contraction:** after a truncated entry, the next delay must contract by at least $1B$, unless $d_{n-1} < Sb/3$.

## 1. Hard Constraints (The "Gatekeepers")
Any chain candidate that violates *any* of these rules is immediately discarded (pruned) during the search process.

### A. Distance & Rhythm Rules
1.  **Global Uniqueness:** Every delay interval used in the chain must be unique if > 1/3 length.
2.  **Half-Length Trigger:** If previous delay exceeds half subject length, current delay must contract by at least 0.5 beat.
3.  **Expansion Recoil:** If previous delay expanded and exceeded one-third subject length, current delay must contract by at least 0.5 beat relative to two entries ago.
4.  **Post-Truncation Contraction:** After a truncated entry, next delay must contract by at least 1 beat unless previous delay is below one-third subject length.
5.  **Universal Distance Limits:** All entries are allowed a maximum delay of **66% (2/3)** of the subject length.

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

$$ Q = 0.2S1 + 0.3S2 + 0.4S3, \quad U_{quality} = -1000Q $$

and `ScoreLog.base = 0` with no clamp.

Distance penalty decomposition:
1. $-20$ per repeated delay occurrence beyond first use.
2. $-10$ per adjacent delay within $0.5$ beat (left/right counted independently).
3. $-40$ per expansion before the final third of entries.
4. $-40$ per post-truncation contraction miss (with short-delay exemption).

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
