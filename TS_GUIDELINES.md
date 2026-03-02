
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
