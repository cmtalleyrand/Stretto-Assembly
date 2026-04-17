# Search Optimisation Backlog

Tasks arising from admissibility benchmarking (chain=8, wtc1_f08_ebmin, 45s run).

---

## TODO-1: Delay-invariant voice/transposition admissibility model

**What:** Build a complementary admissibility model that is delay-agnostic but prunes
on voice assignment and transposition constraints. Enumerate all structurally valid
`(v_{i-1}, v_i, transposition, voiceAssignment)` combinations independent of delay.

**Why it matters:**
- `rejectVoice` and `rejectP4Bass` are currently zero in practice, but that is a property of
  the current transposition range, not a guarantee. A model here provides a principled
  pre-filter at pairwise stage.
- More importantly: transposition-equivalent compounds (chains identical in delay/variant
  structure but differing only in absolute transposition) produce identical pairwise
  dissonance structures. A delay-invariant transposition model can detect and prune these
  duplicates cheaply at precompute time rather than at scoring/deduplication time.
- With `span` information (which voice pairs overlap at what beats), the model can also
  pre-filter `(v_{i-1}, v_i, transposition)` pairs whose dissonance structure guarantees
  the full-texture `maxDissonanceRunEvents` validity check will fail — without running
  the full scoring pipeline.

**Suggested approach:**
- New function `buildTranspositionAdmissibilityModel` (delay-invariant).
- Enumerate `(vA, vB, relativeTransposition)` triples; for each, pre-compute voice mask
  intersection. Only mark admissible if at least one valid voice assignment exists.
- Output: compact set/map used at pairwise precompute to skip infeasible `(vA, vB, t)` pairs
  before the full harmonic scan. Expected cost: negligible (no delay dimension).
- Extension: use dissonance span structure to prune `(vA, vB, t)` pairs that provably
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
