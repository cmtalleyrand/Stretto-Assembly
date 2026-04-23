# Glossary / Terminology TODO Log

This file tracks deferred tasks requested in review. These items are intentionally logged and not actioned in the current change set.

## TODO-1: Remove dormant node-budget stop path — **Completed (2026-04-23)**
- Result: removed from type unions, status presentation branches, tests, and glossary references.

## TODO-2: Tidy identical/overlapping definitions
- Request: consolidate duplicated or near-duplicated glossary definitions and telemetry wording.
- Scope candidates: glossary terms and telemetry labels for candidate/transition counters and completion metrics.

## TODO-3: Delay/transposition notation policy
- Request: never use `t` to denote delay; use beat/quarter units for delay and semitone units for transposition.
- Required policy:
  - Delay variables/symbols should use `d` and units (`b` or `q`).
  - Transposition interval variables/symbols should use `tint` and units (`st`).

## TODO-4: Adopt entry-index notation standard
- Requested notation for entry `e_i`:
  - `tint_i`: transposition relative to first entry.
  - `d_i`: onset distance relative to previous entry.
  - `Dis_i`: distance from first entry (not "delay").
  - `mod_i`: modification status (`normal`, `inverted`, `truncated`).
  - `vox_i`: allocated voice index.
- Pair/triplet-relative quantities should use uppercase index letters for local relations.
