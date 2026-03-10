# Phase 6 Implementation Intent and Clarification Matrix (Directive-Resolved Revision)

## Purpose

This document specifies the implementation architecture for **Phase 6: Mandatory Triplet-Assembly Architecture Completion**. It encodes reviewer directives as normative decisions, defines data structures and pruning order, and states complexity/performance implications for each stage.

## 1. Normative Decisions Incorporated from Review (Points 1–10)

1. **Immediate rejection from pairwise dissonance lower bounds is mandatory.**
   - If pairwise metadata proves that any triplet composition must violate dissonance-duration constraints, the candidate is rejected without triplet harmonic analysis.
2. **Fourths are rule-active, not diagnostic-only.**
   - Fourth detection participates directly in admissibility logic according to bass-context-sensitive dissonance rules.
3. **Voice crossing is always admissible and always annotated.**
   - Crossing metadata exists to optimize bass inference and therefore enable constant-time/low-cost pruning shortcuts in specific non-crossing contexts.
4. **Voice availability boundary question rationale (resolved).**
   - The prior question existed only to avoid implementing an incorrect temporal inequality in the absence of an explicit formal expression in code comments. Current intent is to implement the exact stated rule: a voice may accept a new entry from the final half-beat of its previous entry onward.
5. **Transformation maxima source must come from the current codebase/rules, not speculative prompts.**
   - Existing constraints are read from runtime option schema and current generator predicates before introducing new constants.
6. **Budget semantics confirmed.**
   - Continue exploring while wall-clock time remains; node/path budgets are policy controls for scheduling diversity, not hard-stop truncation by default.
7. **Diversity objective priority confirmed.**
   - Delay-pattern diversity has priority; depth is not a diversity axis because maximum feasible depth should always be pursued.
8. **Coverage semantics clarified.**
   - Coverage means quantitative progress over the expandable search space (nodes/edges/frontier classes), not UI or test coverage.
9. **Schema-compatibility question rewritten clearly.**
   - Decision needed only if downstream consumers external to the in-repo UI parse `StrettoSearchReport`; otherwise a synchronized in-phase schema upgrade is preferred.
10. **Near-exhaustive labeling question rewritten clearly.**
   - If categorical labels are desired, define an explicit numeric threshold; otherwise emit raw quantitative coverage metrics only.

---

## 2. Execution Strategy and Dependency Order

1. **Contract/schema pass**: triplet artifacts, key serialization, report payload extensions.
2. **Generation pass**: delay and transposition generation with cheap structural predicates.
3. **Pairwise metadata pass**: pairwise compatibility + dissonance-run extraction + fourth/crossing metadata.
4. **Pairwise-derived pre-pruning pass**: immediate rejection from provable lower-bound violations.
5. **Triplet harmonic pass**: expensive full triplet analysis on survivors only.
6. **DAG assembly pass**: deterministic join traversal replacing DFS as primary constructor.
7. **Traversal policy pass**: time-hard/other-soft policy with delay-pattern diversity scheduling.
8. **Validation and diagnostics pass**: invariant tests + UI/report observability.

This sequencing maximizes low-cost pruning before expensive harmonic checks.

---

## 3. Data Model and Metadata Schema

### 3.1 Canonical keys

- `TripletKey`: canonical tuple key for `(delayTriplet, transpositionTriplet, variantIndices)`.
- `BoundaryPairKey`: canonical tuple key for DAG join boundaries.

Serialization is fixed-position tuple encoding to guarantee deterministic ordering and collision-free joins under property-order variance.

### 3.2 Stage artifacts

- `validDelayTriplets`
- `validTranspositionTriplets`
- `pairwiseCompatibleTriplets`
- `harmonicallyValidTriplets`

Every record carries source identifiers, canonical key, predicate outcomes, and metadata references.

### 3.3 Mandatory metadata

1. **Fourth metadata (rule-active)**
   - Track fourth simultaneities and whether they are dissonant under inferred bass context.
2. **Crossing metadata (optimization-active)**
   - Record crossing flags and ordering state so that non-crossing intervals can infer bass from voice labels without global pitch scan.
3. **Voice availability metadata**
   - Store per-voice availability windows and enforce re-entry eligibility from previous-entry final half-beat onward.
4. **Transformation metadata**
   - Store inversion/truncation flags and transposition class/magnitude with predicate checks against in-code constraints.

### 3.4 Search report fields

`StrettoSearchReport.stats` extension targets:

- stage cardinalities and rejection counters,
- pairwise pre-pruning effectiveness counts,
- traversal metrics: `nodesVisited`, `edgesTraversed`, `frontierSize`,
- coverage metrics over expandable search space,
- stop reason + termination context.

All counters are **O(1)** per update.

---

## 4. Pruning-First Algorithm Design

### 4.1 Stage 1: Delay triplets

- Compute `Sb` after rest truncation.
- Enumerate delays on half-beat grid and apply structural predicates immediately.

Complexity before pruning: **O(D^3)**.

### 4.2 Stage 2: Transposition triplets

- Use transposition pools from existing code constants/options.
- Apply inversion/truncation/transposition predicates during generation, not post hoc.

Complexity: **O(T * P)**.

### 4.3 Stage 3: Pairwise compatibility + dissonance-run metadata

For each pairwise candidate, compute and cache:

- dissonant onset positions,
- contiguous dissonance run lengths,
- fourth flags,
- crossing-aware bass hints,
- pairwise compatibility verdict.

### 4.4 Stage 3.5: Immediate pairwise-derived triplet rejection

Given pairwise metadata for a prospective triplet join:

- derive a lower bound on triplet dissonance-run length,
- if lower bound already exceeds admissible maximum, reject immediately,
- do not run full triplet harmonic analysis on rejected candidates.

This is a sound pruning transformation because rejection follows from a proven lower bound, not heuristic scoring.

### 4.5 Stage 4: Full triplet harmonic validation

Run full harmonic analysis only on non-rejected survivors from Stage 3.5.

### 4.6 Deterministic monotonicity invariant

`|Stage1| >= |Stage2| >= |Stage3| >= |Stage3.5 survivors| >= |Stage4|`

---

## 5. DAG Assembly, Uniqueness, and Availability

1. Replace recursive DFS `solve()` as primary construction path with deterministic DAG traversal.
2. Enforce A.1 global uniqueness using set membership for delays `> Sb/3` during path extension (**O(1)** expected).
3. Enforce voice-availability windows during edge validation (including final-half-beat re-entry rule).

---

## 6. Exploration Policy and Coverage

### 6.1 Budget semantics

- Time budget: hard stop.
- Node/path budgets: soft scheduling policies by default.
- Scheduling objective: prioritize delay-pattern diversity while always pursuing maximum reachable depth.

### 6.2 Coverage definition (explicit)

Coverage quantifies explored proportion of **expandable search state**, not just visited-node count. Report:

- absolute counts: visited nodes, traversed edges, frontier size,
- frontier composition by delay-pattern classes,
- percentage estimates relative to expandable state envelope when estimable.

---

## 7. Codebase-Constrained Implementation Notes (Point 5)

Based on current repository state:

1. Transposition generation currently derives from `INTERVALS.TRAD_TRANSPOSITIONS` plus optional `INTERVALS.THIRD_SIXTH_TRANSPOSITIONS` in `strettoGenerator.ts`.
2. Runtime search options currently include inversion/truncation/third-sixth controls in `StrettoSearchOptions` (`types.ts`), but no explicit standalone `maxTranspositionInterval` option yet.
3. Existing report schema already exposes optional `stageStats` and core stop reasons in `StrettoSearchReport`.

Therefore, Phase 6 implementation should first reuse these existing structures and extend them incrementally rather than introducing disconnected configuration surfaces.

---

## 8. Validation Plan (Focused Tests)

1. Pairwise metadata extraction test (dissonance runs, fourth detection, crossing flags).
2. Immediate lower-bound rejection test (triplet rejected without Stage-4 evaluation).
3. Voice-availability enforcement test (final-half-beat re-entry boundary).
4. Transformation predicate test (inversion/truncation/transposition constraint application).
5. A.1 global uniqueness test for long delays.
6. Soft-budget behavior test (no premature termination while time remains).
7. Coverage payload test (non-empty quantitative metrics on timeout/exhaustion).

Each test is directly aligned to a modified code path.

---

## 9. Resolved Policy Decisions (Finalized)

The remaining decisions are now fully resolved:

1. **External schema consumers**
   - None. No systems external to this repository consume `StrettoSearchReport`; therefore schema evolution can be synchronized with in-repo UI updates without external compatibility constraints.
2. **Coverage percentage precision**
   - Use 1 percentage point precision for any reported percentages.
3. **Near-exhaustive policy**
   - Emit raw coverage metrics only (no categorical `near-exhaustive` label).
   - Operational rule: if a run is close to completion at timeout, extend execution by an additional 10 seconds before final termination.

