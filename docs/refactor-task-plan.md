# Refactor Task Plan (Current Agreed Scope)

This document records the refactor tasks currently agreed in discussion, with dependency order and execution intent.

## Objective

Reduce monolithic coupling in the stretto and MIDI orchestration paths by:

1. enforcing single canonical musical semantics,
2. decomposing broad state/control hooks into bounded domains,
3. preserving behavioral correctness with targeted tests.

## Task Set

### T1. Canonicalize strong-beat semantics (S1)

- **Decision:** `S1` is canonical.
- **Meaning:** Use the metric-aware strong-beat semantics (including compound-meter behavior and normalized modular timing handling) as the only production definition.
- **Action:** Remove non-canonical implementations and route all call-sites to one shared implementation.
- **Reasoning:** Multiple implementations create semantic drift risk (`∃x: f(x) ≠ g(x)`), which increases latent defect probability in scoring/search consistency.

### T2. Canonicalize pitch inversion semantics

- **Decision:** Use the theoretically correct inversion implementation; remove heuristic local variants.
- **Action:** Delete local inversion helpers in UI reconstruction paths and use one shared inversion function everywhere.
- **Reasoning:** Duplicate inversion logic increases divergence risk and violates single-source-of-truth for tonal transformation rules.

### T3. Split `useMidiController` into domain reducers

- **Action:** Partition current wide state topology into reducer slices:
  - `midiSessionState` (file/tracks/events lifecycle),
  - `conversionSettingsState`,
  - `analysisUiState`.
- **Action:** Replace imperative reset chains with typed reducer actions (`FULL_RESET`, `PARTIAL_RESET`, etc.).
- **Reasoning:** Current update reasoning is effectively O(n) in number of independently managed state fields; reducer partitioning bounds transition reasoning to slice-local action handlers.

### T4. Add/adjust germane tests for each changed path

- **For T1:** strong-beat tests over representative meter/time cases.
- **For T2:** inversion equivalence tests for candidate reconstruction paths.
- **For T3:** reducer transition and reset-invariant tests.
- **Reasoning:** Build success is necessary but insufficient; each changed logic path requires direct behavioral verification.

## Dependency Graph

- `T1` and `T2` can execute in parallel if they touch disjoint files.
- `T3` should start after semantic canonicalization decisions (`T1`, `T2`) are fixed, so reducer actions do not encode obsolete rules.
- `T4` is incremental and should run with each task, plus a final regression pass.

## Definition of Done

1. Exactly one production strong-beat implementation remains.
2. Exactly one production inversion implementation remains.
3. `useMidiController` responsibilities are decomposed into domain reducers with explicit reset actions.
4. Relevant tests pass for each modified logic path.
