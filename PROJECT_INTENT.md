# Project Intent & Target Architecture

## Authoritative Scope

Stretto Assembly has a strict operational objective: compute deterministic stretto structures from symbolic musical input.

### In-Scope Problems

1. **Pairwise stretto discovery** under explicit timing and harmonic admissibility constraints.
2. **Algorithmic chain generation** from admissible pairwise entries with continuity rules.
3. **Implied harmony detection from stretto overlap states** as a first-class evaluation stage.
4. **Export synthesis** to MIDI and ABC with explicit per-voice entry allocation.

## Canonical Input Contract

- The canonical source representation is **ABC notation**.
- MIDI is a secondary interoperability format and must not define default workflow assumptions.
- Internal evaluation is discrete in ticks after parsing; therefore exact symbolic timing is required for stable overlap arithmetic.

## System Invariants

- Delay validity and overlap predicates are deterministic functions of note onset/offset indices.
- Pivot/inversion semantics are consistent between discovery and chain expansion.
- Voice assignment for export is stable and explicit for each stretto entry.
- UI defaults route directly to stretto operations without prerequisite diagnostics panels.

## Explicit Non-Goals

- Diagnostics-first navigation or branding.
- Positioning Harmonic Implication Analysis (HIA) as an independent primary workflow.
- Generic broad-spectrum harmonic-analysis tooling as the headline product function outside stretto evaluation.
