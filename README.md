# Stretto Assembly — Algorithm Architecture

Counterpoint rules (including the P4/P5/P8 policy) are defined in `STRETTO_RULES.md`. This file covers the mandatory search architecture only.

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
| **A.2 Half-length trigger (OR form)** | If `d_{n-1} >= Sb/2` **or** `d_n >= Sb/2`, then `d_n < d_{n-1}` |
| **A.3 Expansion recoil** | If `d_{n-1} > d_{n-2}` and `d_{n-1} > Sb/3`, then `d_n < d_{n-2} − 0.5` |
| **A.4 Post-truncation** | After a truncated entry, next delay contracts by ≥ 1 beat (unless `d_{n-1} < Sb/3`) |
| **A.5 Maximum contraction bound** | `d_{n-1} - d_n <= 0.25 * Sb` |
| **A.6 Universal max** | `d_n ≤ 2/3 × Sb` for all entries |

**Start entries** (index 0) are valid if their delay is within the universal max.
**End entries** have relaxed rules: any delay `< Sb/3` is acceptable regardless of contraction direction.

The output of this stage is `validDelayTriplets: Set<(d₁, d₂, d₃)>`.

---

### Stage 2 — Valid Transposition Triplets

For each delay triplet from Stage 1, enumerate all combinations of three transposition intervals `(t₁, t₂, t₃)` that satisfy voice separation rules (applied to all temporal pairs, not only simultaneous ones):

| Rule | Voice pair | Minimum separation |
|------|-----------|-------------------|
| 2A | Adjacent non-bass (e.g. soprano–alto, alto–tenor) | T(higher) ≥ T(lower) |
| 2B | Tenor–bass (lowest adjacent pair) | T(tenor) ≥ T(bass) + 7 semitones |
| 3A | Dist-2 non-bass (e.g. soprano–tenor) | T(higher) ≥ T(lower) + 7 semitones |
| 3B | Alto–bass (lowest dist-2 pair) | T(alto) ≥ T(bass) + 12 semitones |
| — | Any pair 3+ voice-steps apart | T(higher) ≥ T(lower) + 12 semitones |

- **No consecutive same transposition** (Gatekeeper B: `t_n ≠ t_{n-1}`)

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

Assemble chains of length `N` by joining valid triplets that share their overlapping boundary pair:

```
Triplet A covers entries [i, i+1, i+2]
Triplet B covers entries [i+1, i+2, i+3]
A and B are compatible if their shared pair (i+1, i+2) matches exactly.
```

This is graph traversal on a DAG of triplets — it is exhaustive and guaranteed correct because every constraint was enforced in the precomputation stages.

Global constraints (especially A.1 delay uniqueness) are enforced here as an **incremental invariant**, not an ex-post validation pass.

**Voice assignment** (`v_i`) is deferred to a post-search CSP step: after a chain reaches target length, a backtracking CSP assigns voice indices to all entries, enforcing Rules 2A/2B/3A/3B across all temporal pairs, §C re-entry, and P4 bass-role constraints. Chains for which no valid voice assignment exists are discarded. The DAG key does not include voice state, enabling node merging across different voice configurations of the same harmonic content.

### Stage 5A — Incremental global uniqueness state

During DAG traversal, every frontier state carries an explicit uniqueness accumulator for delays `> Sb/3`:

\[
\text{state} = (\text{boundaryPairKey},\ i,\ U)
\]

where `U` is the set (or bitset over quantized delay bins) of already-used high delays.

When appending a candidate successor triplet that contributes new delay `d_new`:

- if `d_new <= Sb/3`: extension is uniqueness-neutral,
- if `d_new > Sb/3` and `d_new ∉ U`: extend and update `U ← U ∪ {d_new}`,
- if `d_new > Sb/3` and `d_new ∈ U`: reject immediately.

This makes uniqueness checking `O(1)` average-time per extension with hash-set membership (or worst-case `O(1)` deterministic with fixed-grid bitset indexing), and avoids generating invalid full chains before rejection.

### Stage 5B — Dominance pruning on equivalent boundaries

For fixed `(boundaryPairKey, i)`, if two frontier states have uniqueness sets `U1` and `U2` with `U1 ⊆ U2`, then state `(boundaryPairKey, i, U2)` is dominated and can be pruned because any continuation valid from `U2` is also valid from `U1`.

This converts global uniqueness from a late filter into a low-cost, monotone feasibility constraint during assembly.

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
| `SCORING_MECHANISM.md` | Scoring formula details (penalties, bonuses) |
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

---

## Test entrypoints

- Canonical regression command: `npm test`.
- Resolution: `npm test` delegates to `npm run test:stretto:active` in `package.json`.
- Inclusion criterion: only test files executed by `test:stretto:active` are treated as mandatory regression gates (`ACTIVE`).
- Diagnostic criterion: files intentionally excluded from `test:stretto:active` are archived as non-test-suffix diagnostics and run only on demand (for example, `npm run diagnose:stretto:pairwise-logic`).
- File-level classification is tracked in `docs/test-inventory.md`.
