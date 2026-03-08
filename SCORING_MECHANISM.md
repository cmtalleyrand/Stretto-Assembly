# Stretto Scoring Mechanism Specification v1.2

## Objective
Rank valid stretto-chain candidates using a metric utility term centered at zero, then apply structural/harmonic additive adjustments.

## 1) Hard validity gate
Candidates are discarded if `requireConsonantEnd` is enabled and any entry terminates in a dissonant verticality.

## 2) Base-0 scoring equation
Let:
- `S1`: unweighted dissonant-time ratio,
- `S2`: weighted dissonant-time ratio (strong-beat weight 1.5),
- `S3`: NCT-time ratio,
- `S4`: unprepared-dissonance event ratio.

With weights `(W1,W2,W3,W4)=(0.2,0.3,0.2,0.3)`:

\[
Q = W_1 S_1 + W_2 S_2 + W_3 S_3 + W_4 S_4
\]

Define quality utility (base-0):

\[
U_{quality} = -1000 \cdot Q
\]

Final score:

\[
S_{total} = U_{quality} + B_{compactness} + B_{variety} + B_{complexity} + B_{polyphony} + R_{harmony} - P_{truncation} - P_{monotony} - P_{harmonyNCT}
\]

Then clamp to `[-1000, 1000]`.

> This is an affine reparameterization of the prior base-1000 form, preserving rank monotonicity under the matched clamp transform.

## 3) Additive terms
- **Compactness:** `+50` (hyper, delay < 25% subject), `+25` (tight, delay < 50%).
- **Variety:** `+50` per unique inter-entry transposition distance beyond first.
- **Imperfect-consonance variety:** `+30` per entry at 3rd/6th class.
- **Complexity:** `+100` per inversion, `+10` per voice beyond 2.
- **Truncation:** `-20` per removed beat.
- **Monotony:** `-100` if one transposition class exceeds 50% of entries.
- **Harmony analyzer:** reward full-chord sustain, penalize NCT prevalence.
- **Polyphony density:** `200 * (avgVoices - 2)`.

## 4) Worked examples
### Example A (high quality)
- `Q = 0.18`  
- `U_quality = -1000*0.18=-180`
- Additive net `+210`
- `S_total = 30`

### Example B (borderline quality)
- `Q = 0.44`
- `U_quality = -440`
- Additive net `+430`
- `S_total = -10`

### Example C (poor quality, dense penalties)
- `Q = 0.74`
- `U_quality = -740`
- Additive net `-130`
- `S_total = -870`

## 5) Score log semantics
`ScoreLog.base = 0`. Metric S1-S4 contributions are logged as penalty magnitudes; all bonuses/penalties are additive deltas around zero.
