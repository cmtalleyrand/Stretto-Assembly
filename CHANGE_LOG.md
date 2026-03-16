
# Change Log

## [Voice Allocation: Post-hoc CSP (Option D) + Rule 2B Fix]

- **Rule 2B added:** tenor–bass entry pairs now require ≥ 7 semitones of transposition separation (previously enforced the same 0-semitone floor as non-bass adjacent pairs — `isVoicePairAllowedForTransposition` at dist=1 with bass as lower voice).
- **Voice removed from BFS state:** `voiceEndTimesTicks` and `voiceIndex` removed from `DagNode` and the active-tail DAG key, enabling significantly more node merging per BFS layer and proportionally deeper search coverage within the same time budget.
- **Post-hoc CSP (`assignVoices`):** runs after search completes; assigns voice indices to all entries in a completed chain by backtracking over the ensemble voices and enforcing: §B ordering rules (Rules 2A/2B/3A/3B) for **all temporal pairs** (not only simultaneous), §C re-entry (1-beat window), and P4 bass-role dissonance constraints. Chains with no valid assignment are discarded.
- **Pre-search voice domain filter:** `allowedVoicesForTrans` lookup table derived from e0's fixed voice and T(e0)=0 prunes transpositions that have no valid voice assignment relative to e0 before BFS begins.
- **§B scope clarification:** voice ordering rules apply to all temporal pairs — each new entry is checked against the most recent prior chain entry in every other voice, whether or not that prior entry is still sounding.
- **Regression test:** `strettoDagTraversalTest.ts` now verifies §B voice ordering for all temporal pairs in every result chain.

## [Stretto Discovery Parity Update]
- **Bug Fix:** Resolved issue where the "Delays" Power Filter buttons in the Discovery menu were hidden if the candidates were flagged as invalid. They now correctly show the full range up to 8 beats for a 12-beat subject.
- **New Feature:** Added an **Inversion Pivot** selector to the Discovery config panel. Discovery inversions now respect this mirror point, and the state is shared with the Chain search mode.
- **Range Sync:** Unified the delay ceiling at 66% (2/3) across all modes, restoring the loose stretto capability.
- **Documentation:** Updated `STRETTO_RULES.md` and `PROJECT_INTENT.md` to reflect unified delay and pivot logic.

## [Stretto Lab Filter & UX Overhaul]
- **Grid UI:** Redesigned the Discovery list to use integrated table header sorting.
- **Power Filters:** Replaced single-select dropdowns with multi-select toggle groups for Intervals, Delays, and Entry Pitches.

## [Assembly Context + Export Hardening]
- **Prompt Context Upgrade:** Gemini assembly requests now include explicit discovery-filter context (selected intervals, delays, entry pitch classes, dissonance cap, resolved-ending constraint, and visible subset cardinality) so generated assemblies preserve user-imposed candidate constraints.
- **Filter Telemetry Bridge:** Discovery grid now emits a typed filter-context payload to upstream orchestration, enabling deterministic prompt conditioning without re-computing UI state.
- **MIDI Export Hardening:** Multi-track export now handles empty-voice candidates safely, enforces deterministic per-track note ordering, and assigns instrument metadata consistently for bundled candidate exports.

