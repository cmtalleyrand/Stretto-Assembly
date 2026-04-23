# Stretto Assembly Glossary (Formal)

This glossary maps implementation symbols to musical semantics and algorithm roles.

## Notation and Units

- Delay/onset distance between entries: `d` with units in beats (`b`) or quarter-note units (`q`).
- Pitch displacement/transposition interval: `tint` with units in semitones (`st`).
- Tick-domain values are explicitly marked as ticks.

Cross-reference: pending normalization tasks are tracked in `docs/glossary-todo.md`.

---

## Scope note

This file is a static reference; interpretation notes are discussed in code review/chat, not embedded as review dialogue.

---

## 1) `StrettoChainOption.startBeat`
**Musical meaning:** Absolute onset location of a chain entry from origin.  
**Units:** beats (`b`).  
**Defined in:** `types.ts` (`StrettoChainOption`).  
**Used in:** chain construction, boundary signatures, and result presentation.

## 2) `CanonicalStrettoChainEntry.delayBeatsFromPreviousEntry`
**Musical meaning:** Onset distance from the previous entry (not an interval class).  
**Units:** beats (`b`).  
**Defined in:** `types.ts` (`CanonicalStrettoChainEntry`).  
**Used in:** legacy↔canonical conversion routines and conversion tests.

## 3) `CanonicalStrettoChainEntry.transpositionSemitones`
**Musical meaning:** Absolute transposition offset for the entry in the canonical chain encoding.  
**Units:** semitones (`st`).  
**Defined in:** `types.ts` (`CanonicalStrettoChainEntry`).  
**Used in:** canonical→legacy conversion and chain scoring paths.

## 4) `fromLegacyChainOptions` / `toLegacyChainOptions`
**Algorithm role:** O(n) conversions between absolute-start (`startBeat`) and predecessor-distance (`delayBeatsFromPreviousEntry`) encodings.  
**Correctness condition:** non-decreasing legacy starts are enforced to prevent negative predecessor distances.  
**Defined in:** `types.ts`.  
**Used in:** `components/services/strettoTypesConversionTest.ts`.

## 5) `StrettoSearchReport.stats.stopReason`
**State meaning:** terminal cause classification for the run.  
**Defined in:** `types.ts` union (`'Success' | 'Timeout' | 'Exhausted'`).  
**Used in:** `components/services/strettoGenerator.ts` finalization and `components/stretto/searchStatus.ts` status projection.

## 6) `Exhausted` (formal meaning)
- `Exhausted`: frontier fixed point reached under constraints (space-constrained stop).

**Implementation note:** current search path is time-gated (`checkLimits`) and sets timeout/exhaustion outcomes.

## 7) `PairwiseCompatibilityRecord.allowedVoiceMaskRows`
**Meaning:** for each source voice index, a bitset of destination voice indices allowed under pairwise voice/transposition constraints.  
**Data structure:** `bigint[]` row masks.  
**Benefit:** O(1) membership bit-test in inner loops instead of repeated predicate calls.

## 8) `PairwiseCompatibilityRecord.bassRoleCompatible`
**Meaning:** compatibility under bass-role assumptions:
- `none`: pair evaluated without forcing either member as bass,
- `a`: pair evaluated with participant A as bass,
- `b`: pair evaluated with participant B as bass.

**Precision note:** for any realized assignment, exactly one of `a` or `b` is relevant (the member mapped to bass).

**Equivalence result (`none`-only vs directional states):** not equivalent in current algorithm.
- `none` treats P4 as provisionally consonant in pairwise precompute.
- Later, when `bassIdx` is known, `applyBassRoleCompatibilityMaskRows` applies directional constraints using `a` for edges where the source is bass and `b` otherwise.
- If one orientation is compatible and the other is not (for example `a=true`, `b=false`), a `none`-only representation cannot express the required asymmetric pruning and would admit invalid assignments or over-prune valid assignments.


**Three concrete musical cases where directional states matter:**
1. **Static fourth with lower tone in A stream**: A carries `C3`, B carries `F3` at overlap. Interval class is P4. Under `a` (A treated as bass), lower tone is bass ⇒ dissonant; under `b` (B treated as bass), lower tone is not bass ⇒ not dissonant by the implemented P4 rule.
2. **Static fourth with lower tone in B stream**: A carries `F3`, B carries `C3` at overlap. Same interval class P4, but orientation flips: under `b`, lower tone is bass ⇒ dissonant; under `a`, not dissonant by the same rule.
3. **Crossing texture with alternating lower owner**: over successive simultaneities the lower pitch alternates between streams (e.g., A below B at one segment, B below A at the next). Directional evaluation changes which segments count as dissonant and therefore changes run-length and dissonance-ratio outcomes; a single `none` state cannot represent this orientation-dependent aggregation.

## 9) `applyBassRoleCompatibilityMaskRows(record, bassIdx)`
**Meaning:** projects `allowedVoiceMaskRows` through bass-role constraints when fourth-sensitive contexts require it.  
**Operational effect:** applies role-conditioned masking on assignments touching `bassIdx`; this realizes the directional asymmetry captured by `a`/`b` in O(V) row-mask time.

## 10) `hasFourth`, `p4Spans`, `bassRoleCompatible` (non-equivalent)
- `hasFourth`: boolean existence flag for fourth events in the pair.
- `p4Spans`: time-span locations where fourth events occur.
- `bassRoleCompatible`: admissibility outcomes under bass-role assumptions.

These fields are related but represent distinct data layers: existence, localization, and role-conditioned validity.

## 11) `toCanonicalTripletKey(parts)`
**Current key fields:** `(variantA, variantB, variantC, delayAB, delayBC, tintAB, tintBC)`.  
**Meaning:** canonicalization of adjacent-transition composition state for triplet-window deduplication/retrieval.

### First-principles rationale
For any local triplet window over consecutive entries `(e_k, e_{k+1}, e_{k+2})`, the index state is defined by adjacent-edge quantities:
- onset distances: `d_{k,k+1}`, `d_{k+1,k+2}`
- pitch displacements: `tint_{k,k+1}`, `tint_{k+1,k+2}`
- selected realization identities for the three entries.

Transition-window indexes consume these adjacent-edge quantities. Therefore canonical equality for this index is equality over those local edge quantities plus realization identities. The same rule is applied for each local triplet window encountered during extension.

### Relation to canonical chain-entry definition
- Chain-entry canonical encoding stores `delay` as predecessor distance and `transposition` as absolute offset.
- Triplet-key canonical encoding stores both onset-distance and transposition in **adjacent-edge** coordinates for the active local window.

Hence, these are different canonicalizations over different state spaces (entry serialization vs transition index keying), not contradictory definitions.

## 12) Boundary signatures (`toBoundaryPairKey`, `toOrderedBoundarySignature`)
**Meaning:** deterministic encoding of immediate predecessor boundary relations to preserve traversal order semantics.  
**Used in:** DAG state/key management and grouping.

## 13) `checkCounterpointStructure(...)`
**Meaning:** pairwise contrapuntal scan producing compatibility, dissonance ratio, fourth/parallels signals, and optional spans.  
**Used in:** stretto pairwise precompute and canon pairwise prefilter.

## 14) `maxPairwiseDissonance`
**Meaning:** admissibility threshold for dissonant proportion in pair overlays.  
**Units:** ratio [0,1].  
**Used in:** pair-stage pruning and lower-bound checks.

## 15) `parallelPerfectStartTicks`
**Meaning:** tick positions where disallowed parallel perfect motion begins.  
**Units:** ticks.  
**Used in:** diagnostics and rejection accounting.

## 16) `prefixDissonanceState`
**Meaning:** running state for contiguous dissonance-run admissibility over partial chains.  
**Used in:** prefix admissibility pruning during DAG extension.

## 17) `subjectLengthTicks`
**Meaning:** subject time-span horizon controlling overlap existence and long-range pair-check necessity.  
**Units:** ticks.

## 18) `ppq`
**Meaning:** pulses-per-quarter scaling constant for beat↔tick conversion.  
**Units:** ticks per quarter-note.

## 19) `inversionMode`, `thirdSixthMode`, `truncationMode`
**Meaning:** cardinality constraints on transformation classes in candidate chains.  
**Used in:** quota gating (`checkQuota`) during triplet and DAG expansion.

## 20) `stageStats` rejection counters
**Meaning:** layered pruning attribution:
- `pairStageRejected` (pair-level),
- `tripletStageRejected` (triplet-level),
- `globalLineageStageRejected` (history/lineage-level).

## 21) `coverage.exploredWorkItems` and `coverage.liveFrontierWorkItems`
**Meaning:** traversal coverage observables used for heuristic completion lower bounds.

## 22) `SearchProgressState` / `SearchProgressAccumulator`
**Meaning:** stage-progress state and differential baseline for rate/ETA projection.

## 23) `STRETTO_TELEMETRY_GLOSSARY`
**Meaning:** metric dictionary: formal metric definition, units, increment site, and estimate class (`exact` / `heuristic`).

## 24) `CanonSearchOptions`
**Meaning:** canon-mode search configuration for delay range, transposition plan strategy, inversion strategy, and voice-count constraints.

---

## Normalization notes

Deferred terminology simplifications are tracked in `docs/glossary-todo.md`.
