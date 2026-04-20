# Glossary / Terminology TODO Log

This file tracks deferred tasks requested in review.

## Completed

### TODO-2: Tidy identical/overlapping definitions — **Implemented (2026-04-20)**
- Action taken:
  - normalized glossary and telemetry terminology so counter families are disjoint by construction:
    - **candidate operations processed** (work attempted),
    - **accepted/retained structures** (work admitted),
    - **transition edges evaluated** (DAG successor checks),
    - **completion lower bound** (heuristic frontier-coverage quantity).
  - tightened wording to prevent semantic overlap between pair/triplet counters and DAG counters.

### TODO-3: Delay/transposition notation policy — **Implemented (2026-04-20)**
- Action taken:
  - standardized notation to:
    - delay/onset distance: `d` with units `b` or `q`,
    - transposition: `t` with units `st`.
  - removed glossary uses that previously overloaded transposition with non-`t` symbols.

### TODO-4: Adopt entry-index notation standard — **Implemented (2026-04-20)**
- Action taken:
  - added explicit canonical symbols:
    - `t_i`: transposition relative to first entry,
    - `d_i`: onset distance relative to previous entry,
    - `Dis_i`: distance from first entry,
    - `mod_i`: modification status,
    - `vox_i`: allocated voice index.
  - clarified that pair/triplet-local quantities use uppercase local indices (`I`, `J`, `K`) for window-relative relations.

## Remaining

### TODO-1: Remove dormant `NodeLimit` path
- Request: "delete nodelimit and all related code".
- Scope candidates: type unions, status presentation branches, tests, and any compatibility layers.
- Status: deferred because it is behavior-affecting and touches runtime/report compatibility surfaces.
