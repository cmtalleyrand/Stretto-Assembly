# Stretto Generator Rules & Logic (v4.5)

## 1. Hard constraints (pruning)
1. Delay uniqueness for long links (`> 1/3` subject length).
2. Elasticity bound between adjacent delays.
3. Expansion-reaction structural rule.
4. Universal delay ceiling: each entry delay `<= 2/3` subject length.
5. Voice-order inequalities for adjacent voices.
6. Voice re-entry enabled one beat before release.
7. Optional consonant-end terminal check.

## 2. Metric layer
- `S1`: dissonant-time ratio over polyphonic slices.
- `S2`: strong-beat-weighted dissonant-time ratio.
- `S3`: proportional NCT-time ratio for `>=3` voices.

\[
Q = 0.2S1 + 0.3S2 + 0.2S3, \qquad U_{quality} = -1000Q
\]

## 3. Structural adjustments
- Compactness bonuses: hyper/tight entries.
- Distance penalties: repeated delays, local delay clustering (`<=0.5` beat adjacency), early expansions before final third.
- Truncation and monotony penalties.
- Harmony reward/penalty and polyphony-density bonus.

Unprepared-dissonance event logic is intentionally excluded.
