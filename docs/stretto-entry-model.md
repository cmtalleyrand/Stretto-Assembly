# Stretto Entry Canonical Model

## 1) Canonical tuple (normative)

For entry index `i` in a chain of length `N`, the canonical representation is the 5-tuple:

\[
e_i = (d_i,\ t_i,\ v_i,\ inv_i,\ trunc_i),\quad i \in \{0,1,\dots,N-1\}
\]

with the domain convention `d_0 = ⊥` (not applicable) and `d_i \in \mathbb{R}_{\ge 0}` for `i>=1`.

Interpretation note: `d_i` is an **incremental delay parameter** attached to entry `e_i` (for `i>=1`), whereas `s_i` is the derived **distance-from-origin** (absolute start offset).

A chain is therefore:

\[
E = (e_0,e_1,\dots,e_{N-1})
\]

## 2) Exact semantics of \(d_i\)

`d_i` is an **entry-local incremental delay scalar** (beat-grid value) for `i>=1`. It is not a distance-from-origin quantity. Distances from origin are represented by derived absolute offsets `s_i`.

Formally:

- `d_0` is undefined / not applicable (first entry has no predecessor)
- `d_i >= 0` for all `i >= 1`

Define absolute start offset from `e_0` as a derived quantity:

\[
s_0 = 0,\quad s_i = \sum_{k=1}^{i} d_k \text{ for } i \ge 1
\]

Then pairwise and absolute representations are linked by:

\[
d_i = s_i - s_{i-1},\quad i \ge 1
\]

## 3) Domains and constraints (canonical fields)

All fields are per-entry fields of `e_i = (d_i,t_i,v_i,inv_i,trunc_i)`.

| Field | Domain | Constraint class | Required constraints |
|---|---|---|---|
| `d_i` | `{⊥}` for `i=0`; `ℝ>=0` beats for `i>=1` (implementation may quantize to beat-grid step) | Incremental temporal spacing parameter | `d_0` is not applicable; for `i>=1`, `d_i` is the incremental delay value attached to entry `e_i`; absolute start offsets are derived by prefix sums `s_i = Σ_{k=1..i} d_k` with `s_0=0`. |
| `t_i` | `ℤ` semitones | Pitch transform | Subject-to-voice-order constraints and transposition admissibility checks. |
| `v_i` | `ℤ`, `0 <= v_i < ensembleTotal` | Voice assignment | **Assigned post-hoc** by a CSP backtracker after chain search completes, enforcing §B ordering rules (Rules 2A/2B/3A/3B) for all temporal pairs and §C re-entry. During BFS, `voiceIndex` carries placeholder values; the CSP fills in final values before results are returned. Chains with no valid assignment are discarded. |
| `inv_i` | `{0,1}` (or `{false,true}`) | Binary transform flag | `1` means inversion form, `0` means non-inverted form. |
| `trunc_i` | `ℝ>=0` beats removed from full subject (or equivalent non-negative truncation extent scalar) | Duration transform | `0` means full-length; `>0` means truncated. |

### Derived predicates

- `isInverted(i) := (inv_i = 1)`
- `isTruncated(i) := (trunc_i > 0)`

These are logical predicates only; they are not additional storage fields in the canonical tuple.


### Terminology disambiguation

- **Incremental delay (`d_i`)**: local delay parameter on entry `e_i` (`i>=1`); it is not an origin-distance coordinate.
- **Distance from origin (`s_i`)**: absolute start offset derived from cumulative delays.
- **Compatibility differencing (`d_i = s_i - s_{i-1}`)**: transformation required only when importing legacy absolute-start encodings (`startBeat`).

## 4) Legacy-to-canonical mapping table

The current implementation exposes legacy entry fields in `StrettoChainOption` (`startBeat`, `type`, `length`) and chain-scoped `variantIndices`. The canonical mapping is:

| Legacy field | Scope | Canonical target | Mapping |
|---|---|---|---|
| `startBeat` | entry | `d_i` (via derived absolute start `s_i`) | Let `s_i = startBeat_i - startBeat_0` (normalized absolute start). Then `d_0 = ⊥` (not applicable) and for `i>=1`, `d_i = s_i - s_{i-1}`. This differencing is a compatibility conversion from legacy absolute starts; canonical semantics remain: `d_i` is the entry-local incremental delay parameter and `s_i` is distance-from-origin. |
| `type` (`'N'`/`'I'`) | entry | `inv_i` | `inv_i = 0` if `type='N'`; `inv_i = 1` if `type='I'`. |
| `length` | entry | `trunc_i` | Let `L_full` be the full subject length in beats for the selected variant family; `trunc_i = max(0, L_full - length_i)` after beat-unit normalization. |
| `variantIndices[k]` | chain/entry-indexed indirection | (`inv_i`, `trunc_i`) compatibility source | Legacy indirection that selects variant material whose metadata implies inversion/truncation. In canonical form this indirection is not required for logical rule evaluation. |

`transposition` is already semantically aligned with `t_i` and therefore requires no semantic remapping.

## 5) Migration status (canonical vs compatibility mode)

Status labels:

- **Compatibility mode**: module still reads/writes legacy fields (`startBeat`, `type`, `length`, or `variantIndices`) directly.
- **Canonical-ready documentation**: module/document defines the canonical tuple and conversion logic but is not yet the sole runtime representation.

| Module / Artifact | Status | Evidence |
|---|---|---|
| `types.ts` (`StrettoChainOption`) | Compatibility mode | Entry type is explicitly legacy (`startBeat`, `type`, `length`). |
| `components/services/strettoGenerator.ts` | Compatibility mode | Search-state expansion and scoring pass chain entries plus `variantIndices`; delay logic is derived from `startBeat` differences. |
| `components/stretto/StrettoChainView.tsx` | Compatibility mode | Rendering computes starts from `entry.startBeat` and inversion from `entry.type`. |
| `components/stretto/StrettoResultsList.tsx` | Compatibility mode | UI labels and truncation checks are based on `type` and `length`. |
| `README.md` + `docs/stretto-entry-model.md` | Canonical-ready documentation | Canonical tuple, `d_i` semantics, constraints, and mapping are specified normatively. |

This status is intentionally explicit: the project currently documents the canonical model while preserving runtime compatibility with legacy field names.
