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

## Worked Example

A 3-entry chain in 4/4 time, subject length Sb = 4 beats:

```
e0: startBeat=0.0,  transposition= 0 semitones (root),  type=N, length=4.0
e1: startBeat=2.0,  transposition= 7 semitones (P5),    type=N, length=4.0
e2: startBeat=3.0,  transposition= 3 semitones (m3),    type=N, length=4.0

Derived delays: d1=2.0 beats, d2=1.0 beat
```

**Step 1 — Harmonic metrics** (computed from note-level sweep):
- S1 = 0.12  (12% of polyphonic duration is dissonant, unweighted)
- S2 = 0.15  (15% weighted — some dissonances land on beats 1 or 3)
- S3 = 0.08  (8% non-chord-tone ratio)

**Step 2 — Quality penalty:**
```
Q = 0.2 × 0.12 + 0.3 × 0.15 + 0.4 × 0.08 = 0.024 + 0.045 + 0.032 = 0.101
U_quality = −1000 × 0.101 = −101 pts
```

**Step 3 — Distance penalties:**
- Repeated delays: d1=2.0 ≠ d2=1.0 → 0 pts
- Adjacent cluster: |d1 − d2| = 1.0 beat > 0.5 → 0 pts
- Early expansion: d2 < d1 (contraction, not expansion) → 0 pts
- P_distance = **0 pts**

**Step 4 — Truncation:** no entries truncated → P_truncation = **0 pts**

**Step 5 — Monotony:** intervals +7 and −4 semitones, neither exceeds 50% → P_monotony = **0 pts**

**Step 6 — Harmony NCT burden** (approximation): P_harmonyNCT ≈ **−8 pts**

**Step 7 — Compactness bonus:**
- d1=2.0 = 50% of Sb (not < 50%) → 0 pts
- d2=1.0 = 25% of Sb (not < 25%) → 0 pts
- B_compactness = **0 pts**

**Step 8 — Polyphony density** (approximation):
- Duration-weighted average voices ≈ 2.2 over chain duration
- B_polyphony ≈ 2.2 × 400 = **+880 pts**

**Step 9 — Harmonic reward** (approximation): R_harmony ≈ **+30 pts**

**Total:**
```
S = −101 + 0 + 0 + 0 − 8 + 0 + 880 + 30 = +801 pts
```

The polyphony density bonus dominates for compact multi-voice chains; quality and distance penalties differentiate chains at similar polyphony levels.

---

## 3. Explicitly Removed Legacy Terms
*   Unprepared dissonance metric (former S4).
*   Per-unique-distance reward.
*   Inversion bonus.
*   Chain-length bonus.
*   Imperfect-consonance bonus.
*   Final score clamp.
