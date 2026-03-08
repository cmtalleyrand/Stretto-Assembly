# Stretto Generator Rules & Logic (v4.4)

## 1. Hard constraints (pruning)
1. Delay uniqueness for long links (`> 1/3` subject length).
2. Elasticity bound: expansion between adjacent delays is limited.
3. Expansion reaction: an expansion must be followed by contraction.
4. Universal delay ceiling: each entry delay `<= 2/3` of subject length.
5. Voice-ordering inequalities are enforced for adjacent voices.
6. Voice re-entry availability starts one beat before prior release.
7. Optional consonant-end validation can reject terminal dissonances.

## 2. Metric layer (S1-S4)
- `S1`: dissonant-time ratio over all polyphonic slices (`>=2` voices).
- `S2`: strong-beat-weighted dissonant-time ratio.
- `S3`: proportional NCT-time ratio (evaluated when `>=3` voices).
- `S4`: unprepared dissonant-event ratio against bass.

Weighted quality penalty:
\[
Q = 0.2S1 + 0.3S2 + 0.2S3 + 0.3S4
\]

Base-0 utility:
\[
U_{quality}=-1000Q
\]

## 3. Total score assembly
\[
S_{total}=U_{quality}+\sum Bonus_i-\sum Penalty_j
\]
with clamp range `[-1000, 1000]`.

Additive terms include compactness, interval variety, imperfect-consonance usage, inversion/length complexity, truncation cost, monotony penalty, harmony reward/penalty, and polyphony-density bonus.

## 4. Ordering invariant
The base-0 formulation is calibrated as an affine transform of the previous base-1000 quality term, maintaining candidate rank order on deterministic fixture regressions while improving interpretability around neutral utility (`0`).
