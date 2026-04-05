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

## Musical Objective

A stretto chain is a sequence of fugue subject entries where each successive voice enters before the previous one has finished — creating an imitative texture that progressively tightens. The goal of this application is to find chains that are **musically compelling**: dissonances are transient and resolve, entries arrive closer and closer together toward the end (progressive tightening), voices maintain clear registral separation throughout, and the final entries form a compact cluster. Chains are ranked to surface the most harmonically stable and rhythmically interesting results.

All rules below exist to enforce this musical intent. Constraint violations are not edge cases — they represent musically incoherent results that must be discarded.

## Rule documents (authoritative)

Every rule in this codebase traces back to one of these files. When there is any conflict between implementation and these documents, the documents win:

| Document | Scope |
|----------|-------|
| `STRETTO_RULES.md` | **Primary authority.** All hard constraints (A–D) and scoring metrics S1–S3 |
| `README.md` | Mandatory search architecture (bottom-up pipeline stages) |
| `docs/stretto-entry-model.md` | Canonical entry tuple `(d_i, t_i, v_i, inv_i, trunc_i)` and legacy-field mapping |
| `SCORING_MECHANISM.md` | Scoring formula detail: penalty/bonus point values and removed legacy terms |
| `TS_GUIDELINES.md` | TypeScript workflow requirements |

## Full rule set

### A. Delay / rhythm (progressive tightening)

These rules enforce that the chain genuinely tightens. Source: `STRETTO_RULES.md §A`, `README.md Stage 1`.

| Rule | Condition |
|------|-----------|
| A.1 Global uniqueness | Every delay `> Sb/3` must be unique across the entire chain |
| A.2 Half-length trigger (OR form) | If `d_{n-1} >= Sb/2` **or** `d_n >= Sb/2`, then `d_n < d_{n-1}` |
| A.3 Expansion recoil | If `d_{n-1} > d_{n-2}` and `d_{n-1} > Sb/3`, then `d_n < d_{n-2} − 0.5 beats` |
| A.4 Post-truncation contraction | After a truncated entry, next delay contracts by ≥ 1 beat (unless `d_{n-1} < Sb/3`) |
| A.5 Maximum contraction bound | `d_{n-1} − d_n ≤ 0.25 × Sb` (contraction cannot be too abrupt) |
| A.6 Universal max delay | `d_n ≤ 2/3 × Sb` for all entries |
| A.7 Adjacent transposition separation | `|t_i − t_{i+1}| ≥ 5` semitones for every adjacent pair |
| A.8 Transform-following normality | Any inversion or truncation must be immediately followed by a normal (non-inverted, non-truncated) entry |
| A.9 First entry non-inversion | Entry e1 must not be inverted — the opening imitation uses the original subject form |
| A.10 No truncation at long delay | If `d_i ≥ Sb/2`, then `trunc_i = 0` — entries arriving at large delays must use the full subject |

### B. Voice interval constraints (clear spacing between voices)

These rules enforce registral separation so voices remain distinct. Applied to **all temporal pairs**, not only simultaneous sounding entries — a voice maintains its register relationship throughout the chain. Source: `STRETTO_RULES.md §B`.

Voice indices are ordered highest-to-lowest register (0 = soprano … `ensembleTotal−1` = bass).

| Rule | Voice pair distance | Pair type | Minimum gap: T(higher) − T(lower) |
|------|---------------------|-----------|-----------------------------------|
| 2A | dist = 1 | Non-bass adjacent (soprano–alto, alto–tenor) | ≥ 0 semitones |
| 2B | dist = 1 | Tenor–bass (lowest adjacent pair) | ≥ 7 semitones |
| 3A | dist = 2 | Non-bass dist-2 (soprano–tenor) | ≥ 7 semitones |
| 3B | dist = 2 | Alto–bass (lowest dist-2 pair) | ≥ 12 semitones |
| — | dist ≥ 3 | Any pair 3+ voice-steps apart | ≥ 12 semitones |

### C. Voice allocation

Source: `STRETTO_RULES.md §C`.

- Voice assignment (`v_i`) is **post-hoc**: a CSP backtracker assigns voices after chain search. Chains with no valid assignment are discarded.
- Re-entry: a voice becomes available for re-entry 1 beat (`ppq`) before its current occupant's final note ends.
- Active transposition uniqueness: at entry point of `e_i`, no currently active entry may share the same transposition (`t_i ≠ t_j` for all active `e_j`). Enforced during chain search, not post-hoc.

### D. Consonant termination (optional)

Source: `STRETTO_RULES.md §D`, `SCORING_MECHANISM.md §1A`.

When `requireConsonantEnd` is enabled, the last note of every voice entry must form a consonance with at least one other active voice. This prevents chains that trail off on unresolved dissonances.

### E. Harmonic definitions and P4/P5/P8 policy (non-negotiable)

Source: `STRETTO_RULES.md §4`, `README.md` critical policy block.

- **Consonant:** P1, m3, M3, P5, m6, M6, P8
- **Dissonant:** m2, M2, TT, m7, M7
- **Contextual:** P4 is dissonant **only** when its lower note is the global bass at that instant; otherwise consonant
- **Parallel P4s are always permitted**
- **Parallel P5/P8 are invalid** when either: consecutive pair boundaries each contain a P5/P8, OR any P5/P8 parallel occurs while both adjacent delays `>= Sb/3`

### F. Scoring (ranking musically compelling chains)

Source: `STRETTO_RULES.md §2–3` (metrics), `SCORING_MECHANISM.md` (point values).

`Q = 0.2·S1 + 0.3·S2 + 0.4·S3`, `U_quality = −1000Q`

`S = U_quality + B_compactness + B_polyphony + R_harmony − P_distance − P_truncation − P_monotony − P_harmonyNCT`

See `SCORING_MECHANISM.md` for all penalty/bonus point values.

**Removed — do not re-add:** per-unique-distance reward, inversion bonus, chain-length bonus, imperfect-consonance bonus, score clamping, S4 (unprepared dissonance metric).

## Architecture

**Stretto Assembly** is a React/TypeScript application for discovering stretto counterpoint chains in MIDI compositions.

### Key files

| File | Role |
|------|------|
| `types.ts` | All shared TypeScript interfaces — update here first before changing logic |
| `constants.ts` | Application-wide constants |
| `components/services/strettoGenerator.ts` | Main chain search algorithm (~1800 lines) |
| `components/services/strettoScoring.ts` | Scoring and ranking |
| `components/services/strettoCore.ts` | Core harmonic analysis |
| `components/services/midiAnalysis.ts` / `midiHarmony.ts` | MIDI parsing and harmonic compatibility (canonical analysis module is `@analysis/midi`) |
| `hooks/useMidiController.ts` | Central state management |
| `hooks/useStrettoAssembly.ts` | Stretto search operations |

### Data flow

```
MIDI Upload → MIDI Analysis → Subject Variant Selection
    → Stretto Search (5-stage pipeline) → Scoring & Ranking
    → Voice Assignment CSP → Harmonic Analysis → ABC/MIDI Export
```

### The search algorithm (5-stage bottom-up pipeline)

The search uses staged bottom-up precomputation — **not** DFS. If `strettoGenerator.ts` contains a depth-first recursive `solve()` as its primary chain search, it has been reverted to the wrong architecture. Source: `README.md`.

- **Stage 1:** Enumerate valid delay triplets `(d₁, d₂, d₃)` — rules A.1–A.6
- **Stage 2:** Enumerate valid transposition triplets — rules B (2A/2B/3A/3B)
- **Stage 3:** Pairwise harmonic check against precomputed `compatTable`
- **Stage 4:** Full triplet-level harmonic check (3-voice texture)
- **Stage 5:** DAG traversal assembling chains; global uniqueness (A.1) enforced incrementally via state `(boundaryPairKey, i, U)` where `U` tracks used high delays. Dominated frontier states pruned when `U1 ⊆ U2`.

### Canonical entry tuple vs. legacy fields

The normative entry representation is `e_i = (d_i, t_i, v_i, inv_i, trunc_i)` (see `docs/stretto-entry-model.md`), but runtime code is in **compatibility mode** using legacy fields (`startBeat`, `type`, `length`, `variantIndices`). The mapping is:

- `d_i` ← `startBeat_i − startBeat_{i-1}` (incremental differencing)
- `inv_i` ← `type === 'I'` ? 1 : 0
- `trunc_i` ← `L_full − length_i`

Do not migrate to canonical form without updating all consumers: `types.ts`, `StrettoChainView.tsx`, `StrettoResultsList.tsx`.


### Canonical analysis import policy

- Authoritative module: `@analysis/midi` (`components/services/midiAnalysis.ts`).
- Deprecated compatibility shim: root `midiAnalysis.ts` (pure re-export only; no logic allowed).
- Enforcement: `npm run lint` includes `scripts/check-deprecated-analysis-imports.mjs`, which rejects direct imports from deprecated root-level paths.

## TypeScript workflow

Always follow **Types First** (`TS_GUIDELINES.md`): update `types.ts` before writing logic that introduces new fields or union values. When changing a union type (e.g. `HarmonicRegion['type']`), update every `switch` that uses it — `PianoRoll`'s color mapper is a frequent breakpoint.
