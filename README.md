# Stretto Assembly — Algorithm Architecture

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

Every stretto entry has these attributes:
- `d` — delay (in beats) from the previous entry
- `t` — transposition interval (semitones)
- `v` — assigned voice index
- `trunc` — truncation status
- `inv` — inversion status

The pipeline produces a set of **valid triplets** (consecutive groups of 3 entries), then assembles longer chains by chaining triplets that share their overlapping pair.

---

## Pipeline Stages

### Stage 1 — Valid Delay Triplets (cheapest filter)

Enumerate all combinations of three consecutive delays `(d₁, d₂, d₃)` that satisfy the delay rules from `STRETTO_RULES.md` simultaneously and as a unit, given the subject length `Sb`:

| Rule | Condition |
|------|-----------|
| **A.1 Global Uniqueness** | All delays `> Sb/3` must be distinct across the **entire chain**, not just adjacent pairs |
| **A.2 Half-length trigger** | If `d_{n-1} > Sb/2`, then `d_n < d_{n-1} − 0.5` |
| **A.3 Expansion recoil** | If `d_{n-1} > d_{n-2}` and `d_{n-1} > Sb/3`, then `d_n < d_{n-2} − 0.5` |
| **A.4 Post-truncation** | After a truncated entry, next delay contracts by ≥ 1 beat (unless `d_{n-1} < Sb/3`) |
| **A.5 Universal max** | `d_n ≤ 2/3 × Sb` for all entries |

**Start entries** (index 0) are valid if their delay is within the universal max.
**End entries** have relaxed rules: any delay `< Sb/3` is acceptable regardless of contraction direction.

The output of this stage is `validDelayTriplets: Set<(d₁, d₂, d₃)>`.

---

### Stage 2 — Valid Transposition Triplets

For each delay triplet from Stage 1, enumerate all combinations of three transposition intervals `(t₁, t₂, t₃)` that satisfy voice separation rules:

- **Neighbour ordering:** higher voice index must have lower or equal transposition (no voice crossing)
- **Bass–alto separation:** alto transposition must be ≥ bass transposition + 12 semitones
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

Global constraints (e.g. delay uniqueness across the full chain) are enforced here by tracking seen delay values as the chain grows, rejecting any triplet that would introduce a duplicate delay `> Sb/3`.

---

## Why This Architecture Is Correct

| Property | DFS-with-pruning (old) | Triplet assembly (correct) |
|----------|----------------------|--------------------------|
| Exhaustive | No — pruning can cut valid branches | Yes — all valid triplets are enumerated first |
| Global Uniqueness (A.1) | Broken — only checks adjacent delay | Enforced — tracked across full chain in Stage 5 |
| Constraint isolation | Mixed — rules scattered inline | Clean — each rule applied at exactly one stage |
| Performance | Unpredictable — search tree varies wildly | Predictable — precomputation cost is bounded |
| Debuggability | Hard — no intermediate state | Easy — each stage's output can be inspected |

---

## Files

| File | Role |
|------|------|
| `STRETTO_RULES.md` | Authoritative rule definitions — source of truth |
| `PROJECT_INTENT.md` | Architectural invariants |
| `strettoGenerator.ts` | Implementation — must follow the pipeline above |

**If `strettoGenerator.ts` contains a depth-first recursive `solve()` function as its primary chain search mechanism, it has been reverted to the wrong architecture.**
