# Stretto Scoring Mechanism Specification v1.5

## Objective
To algorithmically rank Stretto Chain candidates so that the most musically significant, valid, and interesting results appear at the top of the list.

Hard validity constraints (gatekeepers) are defined in `STRETTO_RULES.md §1`. A candidate must pass all of them before scoring is applied.

## The Scoring Formula

Candidates that pass validity are ranked using a **Base Score** of 0.

$$ S_{total} = U_{quality} - P_{distance} - P_{truncation} - P_{monotony} - P_{harmonyNCT} + B_{compactness} + B_{polyphony} + R_{harmony} $$

where

$$ Q = 0.2S1 + 0.3S2 + 0.4S3, \quad U_{quality} = -1000Q $$

and `ScoreLog.base = 0`.

### Penalties ($P$)

#### A. Quality Utility Penalty ($U_{quality}$)
S1, S2, S3 metrics are defined in `STRETTO_RULES.md §2`.

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
