# Codebase–Documentation Consistency Assessment (Consolidated)

## Objective

This assessment consolidates prior findings into a smaller set of first-order tasks, explicitly separating architecture-critical defects from secondary process concerns.

---

## The Correct Approach (Direct answer to task 1)

The correct approach is to treat **search correctness invariants** as the dominant objective and to make all other work subordinate to that objective. In concrete terms:

1. Preserve and harden staged triplet assembly + DAG traversal semantics as the primary chain-construction algorithm, with global uniqueness enforced incrementally at extension time.
2. Eliminate semantic ambiguity in the canonical entry model (`d_i` meaning and `d_0` encoding), because this model is the interface contract among generator, UI, and conversion utilities.
3. Prioritize runtime-validating tests for these invariants over broad tooling refactors.
4. Treat workflow/docs alignment (e.g., ABC-vs-MIDI framing) as a scoped governance update after search-model consistency is guaranteed.

This ordering minimizes risk of latent false positives/negatives in candidate acceptance and has the best expected correctness-per-unit-effort profile.

---

## Consolidated First-Order Tasks

### Task A — Canonical Semantics and Invariant Enforcement (Highest priority)

**Problem cluster addressed:**
- Canonical-doc vs runtime semantic drift for `d_0` / first-entry delay representation.
- Missing runtime enforcement of monotonic start offsets in legacy↔canonical conversion utilities.

**Evidence:**
- Canonical docs define `d_0` as non-applicable (`⊥`).
- Runtime canonical type currently encodes entry-0 delay as numeric zero.
- Conversion helpers compute delay by subtraction but do not enforce non-negative monotonic sequences.

**Execution plan:**
1. Choose one `e0` encoding convention and make it authoritative (nullability or sentinel-zero).
2. Update type-level contracts and conversion comments accordingly.
3. Add conversion-path invariant checks (reject negative delays / descending starts).
4. Ensure tests explicitly cover malformed sequence rejection and valid round-trip behavior.

**Complexity impact:**
- Conversion remains linear `O(n)` in chain length.
- Additional invariant checks add only constant-time per entry, preserving asymptotic complexity.

**Why first-order:**
A semantic contract mismatch in core data representation can invalidate pruning and scoring assumptions across modules.

---

### Task B — Search-Architecture Compliance and Regression Shield (Highest priority)

**Problem cluster addressed:**
- Architectural claims in project docs require durable protection against regressions toward DFS-like behavior or weakened stage gating.
- Existing tests exist but are fragmented and not consistently run via one command path.

**Evidence:**
- Design docs define staged assembly and stateful global uniqueness as normative behavior.
- Test files validate components of this behavior, but package scripts do not provide a single comprehensive invariant suite command.

**Execution plan:**
1. Define one authoritative test script for stretto invariants.
2. Include DAG traversal, timeout policy, and types conversion tests in that command.
3. Require this command in local verification and CI policy documentation.

**Complexity impact:**
- No algorithmic runtime change to search itself.
- Reduces operational complexity of validation by collapsing multiple manual paths into a deterministic single entry point.

**Why first-order:**
Without a regression shield, architecture correctness is non-stationary and can silently degrade.

---

## Consolidated Second-Order Tasks

### Task C — Product-Contract Documentation/UX Reconciliation (Second priority)

**Problem cluster addressed:**
- Project intent positions ABC as canonical source format, while current UI and ingestion flow are MIDI-first.

**Execution plan:**
1. Decision gate: either implement ABC-first source workflow or explicitly mark ABC-canonical as future state.
2. Align README, PROJECT_INTENT, and upload affordances to the chosen policy.

**Why second-order:**
This is governance and workflow framing; it does not directly alter chain-validity acceptance predicates.

---

### Task D — Extended diagnostics/UI observability improvements (Second priority)

**Problem cluster addressed:**
- Potential enhancements around stage-level observability and richer explainability are useful but not blocking for correctness.

**Execution plan:**
1. Expand reporting where needed after Task A/B completion.
2. Add UI diagnostics only after invariant guarantees are stable.

**Why second-order:**
Observability quality is valuable, but correctness invariants and regression enforcement dominate system risk.

---

## Revised Priority Conclusion

The prior decomposition over-weighted process/tooling framing in places. The corrected prioritization is:

1. **Task A + Task B (first-order, coupled):** canonical semantic consistency + invariant regression shield.
2. **Task C + Task D (second-order):** workflow-contract and diagnostics refinements.

This ordering is logically minimal: it first secures the acceptance function and state transition semantics, then addresses policy and presentation layers.
