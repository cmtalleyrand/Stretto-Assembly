# TypeScript Development Guidelines

## Preventing Type Errors

Type errors occur when the **Type Definitions** (`types.ts`) and the **Code Logic** (`components/**/*.ts`) are out of sync. This project uses strict typing, meaning every property passed between components must be explicitly defined.

### 1. The "Types First" Workflow
When introducing a new feature (e.g., a new Harmonic Status):
1.  **STOP**: Do not write the logic yet.
2.  **DEFINE**: Update `types.ts` first. Add the new field or union type value.
    *   *Example:* changing `type: 'consonant'` to `type: 'consonant' | 'amber' | 'red'`.
3.  **IMPLEMENT**: Update the logic to generate this new data.
4.  **CONSUME**: Update the UI (React components) to handle the new data.

### 2. Common Pitfalls
*   **Union Mismatches:** Returning a string "dissonant_severe" when the type is `'dissonant'`.
    *   *Fix:* Add the new string to the Union Type definition.
*   **Missing Props:** Passing `pairDissonanceScore` to a component that hasn't defined it in its `Interface`.
    *   *Fix:* Update the Component's Props Interface.
*   **Implicit Any:** Creating a variable `const x = []` and pushing complex objects into it.
    *   *Fix:* Explicitly type it: `const x: MyType[] = []`.

### 3. Handling Enums and Switch Cases
If you change a Type Union (e.g., `HarmonicRegion['type']`), check every `switch` statement that uses it.
*   The `PianoRoll` color mapper is a frequent breaking point. Ensure it has a `case` for every new type value.

## Type Authority and Module Topology

### Authoritative Module
*   The authoritative shared-type module is **repository-root `types.ts`**.
*   All components, hooks, workers, and services must import shared models from root `types.ts` through the correct relative path (`../types`, `../../types`, etc.).

### `types.ts` vs `components/types.ts` Classification
The previous duplication was analyzed and classified as follows:

*   **Identical symbols:** the overlap set of exports that existed in both files and had matching intent (e.g., `TrackInfo`, `ConversionOptions`, `RawNote`, `StrettoError`).
*   **Divergent symbols:** `StrettoCandidate`, `ScoreLog`, `StrettoChainResult`, `StrettoSearchReport`, `StrettoSearchOptions`, and `StrettoConstraintMode` had schema drift between files.
*   **Orphaned (non-overlapping) symbols:** root `types.ts` contained additional canonical symbols not represented in `components/types.ts`, including canon search models and chain conversion utilities (`CanonicalStrettoChainEntry`, `fromLegacyChainOptions`, `CanonSearchOptions`, etc.). No symbols were unique to `components/types.ts`.

### Compatibility Policy
*   `components/types.ts` is now a **deprecated compatibility re-export** to root `types.ts`.
*   New code must not use `components/types.ts` as a source module.
*   Compatibility re-export is short-lived and can be removed after downstream migration is fully verified.
