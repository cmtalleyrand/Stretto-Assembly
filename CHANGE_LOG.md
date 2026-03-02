
# Change Log

## [Stretto Discovery Parity Update]
- **Bug Fix:** Resolved issue where the "Delays" Power Filter buttons in the Discovery menu were hidden if the candidates were flagged as invalid. They now correctly show the full range up to 8 beats for a 12-beat subject.
- **New Feature:** Added an **Inversion Pivot** selector to the Discovery config panel. Discovery inversions now respect this mirror point, and the state is shared with the Chain search mode.
- **Range Sync:** Unified the delay ceiling at 66% (2/3) across all modes, restoring the loose stretto capability.
- **Documentation:** Updated `STRETTO_RULES.md` and `PROJECT_INTENT.md` to reflect unified delay and pivot logic.

## [Stretto Lab Filter & UX Overhaul]
- **Grid UI:** Redesigned the Discovery list to use integrated table header sorting.
- **Power Filters:** Replaced single-select dropdowns with multi-select toggle groups for Intervals, Delays, and Entry Pitches.
