# Stretto Assembly — Algorithm Architecture

## 🚨 CRITICAL COUNTERPOINT POLICY (NON-NEGOTIABLE)

1. **Parallel perfect 4ths are always allowed.**
2. **Perfect 4ths are only contextually dissonant when the lower note is the global bass at that instant; otherwise they are treated as consonant.**
3. **Perfect 5th / octave parallels are invalid when either:**
   - They occur across two consecutive pair boundaries, or
   - Any such parallel occurs while both adjacent delays are `>= Sb/3` (i.e., neither delay is under one-third subject length).

## ⚠️ CRITICAL: DO NOT REVERT THE SEARCH ARCHITECTURE

This document defines the **mandatory, intended architecture** for the chain search algorithm.
The previous DFS-with-inline-pruning approach is **permanently retired** because it:
- Cannot guarantee exhaustiveness (valid chains are silently missed)
- Applies constraints locally (per-step) rather than globally (per-chain)
- Repeatedly fails to enforce the Global Uniqueness delay rule (STRETTO_RULES.md §A.1)

---

## The Correct Architecture: Bottom-Up Triplet Assembly

The algorithm must be implemented as a **staged bottom-up precomputation pipeline**, not a depth-first recursive search. Each stage filters candidates using the cheapest applicable rules first, so expensive checks are only applied to survivors.

### Conceptual model

Canonical entry representation (normative):

\[
e_i = (d_i,\ t_i,\ v_i,\ inv_i,\ trunc_i)
\]

where:

- `d_i`: entry-local incremental delay parameter (beat-grid scalar) for `i>=1`; `d_0` is not applicable because `e_0` has no predecessor
- `t_i`: transposition interval in semitones
- `v_i`: assigned voice index
- `inv_i`: inversion flag
- `trunc_i`: truncation extent (zero means full-length)

Important normalization identity:

- Define derived absolute start offsets by `s_0 = 0` and `s_i = Σ_{k=1..i} d_k` for `i>=1`; `s_i` is distance-from-origin, while `d_i` remains the local incremental delay parameter. For legacy absolute-start imports, recover `d_i` by `d_i = s_i - s_{i-1}` for `i>=1`.

See `docs/stretto-entry-model.md` for formal domains, constraints, and legacy-field mappings.

The pipeline produces a set of **valid triplets** (consecutive groups of 3 entries), then assembles longer chains by chaining triplets that share their overlapping pair.

---

## Pipeline Stages

### Stage 1 — Valid Delay Triplets (cheapest filter)

Enumerate all combinations of three consecutive delays `(d₁, d₂, d₃)` that satisfy the delay rules from `STRETTO_RULES.md` simultaneously and as a unit, given the subject length `Sb`:

| Rule | Condition |
|------|-----------|
| **A.1 Global Uniqueness (deferred enforcement target)** | All delays `> Sb/3` must be distinct across the **entire chain**. Stage 1 does not prove this globally; it only emits triplets that remain admissible for incremental uniqueness enforcement in Stage 5. |
| **A.2 Half-length trigger** | If `d_{n-1} > Sb/2`, then `d_n < d_{n-1} − 0.5` |
| **A.3 Expansion recoil** | If `d_{n-1} > d_{n-2}` and `d_{n-1} > Sb/3`, then `d_n < d_{n-2} − 0.5` |
| **A.4 Post-truncation** | After a truncated entry, next delay contracts by ≥ 1 beat (unless `d_{n-1} < Sb/3`) |
| **A.5 Universal max** | `d_n ≤ 2/3 × Sb` for all entries |
| **A.6 Adjacent transposition separation** | For every adjacent pair, `|t_i - t_{i+1}| ≥ 5` semitones (perfect fourth minimum). |
| **A.7 Transform adjacency prohibition** | Consecutive inversion entries are invalid, and consecutive truncated entries are invalid. |

**Start entries** (index 0) are valid if their delay is within the universal max.
**End entries** have relaxed rules: any delay `< Sb/3` is acceptable regardless of contraction direction.

The output of this stage is `validDelayTriplets: Set<(d₁, d₂, d₃)>`.

---

### Stage 2 — Valid Transposition Triplets

For each delay triplet from Stage 1, enumerate all combinations of three transposition intervals `(t₁, t₂, t₃)` that satisfy voice separation rules:

- **Neighbour ordering:** higher voice index must have lower or equal transposition (no voice crossing)
- **Bass–alto separation:** alto transposition must be ≥ bass transposition + 12 semitones
- **Adjacent transposition minimum distance:** `|t_n - t_{n-1}| >= 5` semitones (perfect fourth lower bound)
- **No consecutive inversion forms** and **no consecutive truncation forms**

Implementation note: this transposition-distance gate is enforced in the pairwise precomputation keyspace (relative transposition `Δt`), so candidates with `|Δt| < 5` are rejected before structural/harmonic scans.

The output is `validTranspositionTriplets: Set<(d₁,d₂,d₃, t₁,t₂,t₃)>` with provisional voice assignments.

---

### Stage 3 — Pairwise Harmonic Check

For each (delay, transposition) triplet, check every **overlapping pair** of entries for harmonic admissibility using the precomputed `compatTable`. A pair fails if the notes that sound simultaneously produce a combination absent from the compat table.

This is the same compatibility table already built by the existing code — it just needs to be applied at the pair level during precomputation, not inline during DFS.

---

### Stage 4 — Triplet-Level Harmonic Check

For surviving pairs, check the **full triplet overlap** (all three entries sounding simultaneously where their time windows intersect). Apply dissonance and voice-leading rules to the three-voice texture.

The output is `validTriplets: Map<tripletKey, TripletData>`.

---

### Stage 5 — Chain Assembly

Assemble chains of length `N` by joining valid triplets that share their overlapping boundary pair.
Operationally, Stage 5 evaluates **candidate extensions**: for a frontier node representing partial chain `e_0..e_k`, each extension is one admissible `(delay, transposition, variant, voice)` tuple that proposes `e_{k+1}` and is accepted only if all pair/triplet/global invariants remain true.

```
Triplet A covers entries [i, i+1, i+2]
Triplet B covers entries [i+1, i+2, i+3]
A and B are compatible if their shared pair (i+1, i+2) matches exactly.
```

This is graph traversal on a DAG of triplets — it is exhaustive and guaranteed correct because every constraint was enforced in the precomputation stages.

Global constraints (especially A.1 delay uniqueness) are enforced here as an **incremental invariant**, not an ex-post validation pass.

### Stage 5A — Incremental global uniqueness state

During DAG traversal, every frontier state carries an explicit uniqueness accumulator for delays `> Sb/3`.

Conceptually (minimal model), uniqueness feasibility depends on:

\[
\text{state}_{min} = (\text{boundaryPairKey},\ i,\ U)
\]

where `U` is the set (or bitset over quantized delay bins) of already-used high delays.

In the current branch, the **implemented merge/dedup key is intentionally richer** than `state_min` and includes additional feasibility dimensions:

- chain structural signature (`getChainSignature`),
- ordered boundary signature (`toOrderedBoundarySignature`),
- voice re-entry clocks (`voiceEndTimesTicks`),
- quota counters (`nInv`, `nTrunc`, `nRestricted`, `nFree`),
- high-delay uniqueness set (`usedLongDelays`).

Formally, implementation key:

\[
\text{state}_{impl} = (\text{chainSig},\ \text{boundarySig},\ \text{voiceEndTimes},\ \text{quotas},\ U)
\]

This is encoded by `getDagNodeKey` in `strettoGenerator.ts`.

When appending a candidate successor triplet that contributes new delay `d_new`:

- if `d_new <= Sb/3`: extension is uniqueness-neutral,
- if `d_new > Sb/3` and `d_new ∉ U`: extend and update `U ← U ∪ {d_new}`,
- if `d_new > Sb/3` and `d_new ∈ U`: reject immediately.

This makes uniqueness checking `O(1)` average-time per extension with hash-set membership (or worst-case `O(1)` deterministic with fixed-grid bitset indexing), and avoids generating invalid full chains before rejection.

### Stage 5B — Dominance pruning on equivalent boundaries (conceptual)

For fixed `(boundaryPairKey, i)`, if two frontier states have uniqueness sets `U1` and `U2` with `U1 ⊆ U2`, then state `(boundaryPairKey, i, U2)` is dominated and can be pruned because any continuation valid from `U2` is also valid from `U1`.

Note: the current implementation performs deterministic DAG deduplication with `state_impl`; subset-dominance pruning over `(boundaryPairKey, i, U)` remains an optimization target rather than an active pass.

---

## Why This Architecture Is Correct

| Property | DFS-with-pruning (old) | Triplet assembly (correct) |
|----------|----------------------|--------------------------|
| Exhaustive | No — pruning can cut valid branches | Yes — all valid triplets are enumerated first |
| Global Uniqueness (A.1) | Broken — only checks adjacent delay | Enforced incrementally at each Stage-5 extension via stateful membership checks |
| Constraint isolation | Mixed — rules scattered inline | Clean — each rule applied at exactly one stage |
| Performance | Unpredictable — search tree varies wildly | Predictable — precomputation cost is bounded |
| Debuggability | Hard — no intermediate state | Easy — each stage's output can be inspected |

---

## Files

| File | Role |
|------|------|
| `STRETTO_RULES.md` | Authoritative rule definitions — source of truth |
| `PROJECT_INTENT.md` | Architectural invariants |
| `docs/stretto-entry-model.md` | Canonical entry tuple definition + migration mapping |
| `strettoGenerator.ts` | Implementation — must follow the pipeline above |

**If `strettoGenerator.ts` contains a depth-first recursive `solve()` function as its primary chain search mechanism, it has been reverted to the wrong architecture.**

---

## Migration status (canonical model rollout)

The canonical tuple `(d_i, t_i, v_i, inv_i, trunc_i)` is now documented as the normative model. Runtime modules remain mixed while migration is in progress.

| Area | Status |
|---|---|
| Documentation (`README.md`, `docs/stretto-entry-model.md`) | Canonical-ready |
| Type surface (`types.ts::StrettoChainOption`) | Compatibility mode (legacy fields) |
| Search/generation (`components/services/strettoGenerator.ts`) | Compatibility mode (legacy fields + `variantIndices`) |
| UI rendering (`components/stretto/StrettoChainView.tsx`, `components/stretto/StrettoResultsList.tsx`) | Compatibility mode |
