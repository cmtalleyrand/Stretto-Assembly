# Glossary / Terminology TODO Log

This file tracks deferred tasks requested in review. These items are intentionally logged and not actioned in the current change set.

## TODO-1: Remove dormant `NodeLimit` path
- Request: "delete nodelimit and all related code".
- Scope candidates: type unions, status presentation branches, tests, and any compatibility layers.
- Status: deferred.

## TODO-2: Tidy identical/overlapping definitions
- Request: consolidate duplicated or near-duplicated glossary definitions and telemetry wording.
- Scope candidates: glossary terms and telemetry labels for candidate/transition counters and completion metrics.
- Status: deferred.

## TODO-3: Delay/transposition notation policy
- Request: never use `t` to denote delay; use beat/quarter units for delay and semitone units for transposition.
- Required policy:
  - Delay variables/symbols should use `d` and units (`b` or `q`).
  - Transposition variables/symbols should use `p` and units (`st`).
- Status: deferred for full-codebase symbol normalization; glossary updated to conform.

## TODO-4: Evaluate `bassRoleCompatible` state compression
- Problem: directional states (`a`, `b`) may be representable as a simpler role-conditioned predicate once pair ordering indirection is normalized.
- Candidate refactor: replace directional storage with explicit "assigned-bass-member" evaluation or compressed compatibility encoding.
- Status: deferred.

## RESOLVED-5: `none`-only replacement for directional bass-role states
- Conclusion: not equivalent under current masking algorithm.
- Reason: role-conditioned pruning uses directional compatibility (`a` when source=bass, `b` otherwise); a single `none` state cannot encode asymmetric admissibility.
- Action: keep directional states; future simplification requires a semantics-preserving alternative encoding, not deletion.

## TODO-6: Adopt entry-index notation standard
- Requested notation for entry `e_i`:
  - `t_i`: transposition relative to first entry.
  - `d_i`: onset distance relative to previous entry.
  - `Dis_i`: distance from first entry (not "delay").
  - `mod_i`: modification status (`normal`, `inverted`, `truncated`).
  - `vox_i`: allocated voice index.
- Pair/triplet-relative quantities should use uppercase index letters for local relations.
- Status: deferred.
