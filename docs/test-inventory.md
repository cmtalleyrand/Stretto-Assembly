# Test Inventory (`components/stretto`, `components/services`)

Canonical command: `npm test` (alias of `npm run test:stretto:active`).

Inclusion rule for `ACTIVE`: file is executed directly by canonical command and is therefore part of the regression signal.

| File | Label | Rationale |
|---|---|---|
| `components/stretto/harmonicRegionDiagnosticsTest.ts` | ACTIVE | Asserts dissonance-region audit counters and maximum contiguous dissonance run semantics. |
| `components/stretto/searchStatusTest.ts` | ACTIVE | Asserts terminal-heading derivation and diagnostics-string content from search stats. |
| `components/stretto/selectionPolicy.test.ts` | ACTIVE | Asserts hard pairwise policy admission and pruning behavior for candidate selection. |
| `components/services/midiSpelling.test.ts` | ACTIVE | Asserts MIDI spelling/interval formatting invariants. |
| `components/services/strettoTypesConversionTest.ts` | ACTIVE | Asserts bidirectional canonical↔legacy conversion and invalid-sequence rejection. |
| `components/services/pairwisePivotSearchTest.ts` | ACTIVE | Asserts pivot search admissibility and traversal behavior in pairwise stage. |
| `components/services/strettoPairwisePolicyTest.ts` | ACTIVE | Asserts pairwise policy compatibility constraints. |
| `components/services/strettoCombinedOverlapRunTest.ts` | ACTIVE | Asserts combined-overlap run computation behavior. |
| `components/services/strettoDagTraversalTest.ts` | ACTIVE | Asserts deterministic DAG traversal constraints over multiple fixtures. |
| `components/services/strettoIntegrationTest.ts` | ACTIVE | Asserts end-to-end search outcomes for integration fixtures. |
| `components/services/strettoScoringRegression.ts` | ACTIVE | Asserts stretto scoring penalty regression behavior. |
| `components/services/strettoPairwiseLogicCheck.diagnostic.ts` | ARCHIVE | Cross-check sweep retained for ad-hoc diagnostics; redundant with enforced pairwise policy/pivot tests for release gating. |

`REMOVE`: none in this pass. No file was deleted because each remaining executable test artifact contributes either unique enforced assertions (`ACTIVE`) or intentionally retained diagnostic observability (`ARCHIVE`).
