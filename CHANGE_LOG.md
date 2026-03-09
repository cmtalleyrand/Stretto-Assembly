
# Change Log

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

