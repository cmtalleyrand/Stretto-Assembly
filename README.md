# Stretto Assembly

## Objectives

The primary objective of stretto search and canon search is to find:
a) for complex subjects in ABC: typcial subjects are between 2 and 4 measures long, with 10-25 notes. MIDI inputs are not often used
b) the highest quality chains possible: criteria for quality are reflected in scoring, but the most important is disssonance as % of duration with simultaneities and % non-chord tones. As a rule of thumb good chains have less than 25% dissonance and no more than 10% of non-chord tones; acceptable chains no more than 35% dissonance and 25% NCTs; and anything over 50% dissonance is as good as useless
c) of the length desired by the user: chains 1 shorter than the desired length are acceptable but worth approximately 1/10 the value of a chain of the desired length; chains 2 shorter are of limited value (~1/100); anything shorter is effectively worthless.
d) within a reasonable time frame: ideally less than 30 seconds and no more than a minute, with no particular value to getting outputs in less than 15 seconds
e) For export to MIDI

Secondary objectives are:
a) to provide users a rich set of options to configure search
b) to present outputs attractively and informative
c) to provide musical analysis of inputs and outputs 
d) to provide analysis on app performance to enable continued optimisation 

---

## AI Assembly API Security

- The browser must call `POST /api/assembly` for AI stretto assembly generation.
- Provider credentials are server-only; set `GEMINI_API_KEY` in the server runtime environment.
- Do not expose provider credentials through client-side environment variables (`process.env.*` or `import.meta.env.VITE_*`) in production builds.

Counterpoint rules (including the P4/P5/P8 policy) are defined in `STRETTO_RULES.md`. This file covers the mandatory search architecture only.

---

# Algorithm Architecture

## Architecture: Bottom-Up Triplet Assembly

The implementation in `components/services/strettoGenerator.ts` is structured as a staged precompute-and-assembly pipeline. Correctness is defined by **invariants** over stage boundaries and frontier state, not by the presence or absence of any specific function name.

### Canonical entry representation (normative, retained by design)

\[
e_i = (d_i,\ t_i,\ v_i,\ inv_i,\ trunc_i)
\]

where:

- `d_i`: entry-local incremental delay parameter (beat-grid scalar) for `i>=1`; `d_0` is not applicable because `e_0` has no predecessor.
- `t_i`: transposition interval in semitones.
- `v_i`: assigned voice index.
- `inv_i`: inversion flag.
- `trunc_i`: truncation extent (zero means full-length).

Normalization identity:

- Define derived absolute starts by `s_0 = 0` and `s_i = Σ_{k=1..i} d_k` for `i>=1`.
- For legacy absolute-start inputs, recover incremental delays via `d_i = s_i - s_{i-1}`.

The formal domain and compatibility mappings are documented in `docs/stretto-entry-model.md`.

### Rule reference snapshot (authoritative source remains `STRETTO_RULES.md`)

The canonical rule source is `STRETTO_RULES.md`. The condensed rule matrix below is intentionally retained in README so architecture constraints are visible at the implementation entry point.

#### Delay-rule set (A-series)

| Rule | Condition |
|---|---|
| **A.1 Global Uniqueness** | All delays `> Sb/3` are unique across the chain (enforced incrementally during frontier expansion). |
| **A.2 Half-length trigger (OR)** | If `d_{n-1} >= Sb/2` **or** `d_n >= Sb/2`, then `d_n < d_{n-1}`. |
| **A.3 Expansion recoil** | If `d_{n-1} > d_{n-2}` and `d_{n-1} > Sb/3`, then `d_n < d_{n-2} − 0.5`. |
| **A.4 Post-truncation contraction** | After a truncated entry, next delay contracts by at least one beat unless `d_{n-1} < Sb/3`. |
| **A.5 Maximum contraction bound** | `d_{n-1} - d_n <= 0.25 * Sb`. |
| **A.6 Universal max delay** | `d_n ≤ 2/3 × Sb` for all entries. |

#### Transposition/voice-separation core constraints

| Rule | Voice pair | Minimum separation |
|---|---|---|
| 2A | Adjacent non-bass pair | `T(higher) ≥ T(lower)` |
| 2B | Tenor–bass adjacent pair | `T(tenor) ≥ T(bass) + 7` semitones |
| 3A | Distance-2 non-bass pair | `T(higher) ≥ T(lower) + 7` semitones |
| 3B | Alto–bass distance-2 pair | `T(alto) ≥ T(bass) + 12` semitones |
| — | Pair distance ≥3 voices | `T(higher) ≥ T(lower) + 12` semitones |

Gatekeeper constraint:

- No consecutive identical transpositions (`t_n ≠ t_{n-1}`).

### Control-flow primitives (actual implementation)

1. **Staged precompute**
   - Build fast lookup structures before traversal (transposition rule tables, compatibility matrix, and voice/transposition admissibility index).
   - Execute structural admissibility traversal before harmonic triplet indexing so later phases can use O(1) matrix lookups instead of repeated recomputation.

2. **Triplet filtering**
   - Enumerate adjacent pair combinations and derive candidate triplet shapes.
   - Apply triplet-level predicates as staged gates (delay-shape legality, pairwise compatibility presence, adjacency-separation checks, lower-bound dissonance constraints, parallel-perfect filters, voice-role admissibility, P4-bass-role constraints, and delay-context reachability).
   - Persist only accepted triplet shapes/records for downstream assembly.

3. **DAG assembly**
   - Assemble longer chains by extending from prevalidated triplet boundaries.
   - Use frontier-based expansion with key-based state merging in the bounded-depth phase, then depth-first continuation over surviving frontier states for deeper targets.
   - Reuse precomputed transition buckets keyed by boundary structure so expansion is linear in reachable edges from each frontier state.

   Frontier expansion (one step, illustrative):
   ```
   Frontier @ chain length 3 — state = (boundaryPairKey, depth, U):
     state A = (key1, 3, U={d2})        ← fewer used-delay slots
     state B = (key1, 3, U={d2, d4})    ← U_A ⊆ U_B, so B is dominated → prune B

   Expand state A → depth 4 (via precomputed transition bucket for key1):
     + via triplet boundary key2 → (key2, 4, U={d2, d3})
     + via triplet boundary key3 → (key3, 4, U={d2})
   ```
   U tracks high delays already used in the chain (for rule A.1 global uniqueness). A state is dominated — and pruned — when another state with the same key and depth has a subset of its used-delay set, because every extension reachable from the dominated state is also reachable from the dominator with no worse constraint burden.

4. **Auxiliary admissibility traversals**
   - Run dedicated admissibility traversals (`full` or `delay-variant-only`) that compute reachable structural states and populate admissible pair indices / delay-transition indices.
   - These traversals are auxiliary to the main DAG expansion but constrain the candidate space early, reducing downstream branching factor.

### Invariant-based architecture criteria

The architecture is considered correct when all of the following hold:

- **Stage-localized constraints:** each rule class is enforced in one designated stage (precompute, triplet filtering, or DAG expansion) instead of being redundantly scattered.
- **Incremental global enforcement:** frontier state carries sufficient summary information to reject globally-invalid extensions at edge evaluation time (monotone pruning), rather than deferring to an end-of-chain global filter.
- **Boundary-consistent assembly:** every extension is justified by precomputed boundary compatibility records; no extension bypasses the staged triplet admissibility gates.
- **Reportable progress semantics:** the worker/report path emits ordered stage progress labels (`pairwise`, `triplet`, `dag`) that correspond to the three execution bands above.

### Why this architecture is operationally stable

| Property | Invariant-backed staged pipeline |
|---|---|
| Constraint placement | Deterministic: each constraint class has a designated stage. |
| Global feasibility handling | Incremental at frontier expansion time, enabling early rejection. |
| Search complexity control | Reduced branching via admissibility precompute and triplet-index filtering. |
| Observability | Stage counters and telemetry are emitted from pairwise/triplet/DAG execution bands. |
| Refactor resilience | Validation depends on invariants, not function naming conventions. |

---

## Files

| File | Role |
|------|------|
| `STRETTO_RULES.md` | Authoritative rule definitions — source of truth |
| `SCORING_MECHANISM.md` | Scoring formula details (penalties, bonuses) |
| `docs/stretto-entry-model.md` | Canonical entry tuple definition + migration mapping |
| `components/services/strettoGenerator.ts` | Implementation of staged precompute, triplet filtering, DAG assembly, and admissibility traversals |

## Migration status (canonical model rollout)

The canonical tuple `(d_i, t_i, v_i, inv_i, trunc_i)` is now documented as the normative model. Runtime modules remain mixed while migration is in progress.

| Area | Status |
|---|---|
| Documentation (`README.md`, `docs/stretto-entry-model.md`) | Canonical-ready |
| Type surface (`types.ts::StrettoChainOption`) | Compatibility mode (legacy fields) |
| Search/generation (`components/services/strettoGenerator.ts`) | Compatibility mode (legacy fields + `variantIndices`) |
| UI rendering (`components/stretto/StrettoChainView.tsx`, `components/stretto/StrettoResultsList.tsx`) | Compatibility mode |

## Active vs. legacy analysis pathways

The intended production workflow is constrained to Stretto and Canon discovery surfaces. Legacy harmonic-report pathways remain in-repo strictly for backward compatibility and test coverage, and are not part of the normative operator path.

Detailed classification (with module-level rationale) is maintained in:

- `docs/active-vs-legacy-analysis-paths.md`

Deprecation intent:

- **Active** pathways should receive feature evolution and bug-fix priority.
- **Legacy** pathways are retained for compatibility/testing only and should not be used as design anchors for new behavior.
- Migration target is consolidation on Stretto pairwise discovery, Stretto chain search worker execution, Canon search, and their associated result displays.

## Test Tiering and Change-Type Mapping

The test scripts are partitioned by deterministic cost and failure-surface breadth to minimize unnecessary runtime while preserving regression guarantees.

### Script tiers

| Script | Purpose | Included checks |
|---|---|---|
| `npm run test` | Default deterministic traversal gate used for frequent local/CI execution. | Alias of `npm run test:stretto:dag:heavy` (`components/services/strettoDagTraversal.heavy.test.ts`). |
| `npm run test:integration` | Cross-module validation where search logic and in-app orchestration are jointly exercised. | `components/services/strettoIntegrationTest.ts`, `components/services/strettoPairwiseLogicCheck.ts`, `components/services/strettoInAppFunctionality.test.ts` |
| `npm run test:heavy` | Explicit high-cost traversal regression gate. | Alias of `npm run test:stretto:dag:heavy` (`components/services/strettoDagTraversal.heavy.test.ts`). |
| `npm run test:all` | Superset gate that composes baseline + integration + heavy tiers. | `npm run test && npm run test:integration && npm run test:heavy` |

### Change-type to test command mapping

| Change type | Minimum required command | Rationale |
|---|---|---|
| UI-only (rendering/layout/state wiring with unchanged search/scoring semantics) | `npm run test` | Verifies deterministic utility and proxy behavior that can be transitively affected by UI data-flow refactors. |
| Scoring logic (weights, penalties, ranking, compatibility scoring policy) | `npm run test && npm run test:integration` | Requires deterministic scoring regression plus integration-level validation of policy composition. |
| Traversal logic (DAG expansion, frontier pruning, chain assembly invariants) | `npm run test && npm run test:heavy` | Requires baseline deterministic checks plus heavy traversal and performance regression. |
| Precompute backend (parity tables, staged precompute, backend regression parity) | `npm run test:integration` | Integration tier includes backend regression parity and pairwise logic consistency checks. |
| API/server contract (`/api/assembly`, proxy translation/validation paths) | `npm run test && npm run test:integration` | Combines core deterministic proxy checks with integration pathways that exercise end-to-end orchestration. |
