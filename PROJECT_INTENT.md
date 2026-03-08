# Project Intent & Target Architecture

## 1. Data pipeline
- MIDI input is treated as intentional source data.
- Analysis emphasizes diagnostics over corrective mutation.

## 2. Harmonic analysis modes
1. Attack/block.
2. Sustain.
3. Arpeggio-window.

## 3. Stretto scoring intent
Use base-0 additive scoring:
\[
Q = 0.2S1 + 0.3S2 + 0.2S3, \qquad U_{quality} = -1000Q
\]

Then apply compactness/harmony/polyphony additions and structural penalties (distance repetition/cluster/early-expansion, truncation, monotony).

`ScoreLog.base` remains `0`; no artificial clamp range should truncate ordering.

## 4. UX invariant
Result ordering must remain numeric descending by `score` for both top-level chains and nested variations.
