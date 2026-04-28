
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

#### Union Mismatches
Returning a value that isn't in the declared union — TypeScript catches this at compile time, but only if the type is declared first.

```typescript
// ❌ BAD: 'amber' not declared in the union — compile error
function getStatus(r: HarmonicRegion): 'consonant' | 'dissonant' {
    return r.isClean ? 'consonant' : 'amber';
}

// ✅ GOOD: extend the union in types.ts first, then return it
// In types.ts: type HarmonicStatus = 'consonant' | 'dissonant' | 'amber';
function getStatus(r: HarmonicRegion): HarmonicStatus {
    return r.isClean ? 'consonant' : 'amber';
}
```

#### Missing Props
Passing a prop that the component's interface doesn't declare yet.

```typescript
// ❌ BAD: dissonanceScore not in ChainViewProps — compile error at call site
interface ChainViewProps { chain: StrettoChainOption[]; }

// ✅ GOOD: add the prop to the interface first
interface ChainViewProps { chain: StrettoChainOption[]; dissonanceScore: number; }
function ChainView({ chain, dissonanceScore }: ChainViewProps) { /* ... */ }
```

#### Implicit Any
Untyped arrays that receive heterogeneous pushes silently become `any[]`.

```typescript
// ❌ BAD: entries inferred as any[]
const entries = [];
chain.forEach(e => entries.push({ beat: e.startBeat, pitch: e.transposition }));

// ✅ GOOD: explicit element type
const entries: { beat: number; pitch: number }[] = [];
chain.forEach(e => entries.push({ beat: e.startBeat, pitch: e.transposition }));
```

### 3. Handling Enums and Switch Cases
If you change a Type Union (e.g., `HarmonicRegion['type']`), check every `switch` statement that uses it.
*   The `PianoRoll` color mapper is a frequent breaking point. Ensure it has a `case` for every new type value.
