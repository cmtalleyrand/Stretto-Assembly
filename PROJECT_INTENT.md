# Project Intent & Target Architecture

This document specifies design invariants for future modifications.

## 1. Data pipeline
- Inputs are assumed intentionally prepared MIDI.
- No aggressive auto-correction should alter compositional intent.
- Analysis layers report structure diagnostically rather than mutating source notes.

## 2. Harmonic analysis modes
1. Attack/block mode.
2. Sustain mode.
3. Arpeggio window mode.

## 3. Stretto scoring intent (base-0 utility model)
The stretto optimizer must score candidates using a zero-centered utility baseline:

\[
U_{quality}=-1000Q, \quad Q=0.2S1+0.3S2+0.2S3+0.3S4
\]

Then apply additive structural/harmonic deltas, with `ScoreLog.base = 0` and final clamping to `[-1000, 1000]`.

### Worked ranking illustration
Given three candidates with additive nets `{+180,+90,+260}` and quality penalties `{0.20,0.31,0.43}`:
- `A`: `U=-200`, additive `+980`, total `780`
- `B`: `U=-310`, additive `+780`, total `470`
- `C`: `U=-430`, additive `+830`, total `400`

Ordering remains `A > B > C`; quality dominates while additive terms separate nearby candidates.

## 4. UX/reporting requirements
- Keep score ordering numerically descending (higher is better).
- Preserve deterministic behavior for regression fixtures.
- Maintain transparent score decomposition in tooltip/log output.
