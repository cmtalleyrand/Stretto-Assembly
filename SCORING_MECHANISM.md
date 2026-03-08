# Stretto Scoring Mechanism Specification v1.3

## Objective
Rank valid stretto-chain candidates with a base-0 additive utility model.

## 1) Hard validity gate
Candidates are rejected when `requireConsonantEnd` is enabled and a terminal vertical sonority is dissonant.

## 2) Metric utility (base = 0)
Metrics:
- `S1`: unweighted dissonant-time ratio,
- `S2`: strong-beat-weighted dissonant-time ratio,
- `S3`: NCT-time ratio (`>=3` voices).

Weighted quality penalty fraction:
\[
Q = 0.2S1 + 0.3S2 + 0.2S3
\]

Quality utility:
\[
U_{quality} = -1000 \cdot Q
\]

## 3) Additive terms
\[
S_{total} = U_{quality} + B_{compactness} + B_{polyphony} + R_{harmony} - P_{distance} - P_{truncation} - P_{monotony} - P_{harmonyNCT}
\]

Distance penalties:
- `-20` per repeated delay occurrence,
- `-10` per adjacent delay within `0.5` beats (applies per side, so a center delay may accumulate `-20`),
- `-40` per expansion (`delay_i > delay_{i-1}`) before the final third of entries.

Removed from scoring: unprepared-dissonance metric, per-unique-distance reward, inversion bonus, chain-length bonus, imperfect-consonance bonus, clamp bounds.
