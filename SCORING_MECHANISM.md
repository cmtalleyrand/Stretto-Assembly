# Stretto Scoring Mechanism Specification v1.5

## Objective
To algorithmically rank Stretto Chain candidates so that the most musically significant, valid, and interesting results appear at the top of the list.

## 1. Validity Constraints (The "Gatekeepers")
Before a candidate is scored, it must pass these hard checks. If it fails, it is discarded immediately.

### A. Consonant Termination (Optional)
*   **Rule:** The last note of every voice entry must form a consonance (P1, m3, M3, P5, m6, M6, P8) with at least one other active voice when `Require Consonant End` is enabled.
*   **Purpose:** Excludes "pure unresolved dissonances" where a voice trails off on a clashing note.
*   **Config:** Toggle: `Require Consonant End`.

### B. No Unison Chains
*   **Rule:** A voice cannot enter at the exact same transposition interval as the immediately preceding voice.
*   **Purpose:** Prevents "Unison stacking" (e.g., Voice 1 at P1, Voice 2 at P1) which creates clumps rather than counterpoint.

---

## 2. The Scoring Formula

Candidates that pass validity are ranked using a **Base Score** of 0.

$$ S_{total} = U_{quality} - P_{distance} - P_{truncation} - P_{monotony} - P_{harmonyNCT} + B_{compactness} + B_{polyphony} + R_{harmony} $$

where

$$ Q = 0.2S1 + 0.3S2 + 0.4S3, \quad U_{quality} = -1000Q $$

and `ScoreLog.base = 0`.

### Penalties ($P$)

#### A. Quality Utility Penalty ($U_{quality}$)
*   `S1`: Unweighted dissonance ratio (`TotalDissonantTime / TotalPolyphonicTime`).
*   `S2`: Strong-beat-weighted dissonance ratio (1.5x weight on strong beats).
*   `S3`: Non-chord-tone ratio over slices with at least 3 active voices (weighted at 2x prior emphasis).

#### B. Distance Structure ($P_{distance}$)
*   **Repeated Delay:** $-20$ points per repeated delay occurrence beyond first use.
*   **Local Delay Cluster:** $-10$ points per adjacent delay within $0.5$ beat (left/right counted independently).
*   **Early Expansion:** $-40$ points per expansion before the final-third boundary.
*   **Post-Truncation Contraction Miss:** $-40$ points when a truncated entry is not followed by >=1 beat contraction (except short-delay exemption).

#### C. Truncation ($P_{truncation}$)
*   **Cost:** $-20$ points per *beat* of the subject removed.

#### D. Monotony / Clumping ($P_{monotony}$)
*   **Rule:** We want a range of intervals, not clumps of the same one.
*   **Cost:** $-100$ points if any single interval type (e.g., "+P5") makes up more than 50% of the entry relationships.

#### E. Harmonic NCT Burden ($P_{harmonyNCT}$)
*   Harmonic analysis contributes a non-chord-tone burden penalty.

### Rewards ($B$, $R$)

#### A. Compactness ($B_{compactness}$)
Rewards "Hyper-Stretto" (entries that occur very soon after the previous one).
*   **Formula:** For each entry $e$:
    *   If $Delay_e < 25\%$ of Subject Length: $+50$ points.
    *   If $Delay_e < 50\%$ of Subject Length: $+25$ points.

#### B. Polyphony Density ($B_{polyphony}$)
*   Duration-weighted average active voices contributes additive density reward (multiplier doubled from 200 to 400).

#### C. Harmonic Reward ($R_{harmony}$)
*   Stable full-chord occupancy contributes positive reward.

---

## 3. Explicitly Removed Legacy Terms
*   Unprepared dissonance metric (former S4).
*   Per-unique-distance reward.
*   Inversion bonus.
*   Chain-length bonus.
*   Imperfect-consonance bonus.
*   Final score clamp.
