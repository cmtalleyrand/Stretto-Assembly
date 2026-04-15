# Testing Guidelines

This document defines what constitutes a **good test** vs **bad test** in this codebase, and common anti-patterns to avoid.

## Core Principle: Tests Must Catch Bugs

A test is **good** if:
1. **It would fail if the code broke.** If you delete a line or change logic, does the test catch it?
2. **It validates behavior, not implementation.** It asserts on observable results, not internal state.
3. **It has clear pass/fail criteria.** Not a vague "check that something exists".

A test is **bad** if:
1. **It records current behavior.** Assertions like `assert.equal(foo, 42)` just hardcode the current output. If the output changes for a valid reason, the test fails for no reason.
2. **It tests implementation details.** Tests of private helper functions or internal configuration flags don't validate end-to-end correctness.
3. **It asserts tautologies.** Statements that are always true by construction (e.g., `assert.ok(x > 0)` when `x = Math.max(a, b)` — max always returns a positive if inputs are positive).
4. **It tests structure, not correctness.** Asserting that an object has a field (`assert.ok(obj.field)`) doesn't validate that the field contains the *right* value.

## Test Categories and Expectations

### 1. Unit Tests (Integration-Adjacent)

**Purpose:** Validate a single module's logic in isolation, but with realistic inputs.

**Do test:**
- Mathematical properties (e.g., "sorted array has monotone elements")
- Invariants (e.g., "estimates are bounded [0, 100]")
- Transformation correctness (e.g., "interval labels preserve sign")
- Error handling on invalid inputs

**Don't test:**
- Internal state details (private variables, temporary data structures)
- Configuration flag behavior (unless it's a public API)
- Exact output values that may change legitimately

**Example of GOOD unit test:**
```typescript
// Tests an invariant: intervals preserve sign relationship
assert.ok(formatInterval(12) > formatInterval(0), 'positive intervals stay positive');
assert.ok(formatInterval(-5) < formatInterval(0), 'negative intervals stay negative');
```

**Example of BAD unit test:**
```typescript
// Records current behavior, fails if output format changes
assert.equal(formatInterval(12), 'P8', 'should output P8');
assert.equal(formatInterval(5), 'P4', 'should output P4');
```

### 2. Integration Tests

**Purpose:** Validate that multiple components work together correctly on realistic data.

**Do test:**
- End-to-end workflows (MIDI → search → ranking → output)
- Algorithm correctness (does search produce valid chains?)
- Constraint enforcement (are violated chains rejected?)
- Regression detection (benchmarks on fixed inputs)

**Don't test:**
- UI label formatting (use snapshot tests instead)
- Telemetry counter arithmetic
- Helper function behavior in isolation (those should be tested via integration)

**Example of GOOD integration test:**
```typescript
const chains = searchStrettoChains(fixture);
// Validate structural properties
assert.ok(chains.length > 0, 'search should find results on valid fixture');
assert.ok(chains.every(chain => chain.length >= minLength), 'all chains meet length requirement');
// Validate music theory rules
assert.ok(chains.every(chain => isConsistentWithHarmony(chain)), 'all chains are harmonically valid');
```

**Example of BAD integration test:**
```typescript
const chains = searchStrettoChains(fixture);
assert.equal(chains.length, 42, 'should find exactly 42 chains');  // Why 42? Records current behavior
assert.equal(chains[0].score, 87.3, 'first chain score is 87.3');  // Breaks if scoring changes
```

### 3. Regression Tests

**Purpose:** Detect unintended performance or correctness changes.

**Do test:**
- Performance metrics (nodes visited, time elapsed) on fixed inputs
- Specific computed values that are difficult to derive (e.g., distance penalties)
- Invariants that should never change (e.g., uniqueness constraints)

**Don't test:**
- Exact percentages or estimates (those will shift with legitimate algorithm changes)
- Counter arithmetic (those are implementation details)
- Telemetry labels

**Example of GOOD regression test:**
```typescript
const result = scoreChain(testChain);
// Validate that distance penalties match expected formula
const expectedDistancePenalty = 5 * penaltyPerUnit;
assert.equal(result.distancePenalty, expectedDistancePenalty, 'distance penalty formula unchanged');
```

**Example of BAD regression test:**
```typescript
const result = searchStrettoChains(fixture);
// Records current state without explaining why
assert.equal(result.stats.nodesVisited, 12847, 'should visit exactly 12847 nodes');
```

## Common Anti-Patterns

### Anti-Pattern 1: Tautological Assertions

**Definition:** An assertion that is always true by construction.

```typescript
// ❌ BAD: Math.max always returns >= each input
const value = Math.max(a, b);
assert.ok(value >= a, 'value should be >= a');

// ✅ GOOD: Assert that max correctly chose the larger value
assert.equal(value, Math.max(...allInputs), 'max returned the actual maximum');
```

### Anti-Pattern 2: Testing Implementation Details

**Definition:** Asserting on private behavior instead of public results.

```typescript
// ❌ BAD: Testing a private helper
assert.equal(toCanonicalKey(triplet), expectedKey, 'key formation is correct');

// ✅ GOOD: Test via integration that chains using that helper are correct
const chains = searchWithFixture(fixture);
assert.ok(chains.every(isValidChain), 'all chains are valid');
```

### Anti-Pattern 3: Structure Existence Without Value Validation

**Definition:** Checking that a field exists, not that it contains correct data.

```typescript
// ❌ BAD: Only checks existence
assert.ok(breakdown.parallelPenalty, 'breakdown should have parallelPenalty field');

// ✅ GOOD: Validate the value is correct
const parallelResult = calculateScore(chainWithParallels);
assert.ok(parallelResult.parallelPenalty > 0, 'parallel perfect intervals incur penalty');
const nonParallelResult = calculateScore(chainWithoutParallels);
assert.equal(nonParallelResult.parallelPenalty, 0, 'no parallels means no penalty');
```

### Anti-Pattern 4: Hardcoded Output Values

**Definition:** Recording exact current output as test assertions.

```typescript
// ❌ BAD: Brittle to any legitimate change
assert.equal(displayPercent, 42, 'should render at 42%');
assert.equal(progressLabel, 'Phase 2 / 3', 'should show phase 2');

// ✅ GOOD: Test invariants
assert.ok(displayPercent >= 0 && displayPercent <= 100, 'percent is bounded');
assert.match(progressLabel, /Phase \d / 3/, 'phase label has expected format');
assert.ok(displayPercent >= previousPercent, 'percent is monotone');
```

### Anti-Pattern 5: Testing Configuration Flags

**Definition:** Validating that a feature can be toggled, not that it works correctly.

```typescript
// ❌ BAD: Tests the flag, not the behavior
const result1 = search(fixture, { FEATURE_FLAG: true });
const result2 = search(fixture, { FEATURE_FLAG: false });
assert.notEqual(result1, result2, 'flag changes behavior');

// ✅ GOOD: Test the behavior with/without
const withFeature = search(fixture, { enableOptimization: true });
const withoutFeature = search(fixture, { enableOptimization: false });
assert.ok(withFeature.length >= withoutFeature.length, 'optimization finds at least as many chains');
```

## Test Organization

### When to Write Each Type

| Scenario | Test Type | Example |
|----------|-----------|---------|
| Single function, isolated logic | Unit (invariant-based) | Interval formatter preserves sign |
| Algorithm correctness | Integration | Search finds valid chains |
| Performance change detection | Regression | Nodes visited within 10% of baseline |
| Music theory rule enforcement | Integration | Consonance/dissonance detection is correct |
| UI display | Snapshot or E2E | Component renders correctly |

### When to Delete a Test

Delete a test if:
1. **It's testing a private function** (should be covered by integration tests)
2. **It records hardcoded output values** (use regression/snapshot tests for those)
3. **It asserts tautologies** (always passes by construction)
4. **It's redundant** with another test that covers the same behavior
5. **It tests configuration/implementation details** (not public behavior)

## Testing in This Codebase

### Kept Tests (Examples of Good Tests)

- **canonSearchConstraints.test.ts** — Tests that constraint rules are enforced (behavior validation)
- **midiSpelling.test.ts** — Tests interval labeling invariants (property-based)
- **strettoDagTraversal.heavy.test.ts** — Tests DAG traversal correctness and determinism (integration)
- **strettoPerformanceRegression.test.ts** — Tests performance metrics on fixed inputs (regression)

### Deleted Tests (Examples of Bad Tests)

- **strettoDagInvariants.test.ts** — Tested private helpers in isolation (redundant with integration)
- **searchProgressModel.test.ts** (original) — 200+ lines of hardcoded percentages (brittle)
- **strettoTelemetryAccounting.test.ts** — Tested that counters add up (tautology)
- **quarterNoteUnits.test.ts** — Tested string formatter (no business logic)

## Running Tests

See `CLAUDE.md` for test execution commands. All kept tests validate meaningful behavior:

```bash
npm run test:stretto:all          # Run all meaningful tests
npm run test:stretto:integration  # End-to-end integration tests
npm run test:stretto:regression   # Performance regression tests
```

## Summary

**Write tests that would catch bugs.** If you delete a line or change logic, the test should fail. If not, either:
- The test is testing implementation details (not behavior)
- The test is recording current output (not validating correctness)
- The test is a tautology (always passes)

When in doubt, ask: *"If this assertion passes, have I actually proven the code is correct?"* If the answer is no, rewrite or delete the test.
