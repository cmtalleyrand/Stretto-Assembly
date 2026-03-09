# Project Implementation Plan

## Phase 1: Data Structures & Segmentation Logic (Completed)
## Phase 2: Ornament Recognition Overhaul (Completed)
## Phase 3: Quantization Engine Overhaul (Completed)
## Phase 4: Structural Voice Separation & Stretto Discovery (Completed)

## Phase 5: Assembly Optimization & LLM Integration (In Progress)
*   [x] **Task 5.1:** Implement Fixed Entry Pivot logic for inversion consistency.
*   [x] **Task 5.2:** Professionalize Discovery Grid filters (Multi-select, numeric range).
*   [ ] **Task 5.3:** Refine Gemini Assembly prompts to respect advanced filtering context.
*   [ ] **Task 5.4:** Finalize multi-track MIDI export for complex chains.

## Phase 6: Mandatory Triplet-Assembly Architecture Completion (Revised)

### 6.0 Architectural Clarifications (Normative Inputs)
1. **A.1 Interpretation:** Global uniqueness is the chain-level rule; local uniqueness is the relevant pruning condition during triplet-set construction.
2. **Subject length `Sb`:** Compute from subject length after rest truncation.
3. **Search objective:** Hard cutover to the staged triplet architecture, with near-exhaustive traversal under bounded runtime.
4. **Coverage reporting:** On timeout, report explored-space coverage estimates rather than only binary timeout status.
5. **UI roadmap:** Pairwise diagnostics can be extended to triplet diagnostics in a second UI step.

### 6.1 Integrated Data Model + Stage Artifacts (Single inseparable implementation unit)
> Rationale: The staged algorithm and its observability are not separable; introducing one without the other prevents correctness auditing.

- Introduce explicit typed artifacts for each stage:
  - `validDelayTriplets`
  - `validTranspositionTriplets`
  - `pairwiseCompatibleTriplets`
  - `harmonicallyValidTriplets`
- Introduce canonical triplet keys and boundary-pair keys to support deterministic joins.
- Persist per-stage cardinalities and rejection counters in the search report contract.

**Exit criteria:** Every candidate transition from Stage 1→4 is traceable with deterministic counts.

### 6.2 Integrated Core Engine Replacement (Single inseparable implementation unit)
> Rationale: Replacing DFS while deferring global-rule enforcement would preserve known correctness defects.

- Replace recursive DFS `solve()` chain growth with DAG-based path extension over triplet nodes.
- Enforce A.1 global uniqueness during path extension using delay sets keyed by delays `> Sb/3`.
- Preserve local uniqueness checks during triplet-set generation for early pruning efficiency.
- Retain hard constraints A.2–A.5 in stage-appropriate locations; remove redundant inline DFS-era checks.
- Keep deterministic traversal ordering.

**Exit criteria:** No recursive DFS remains as primary chain constructor; chain generation is performed solely by staged triplet assembly + DAG traversal.

### 6.3 Integrated Near-Exhaustive Search Budgeting + Coverage Metrics (Single inseparable implementation unit)
> Rationale: Runtime controls and coverage metrics must be implemented together to make timeout behavior interpretable.

- Add bounded traversal controls (time budget and node/path expansion budgets).
- Track explored/expandable frontier statistics:
  - triplet nodes visited,
  - edges traversed,
  - frontier size at termination,
  - estimated completion ratio (lower/upper bounds where exact value is unavailable).
- Return stop reasons with quantitative coverage payload.

**Exit criteria:** Timeout results include a quantitative exploration report sufficient to distinguish shallow aborts from high-coverage near-complete runs.

### 6.4 Validation Suite for Architecture Invariants (Single inseparable implementation unit)
> Rationale: Build success is insufficient; correctness requires invariant-level tests aligned to changed logic paths.

- Add tests for:
  - A.1 global uniqueness (non-adjacent duplicate long-delay rejection),
  - admissibility of short-delay repeats where rules permit,
  - boundary-pair join correctness in DAG chaining,
  - parity of expected chain sets on a hand-enumerable micro fixture.
- Add timeout/coverage tests validating non-empty quantitative coverage output.

**Exit criteria:** Tests fail if staged artifacts, global uniqueness, or coverage reporting regress.

### 6.5 UI Phase 2: Extend Pairwise Analysis to Triplet Analysis
- Add triplet-level diagnostics pane reusing pairwise analysis UI patterns.
- Surface stage cardinalities and triplet rejection reasons for explainability.

**Exit criteria:** Users can inspect pairwise and triplet admissibility in the same analysis workflow.

### 6.6 Documentation Consolidation (post-engine cutover)
- Update `README.md`, `STRETTO_RULES.md`, and `PROJECT_INTENT.md` to reflect final implementation boundaries.
- Document that local uniqueness is a stage-level pruning heuristic while global uniqueness is enforced at chain assembly.

**Exit criteria:** Documentation semantics match runtime behavior with no ambiguity in A.1 scope.

## Assignable Task Board (ready for issue tracking)

Use this board to instantiate tickets directly. Each row is a minimally independent work package with explicit dependency constraints and acceptance criteria.

| ID | Title | Scope | Depends On | Est. | Acceptance Criteria |
|---|---|---|---|---:|---|
| P6-T01 | Define stage artifact types and canonical keys | Add typed structures for delay/transposition/harmonic triplet sets and join keys in `components/services/strettoGenerator.ts` and associated types in `types.ts`. | None | 1.5d | All Stage 1–4 artifacts are represented by explicit types; key serialization is deterministic and collision-free under property-order invariance. |
| P6-T02 | Add stage counters and rejection reason taxonomy | Extend `StrettoSearchReport` with per-stage survivor counts and categorized rejection counters. | P6-T01 | 1.0d | Search report exposes deterministic cardinalities for each stage and non-empty rejection taxonomy on realistic inputs. |
| P6-T03 | Implement Stage 1 delay-triplet generator with local uniqueness pruning | Build delay triplet generation using `Sb` after rest truncation and A.2–A.5 predicates, including local pruning semantics. | P6-T01 | 2.0d | Generator returns all admissible delay triplets over configured grid; rule checks pass fixture-level assertions. |
| P6-T04 | Implement Stage 2 transposition-triplet generator | Generate transposition triplets with neighbor ordering, bass-alto separation, and Gatekeeper B constraints. | P6-T01, P6-T03 | 2.0d | Output transposition triplets satisfy spacing and ordering constraints for all sampled fixtures. |
| P6-T05 | Implement Stage 3/4 harmonic filters | Apply pairwise compatibility and full-triplet harmonic validation over Stage 2 output. | P6-T01, P6-T04 | 2.0d | Stage 3 and Stage 4 produce strictly decreasing or equal candidate counts and preserve deterministic ordering. |
| P6-T06 | Replace DFS `solve()` with DAG-based chain assembly | Construct triplet DAG, perform iterative path extension to target length, and remove recursive `solve()` as primary constructor. | P6-T01, P6-T05 | 3.0d | No primary recursive DFS remains; generated chains are derived from boundary-pair joins only. |
| P6-T07 | Enforce A.1 global uniqueness in assembly | Track chain-level delays `> Sb/3` via set membership during path extension. | P6-T06 | 1.0d | Non-adjacent long-delay duplicates are rejected; permitted short-delay behavior is unchanged relative to rule definitions. |
| P6-T08 | Add bounded traversal controls | Add time and expansion budgets to DAG traversal and integrate termination logic. | P6-T06 | 1.0d | Traversal terminates deterministically under budget constraints and emits machine-readable stop reason. |
| P6-T09 | Add coverage metrics on timeout/exhaustion | Compute visited nodes, traversed edges, frontier size, and completion-ratio bounds. | P6-T08 | 1.5d | Timeout report includes quantitative exploration metrics sufficient to estimate residual search space. |
| P6-T10 | Invariant test suite for staged architecture | Add tests for A.1 global uniqueness, short-delay admissibility, boundary-pair correctness, micro-fixture parity, and coverage payload. | P6-T03..P6-T09 | 2.5d | Tests fail on rule regressions and pass on expected staged behavior for deterministic fixtures. |
| P6-T11 | UI extension: pairwise → triplet diagnostics | Extend analysis UI with triplet diagnostics and stage cardinality/rejection visualization. | P6-T02, P6-T05 | 2.0d | UI renders triplet diagnostics with stage counts and rejection reasons from report payload. |
| P6-T12 | Documentation alignment pass | Update `README.md`, `STRETTO_RULES.md`, and `PROJECT_INTENT.md` to match implemented semantics and report schema. | P6-T07, P6-T09, P6-T11 | 1.0d | Documentation is semantically isomorphic to runtime behavior; no rule ambiguity remains for A.1/local-vs-global scope. |

### Suggested execution order (critical path)
1. `P6-T01` → `P6-T03` → `P6-T04` → `P6-T05` → `P6-T06` → `P6-T07` → `P6-T08` → `P6-T09` → `P6-T10` → `P6-T12`
2. Run `P6-T11` in parallel after `P6-T02` and `P6-T05` land.

### Definition of Done for Phase 6
- All tasks `P6-T01`..`P6-T12` are complete.
- `P6-T10` invariant suite passes.
- Search report contains quantitative coverage metrics for timeout/exhaustion cases.
- No primary DFS chain constructor remains in `strettoGenerator.ts`.
