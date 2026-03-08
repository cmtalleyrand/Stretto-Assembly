# Stretto Scoring Mechanism Specification v1.5

## Objective
To algorithmically rank Stretto Chain candidates so that the most musically significant, valid, and interesting results appear at the top of the list.

## 1. Validity Constraints (The "Gatekeepers")
Before a candidate is scored, it must pass these hard checks. If it fails, it is discarded immediately.

### A. Consonant Termination (Optional)
*   **Rule:** The last note of every voice entry must form a consonance with at least one other active voice **if** `Require Consonant End` is enabled.
*   **Purpose:** Excludes unresolved dissonant endings when strict termination is required.
*   **Config:** Optional (Toggle: `Require Consonant End`).

### B. No Unison Chains
*   **Rule:** A voice cannot enter at the exact same transposition interval as the immediately preceding voice.
*   **Purpose:** Prevents "Unison stacking" (e.g., Voice 1 at P1, Voice 2 at P1) which creates clumps rather than counterpoint.

---

## 2. The Scoring Formula

Candidates that pass validity are ranked using a **Base Score** of 0.

$$ S_{total} = U_{quality} - P_{truncation} - P_{monotony} - P_{distance} - P_{harmonyNCT} + B_{compactness} + B_{polyphony} + R_{harmony} $$

with

$$ Q = 0.2S1 + 0.3S2 + 0.2S3, \quad U_{quality} = -1000Q $$

and `ScoreLog.base = 0`.

### Penalties ($P$)

#### A. Quality Penalty via Utility ($U_{quality}$)
*   `S1`: unweighted dissonant-time ratio over slices with at least 2 active voices.
*   `S2`: strong-beat-weighted dissonant-time ratio (1.5x on strong beats).
*   `S3`: NCT proportional burden over slices with at least 3 active voices.
*   Lower `S1/S2/S3` monotonically improves total score.

#### B. Truncation ($P_{truncation}$)
*   **Cost:** $-20$ points per *beat* of the subject removed.

#### C. Monotony / Clumping ($P_{monotony}$)
*   **Rule:** We want a range of intervals, not clumps of the same one.
*   **Cost:** $-100$ points if any single interval type makes up more than 50% of the entry relationships.

#### D. Distance Structure ($P_{distance}$)
*   **Repeated Delay:** $-20$ per repeated delay occurrence beyond first use.
*   **Local Cluster:** $-10$ for each adjacent delay within $0.5$ beat (left/right counted independently).
*   **Early Expansion:** $-40$ per expansion that occurs before the final-third boundary of entries.

#### E. Harmonic NCT Burden ($P_{harmonyNCT}$)
*   Harmonic analysis contributes a non-chord-tone burden penalty.

### Bonuses / Rewards

#### A. Compactness ($B_{compactness}$)
Rewards "Hyper-Stretto" (entries that occur very soon after the previous one).
*   If $Delay_e < 25\%$ of Subject Length: $+50$ points.
*   If $Delay_e < 50\%$ of Subject Length: $+25$ points.

#### B. Polyphony Density ($B_{polyphony}$)
*   Duration-weighted mean active voices contributes additive density reward.

#### C. Harmonic Stability Reward ($R_{harmony}$)
*   Full-chord occupancy contributes a positive reward.

---

## 3. Normative Exclusions
The following terms are intentionally not part of the active scorer:
*   Unprepared dissonance event metric (former S4).
*   Per-unique-distance reward.
*   Inversion bonus.
*   Chain-length bonus.
*   Imperfect-consonance bonus.
*   Final score clamp.
