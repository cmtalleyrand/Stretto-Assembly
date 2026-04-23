# Search Optimisation Backlog

Tasks arising from admissibility benchmarking (chain=8, wtc1_f08_ebmin, 45s run).

---

## TODO-1: Delay-agnostic voice/transposition admissibility model (absolute-indexed) — **Implemented**

**Status update (implemented in codebase):**
- Implemented module: `components/services/stretto-opt/voiceTranspositionAdmissibility.ts`.
- Implemented builder: `buildVoiceTranspositionAdmissibilityIndex(...)`.
- Implemented dense bitset-backed O(1) index key:
  `(i, voice_{i-1}, voice_i, tint_{i-1}, tint_i)`.
- Integrated index probes in:
  - triplet enumeration (both `adjacentValidPairsList` traversal sites),
  - DAG expansion candidate generation (`candidateTransitions` construction paths).
- Added targeted test coverage:
  `components/services/stretto-opt/voiceTranspositionAdmissibility.test.ts`.

**What:** Build a complementary admissibility model that is delay-agnostic but prunes
on voice assignment and transposition constraints. Enumerate structurally valid quadruples
`(voice_{i-1}, voice_i, tint_{i-1}, tint_i)` for each **absolute entry index** `i ∈ {1, …, targetChainLength}`.
Here `tint_j` is the absolute transposition attached to entry `j`, and `i` indexes the current edge
between entries `(i-1, i)`.

**State definition (finite-state machine):**
- `i` (absolute entry index).
- `lastSeen[voice]` (most recent absolute entry index for each voice).
- `seenSinceLast[voice]` bitset (which non-self voices have appeared since that voice last appeared).
- Current `(voice, transposition)` pair context for `(i-1, i)`.

**Exact constraints to encode in the model:**
- **Re-entry cooldown:** allow voice `v` at `i` only if at least `nVoices - 2` distinct non-`v` voices
  have appeared since `v` last appeared.
- **Re-entry obligation:** if all other voices have appeared since `v` last appeared, then `v` must be
  selected before any already-satisfied voice can repeat.
- **Terminal coverage:** for any chain of `targetChainLength`, entries in
  `[targetChainLength - nVoices, targetChainLength - 1]` must cover all voices.

**Why it matters:**
- `rejectVoice` and `rejectP4Bass` are currently zero in practice, but that is a property of
  the current transposition range, not a guarantee. A model here provides a principled
  pre-filter at pairwise stage.
- More importantly: transposition-equivalent compounds (chains identical in delay/variant
  structure but differing only in absolute transposition) produce identical pairwise
  dissonance structures. A delay-invariant transposition model can detect and prune these
  duplicates cheaply at precompute time rather than at scoring/deduplication time.
- **Harmonic-equivalence class (active-window = 4):** two compounds are equivalent when every
  active 4-entry window induces the same ordered overlap topology and the same-sign relative
  transposition compounds `(tint_{k+1}-tint_k, tint_{k+2}-tint_{k+1}, tint_{k+3}-tint_{k+2})` match classwise.
  Under this relation, pairwise dissonance/parallel structures are invariant up to global
  absolute transposition shift.
- With `span` information (which voice pairs overlap at what beats), the model can also
  pre-filter `(v_{i-1}, v_i, transposition)` pairs whose dissonance structure guarantees
  the full-texture `maxDissonanceRunEvents` validity check will fail — without running
  the full scoring pipeline.

**Implemented approach:**
- Implemented `buildVoiceTranspositionAdmissibilityIndex` (delay-agnostic).
- Enumerates reachable FSM states and emits a dense bitset index keyed by
  `(i, voice_{i-1}, voice_i, tint_{i-1}, tint_i)` with O(1) membership checks.
- Uses the index to reject infeasible voice/transposition edges before pairwise harmonic scans
  and before DAG candidate expansion.

**Remaining extension work:**
- Use dissonance span structure to prune `(vA, vB, t)` pairs that provably
  produce ≥3 consecutive dissonant full-texture events regardless of chain context.

---

## TODO-2: Pairwise dissonance indexed by relative onset position

**What:** Test whether pairwise harmonic data indexed by the relative onset position of
each dissonance (rather than just a ratio) would enable the full-texture `maxDissonanceRunEvents`
validity check to be pushed earlier in the pipeline.

**Background:**
Full-texture dissonances are structurally the union of pairwise dissonances plus P4s where
the lower note is the global bass at that instant. If pairwise records carry
`dissonanceByRelativePosition: Map<relativeTick, bool>`, then at triplet or DAG stage we
can compute the full-texture dissonance timeline incrementally from the union of the active
pairwise spans — without waiting for the scoring stage.

**Why it matters:**
In the 45s benchmark, `scoringValidChainsFound = 0` despite 26 chains in results. All 74
scored chains fail `maxDissonanceRunEvents <= 2`. These are caught only at `calculateStrettoScore`
time (post voice-assignment), after substantial finalization work. If this check could be
evaluated at DAG expansion time (or at least before voice assignment), it would save the
finalization work entirely for these chains.

**Key constraint:** P4 bass-role disambiguation (whether a P4 is dissonant) depends on
which voice is the global bass, which is known only after voice assignment. This is the
hard part — the rest of the dissonance timeline is computable from transpositions alone.

**Suggested starting point:**
- Instrument the scoring rejection path to log `maxDissonanceRunEvents` for rejected chains.
- Determine what fraction of rejections are due to P4-bass ambiguity vs. clearly-dissonant
  intervals. If P4-bass is a minority cause, a delay-invariant dissonance-run check covering
  only non-P4 intervals would already eliminate most false-passers.

---

## TODO-3: Sort `adjacentNextPairsByVariant` arrays by delay for early triplet exit

**What:** Pre-sort each `adjacentNextPairsByVariant.get(vB)` array by `.d` (delay) at build
time. In the triplet inner loop, when `validDelayTransitions` is null (disabled/full-admissibility
modes), break the inner loop when `p2.d > p1.d + delayStep`.

**Why:** Currently the inner loop is an unsorted array; the bounded-expansion check
`d_te_2 <= d_te_1 + delayStep` fires as a mid-loop `continue` rather than an early break.
With sorting, ~47% of inner iterations (the rejected-delay-shape fraction) become unreachable
without even entering the loop body.

**Note:** With `validDelayTransitions` available (delay-variant mode, the default), the
transition index already handles this. This optimisation matters only for the fallback path.
