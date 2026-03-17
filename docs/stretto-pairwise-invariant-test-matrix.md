# Pairwise Invariant Test Matrix (Unique Coverage Policy)

This document defines the **single-source assertion locations** for pairwise hard-policy invariants.

## Canonical test location

- `components/services/strettoDagTraversalTest.ts`

Rationale: the owning algorithms (`violatesPairwiseLowerBound`, `checkCounterpointStructure`, and `checkCounterpointStructureWithBassRole`) are implemented in `components/services/strettoGenerator.ts`, so the nearest stable test module is `strettoDagTraversalTest.ts`.

## Invariant-to-assertion mapping

1. **Dissonance-ratio rejection**
   - Asserted via `violatesPairwiseLowerBound(...)` with `dissonanceRatio > maxPairwiseDissonance`.

2. **Max dissonance-run rejection**
   - Asserted via `violatesPairwiseLowerBound(...)` with `maxDissonanceRunEvents > 2`.

3. **Sustained dissonance-duration rejection**
   - Asserted via `violatesPairwiseLowerBound(...)` with `maxDissonanceRunTicks > maxAllowedContinuousDissonanceTicks`.

4. **Bass-role-dependent P4 rejection**
   - Asserted via `checkCounterpointStructureWithBassRole(...)` where neutral scan is admissible and bass-qualified scan is rejected.

5. **Parallel perfect-motion policy**
   - Asserted via `checkCounterpointStructure(...)` by checking `hasParallelPerfect58` for true parallel P5/P8 motion and false for contrary motion / P4-only cases.

## Non-duplication rule

New tests for these invariants must demonstrate non-equivalent preconditions and postconditions relative to the canonical assertions above. Otherwise, extend the canonical module instead of adding a second location.
