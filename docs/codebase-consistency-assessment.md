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

### Task A — Canonical Semantics and Invariant Enforcement (RESOLVED)

**Resolution:** Sentinel-zero is the authoritative convention for `d_0`.

**Changes made:**
- `CanonicalStrettoChainEntry` JSDoc updated to explicitly document `delayBeatsFromPreviousEntry = 0`
  as a sentinel value for `e0`, with a note that rule evaluators must skip index 0 when applying
  delay-based constraints (A.2–A.6).
- `fromLegacyChainOptions` now throws on descending `startBeat` sequences (negative implied delays),
  enforcing the monotone non-decreasing invariant at the conversion boundary.
- Test coverage added in `strettoTypesConversionTest.ts` for malformed sequence rejection.
- `transpositionSemisFromE0` renamed to `transpositionSemitones` throughout to remove the misleading
  `FromE0` suffix (each entry's transposition is an absolute pitch shift, not relative to e0's value).

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

### Task C — Product-Contract Documentation/UX Reconciliation (CLOSED — not a discrepancy)

**Finding:** The UI makes ABC the primary source format. The ingestion path in `abcBridge.ts`
(`parseSimpleAbc`) handles ABC input, while `midiAbc.ts` handles MIDI→ABC export. This is
consistent with `PROJECT_INTENT.md`. The earlier assessment over-read surface-level signals
(dedicated MIDI hooks, `input.mid` default filename) as implying MIDI primacy; the actual
user-facing upload flow is ABC-first.

**No action required.** `PROJECT_INTENT.md` and the implementation are aligned on this point.

---

### Task D — Extended diagnostics/UI observability improvements (Second priority)

**P6-T09 status:** Coverage metrics are already implemented in `strettoGenerator.ts`.
`StrettoSearchReport.stats.coverage` is populated with `nodeBudgetUsedPercent`,
`completionRatioLowerBound`, `frontierSizeAtTermination`, and related fields. P6-T09 is complete.

**Remaining scope:**
- UI diagnostics panel (P6-T11) is deferred and can be added after Task B invariant suite is stable.
- Stage-level observability beyond current `stageStats` may be expanded as needed.

---

## Revised Priority Conclusion

The prior decomposition over-weighted process/tooling framing in places. The corrected prioritization is:

1. **Task A + Task B (first-order, coupled):** canonical semantic consistency + invariant regression shield.
2. **Task C + Task D (second-order):** workflow-contract and diagnostics refinements.

This ordering is logically minimal: it first secures the acceptance function and state transition semantics, then addresses policy and presentation layers.
