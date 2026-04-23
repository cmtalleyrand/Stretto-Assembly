# Investigation: semantics of `d_i`, `d_te_1`, `d_te_2`, and similarly named identifiers

## Scope and method

This document records a repository-wide inspection of identifiers matching:

- `d_i`
- `d_te_1`
- `d_te_2`
- similarly shaped symbols (`d_n`, `d_{i+1}`, `d_idx`, `delay*` aliases where the code comment ties them to the same semantic object)

Search command used:

```bash
rg -n "\\bd_i\\b|\\bd1\\b|\\bd2\\b|\\bd[0-9]+\\b|\\bd_[0-9]+\\b|\\bdi\\b" .
```

## Executive disambiguation

There are **three distinct semantic classes** behind these names:

1. **Mathematical delay variable (`d_i`)**
   - Meaning: delay of entry `e_i` relative to `e_{i-1}` (incremental, not absolute-from-origin).
   - Indexing convention: `i` is the absolute entry index in the chain (`e_0, e_1, ...`).
   - Domain: `i>=1`, `d_i >= 0`; `d_0` is sentinel/not-applicable.
   - Locations: architectural and rule documentation, canonical type commentary.

2. **Triplet-enumeration delays (`d_te_1`, `d_te_2`)**
   - Meaning: local aliases in triplet enumeration.
   - Mapping: `d_te_1 = A→B` delay, `d_te_2 = B→C` delay; absolute `A→C` is `d_te_1 + d_te_2`.
   - Locations: discovery UI loop, triplet helper utilities, generator precompute/assembly logic.

3. **Index variables named `d_idx` (non-musical by themselves)**
   - Meaning: iterator/index into delay arrays or delay dimension in flattened matrices.
   - Locations: canon search delay-batch loop, compatibility matrix indexing and tests.
   - Note: this is an implementation index name, not the canonical mathematical `d_i` symbol.

## Detailed findings

### 1) Canonical `d_i` semantics (normative meaning)

The canonical entry model defines `e_i = (d_i, t_i, v_i, inv_i, trunc_i)` and explicitly states that `d_i` is an **incremental delay** from predecessor, not an absolute offset. Absolute offsets are derived by prefix sums `s_i = Σ d_k`; inverse mapping is differencing `d_i = s_i - s_{i-1}`.

The runtime canonical type uses `delayBeatsFromPreviousEntry` to represent this same object, with index-0 sentinel semantics (`e0` carries zero sentinel and delay rules skip index 0).

### 2) `d_te_1` / `d_te_2` in triplet discovery (UI + helper)

Triplet discovery explicitly uses:

- `d_te_1`: delay from `e0` to `e1`
- `d_te_2`: relative gap from `e1` to `e2`
- absolute position of `e2` from `e0`: `d_te_1 + d_te_2`

Ordering modes:

- `tightening`: enforce `d_te_2 < d_te_1`
- `unconstrained`: allow all `d_te_2 <= maxDelay`

Hence `d_te_1`/`d_te_2` are not independent alternate semantics; they are concrete two-edge instantiations of the generic adjacent-delay variable family.

### 3) `d_te_1` / `d_te_2` in triplet generator internals

In triplet precomputation and extension:

- `const d_te_1 = p1.d` binds the first edge delay (into middle node B).
- `const d_te_2 = p2.d` binds the second edge delay (into node C).
- Transition keying uses `(vB, vC, d_te_1, d_te_2)`.
- Delay-shape gates and rules (A.2/A.5/A.4 in fallback path) evaluate predicates over `(d_te_1, d_te_2)`.
- Pair A→C overlap delay is computed as `dAC = d_te_1 + d_te_2`.

Therefore, the algorithm treats `(d_te_1, d_te_2)` as **adjacent incremental edges** in a 3-entry window, consistent with canonical `d_i` semantics.

### 4) Rule-level notation in `STRETTO_RULES.md`

Rule text uses symbolic forms like `d_n`, `d_{n-1}`, `d_{n-2}`, and `d_i` / `d_{i+1}` for contraction/expansion predicates. These are mathematical schema variables over adjacent-entry delays and correspond directly to the code-level adjacent delay ticks described above.

### 5) `d_idx` in canon search and matrix code (index role)

Two uses are purely indexing:

- `canonSearch.ts`: `for (let d_idx = 0; d_idx < delays.length; d_idx++)` where `d_idx` indexes candidate delay values (`delayBeats = delays[d_idx]`).
- `stretto-opt/compatMatrix.ts` and tests: `d_idx` is the coordinate in matrix dimension `D` and part of flatten/unflatten bijection.

These `d_idx` symbols are **array/dimension indices**, not delay magnitudes unless dereferenced through lookup (`delays[d_idx]`) or dimensional mapping.

## Cross-file semantic mapping

| Symbol in file | Effective meaning | Canonical equivalent |
|---|---|---|
| `d_i` (docs/rules) | delay of entry `i` from entry `i-1` | `delayBeatsFromPreviousEntry` |
| `d_te_1` (triplet code) | delay A→B (first edge of triplet window) | one instance of `d_i` |
| `d_te_2` (triplet code) | delay B→C (second edge of triplet window) | next instance `d_{i+1}` |
| `dAC = d_te_1 + d_te_2` | absolute A→C separation in same window | derived prefix-sum distance |
| `d_idx` (loops/matrix) | index into delay list or delay dimension | not a delay value by itself |

## Potential ambiguity hotspots

1. `StrettoChainOption.startBeat` comment mentions “relative to start … (or previous entry if chained logic…)”. This can be read ambiguously unless interpreted with conversion helpers.
2. `d_idx` naming can be visually conflated with `d_i`; semantically they differ (index vs value).

## Conclusion

No contradictory semantics were found. The codebase is internally consistent with the canonical interpretation:

- `d_i` = predecessor-relative incremental delay variable,
- `d_te_1`, `d_te_2` = concrete adjacent-delay aliases in triplet windows,
- `d_idx` = index variable whose meaning depends on lookup context.

The only risk is symbol-level ambiguity for readers, not an algorithmic contradiction in implementation.
