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

## Pipeline Stages (Authoritative Order from `PROJECT_PLAN.md` §6.0A)

The stage order below is normative and supersedes earlier informal descriptions. Candidate transitions are enumerated **only after** pairwise and triplet feasibility artifacts are established.

1. **Pairwise dissonance precompute (artifact stage).**
   - Compute reusable pairwise dissonance over canonical pair-relation keys of adjacent entries.
   - Key domain includes adjacent-entry relation terms and `d_{i+1}`; it excludes predecessor delay `d_i` by invariance.
2. **Pair-local predicate stage.**
   - Apply delay-domain and start-delay boundary predicates.
   - Apply repeat-whitelist semantics and derive local forward-budget payload.
3. **Triplet-local predicate stage.**
   - Evaluate voicing and delay rules requiring two adjacent pair relations.
4. **Triplet dissonance stage.**
   - Evaluate A–C dissonance checks only when temporal overlap exists.
5. **Transition enumeration stage.**
   - Enumerate candidate transitions strictly from fully feasible triplet artifacts.
6. **Global-lineage stage.**
   - During path extension, enforce global constraints (notably A.1 long-delay uniqueness).
7. **State propagation/cache stage.**
   - Cache accepted frontier state and propagate forward-budget payload deterministically.

### Implementation clarifications (aligned to project plan)

- Adjacent-transposition separation (`|t_i - t_{i+1}| >= 5`) is pairwise and is therefore enforced in pairwise precompute (`Δt` domain) before structural scans.
- Transform adjacency prohibition (no consecutive inversion; no consecutive truncation) is enforced at extension time using predecessor variant state.
- Stage-5 “candidate extension” means one proposed successor tuple `(delay, transposition, variant, voice)` appended to a frontier node.

### Stage-5 incremental uniqueness invariant

During DAG traversal, frontier state carries a high-delay set `U` for delays `> Sb/3`:

\[
\text{state} = (\text{boundaryPairKey},\ i,\ U)
\]

Extension semantics:

- if `d_new <= Sb/3`: uniqueness-neutral,
- if `d_new > Sb/3` and `d_new ∉ U`: accept and update `U ← U ∪ {d_new}`,
- if `d_new > Sb/3` and `d_new ∈ U`: reject immediately.

This yields `O(1)` average-time uniqueness checks per extension with hash membership.

---

## Why This Architecture Is Correct

| Property | DFS-with-pruning (old) | Triplet assembly target (Phase 6) |
|----------|----------------------|--------------------------|
| Exhaustive | No — pruning can cut valid branches | Target property under staged completion and bounded runtime budgets |
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
