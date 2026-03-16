# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start Vite dev server on http://localhost:3000
npm run build            # Production build to dist/
npm run lint             # TypeScript type-check (tsc --noEmit)

# Tests
npm run test:stretto:all                   # Run all stretto tests
npm run test:stretto:scoring-regression    # Scoring validation
npm run test:stretto:pairwise-logic        # Pairwise compatibility logic
npm run test:stretto:dag                   # DAG traversal
npm run test:stretto:integration           # End-to-end integration

# Diagnostics
npm run diagnose:stretto                   # Basic diagnostic check
npm run diagnose:stretto:full              # Full diagnostic (extended output)
```

Environment variable required for AI features: `GEMINI_API_KEY`.

## Architecture

**Stretto Assembly** is a React/TypeScript application for discovering stretto counterpoint chains in MIDI compositions. It implements a formally specified bottom-up pipeline algorithm with harmonic analysis, scoring, and voice assignment.

### Key files

| File | Role |
|------|------|
| `types.ts` | All shared TypeScript interfaces — update here first before changing logic |
| `constants.ts` | Application-wide constants |
| `components/services/strettoGenerator.ts` | Main chain search algorithm (~1800 lines) |
| `components/services/strettoScoring.ts` | Scoring and ranking |
| `components/services/strettoCore.ts` | Core harmonic analysis |
| `components/services/midiAnalysis.ts` / `midiHarmony.ts` | MIDI parsing and harmonic compatibility |
| `hooks/useMidiController.ts` | Central state management |
| `hooks/useStrettoAssembly.ts` | Stretto search operations |
| `STRETTO_RULES.md` | Authoritative constraint and scoring definitions |
| `docs/stretto-entry-model.md` | Canonical entry tuple definition and legacy mapping |

### Data flow

```
MIDI Upload → MIDI Analysis → Subject Variant Selection
    → Stretto Search (5-stage pipeline) → Scoring & Ranking
    → Voice Assignment CSP → Harmonic Analysis → ABC/MIDI Export
```

### The search algorithm (5-stage bottom-up pipeline)

The search uses staged bottom-up precomputation — **not** DFS. If `strettoGenerator.ts` contains a depth-first recursive `solve()` as its primary chain search, it has been reverted to the wrong architecture.

- **Stage 1:** Enumerate valid delay triplets `(d₁, d₂, d₃)` against delay contraction rules (A.1–A.6)
- **Stage 2:** Enumerate valid transposition triplets satisfying voice separation (Rules 2A/2B/3A/3B)
- **Stage 3:** Pairwise harmonic check against precomputed `compatTable`
- **Stage 4:** Full triplet-level harmonic check (3-voice texture)
- **Stage 5:** DAG traversal assembling chains; global uniqueness enforced incrementally via state `(boundaryPairKey, i, U)` where `U` tracks used high delays

Voice assignment (`v_i`) is deferred: a CSP backtracker runs post-search to assign voices; chains with no valid assignment are discarded.

### Canonical entry tuple vs. legacy fields

The normative entry representation is `e_i = (d_i, t_i, v_i, inv_i, trunc_i)`, but runtime code is in **compatibility mode** using legacy fields (`startBeat`, `type`, `length`, `variantIndices`). The mapping is:

- `d_i` ← differencing of `startBeat` values: `d_i = startBeat_i - startBeat_{i-1}`
- `inv_i` ← `type === 'I'` ? 1 : 0
- `trunc_i` ← `L_full - length_i`

Do not migrate these to canonical form without updating all consumers (`types.ts`, `StrettoChainView.tsx`, `StrettoResultsList.tsx`).

### Harmonic rules (critical, non-negotiable)

- **Parallel P4s are always allowed**
- **P4 is dissonant only when its lower note is the global bass** at that instant
- **Parallel P5/P8 are invalid** if: consecutive pair boundaries each contain one, OR both adjacent delays `>= Sb/3`
- Consonant intervals: P1, m3, M3, P5, m6, M6, P8
- Dissonant intervals: m2, M2, TT, m7, M7

### Scoring formula

`Q = 0.2·S1 + 0.3·S2 + 0.4·S3`, then `U_quality = -1000Q`

Total: `S(C) = U_quality + B_compactness + B_polyphony + R_harmony − P_distance − P_truncation − P_monotony − P_harmonyNCT`

Removed from scoring (do not re-add): per-unique-distance reward, inversion bonus, chain-length bonus, imperfect-consonance bonus, score clamping.

## TypeScript workflow

Always follow **Types First**: update `types.ts` before writing logic that introduces new fields or union values. When changing a union type (e.g. `HarmonicRegion['type']`), update every `switch` that uses it — `PianoRoll`'s color mapper is a frequent breakpoint.
