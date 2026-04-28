
# Stretto Generator Rules & Logic (v4.8 Strict)

This document defines the strict set of rules, constraints, and scoring mechanisms used by the Stretto Assembly algorithm.

## ⚠ Critical Delay-Contraction Safeguards (Persistent Failure Prevention)
These rules explicitly prevent chains where added entries fail to increase stretto compactness.

Notation: $n$ is the **absolute entry index** in the chain, $d_n$ is delay between entries $(n-1)\rightarrow n$, $Sb$ is current entry subject length in beats, and $B$ is one beat.

1. **Half-length contraction trigger (OR form):** if $d_{n-1} \ge Sb/2$ **or** $d_n \ge Sb/2$, then $d_n < d_{n-1}$.
2. **Expansion recoil trigger:** if $d_{n-1} > d_{n-2}$ and $d_{n-1} > Sb/3$, then $d_n < d_{n-2} - 0.5B$.
3. **Post-truncation contraction:** after a truncated entry, the next delay must contract by at least $1B$, unless $d_{n-1} < Sb/3$.
4. **Maximum contraction bound:** $d_{n-1} - d_n \le 0.25Sb$.

## 🚨 Critical P4/P5/P8 Policy Clarification
1. **Parallel perfect 4ths are permitted unconditionally.**
2. **P4 dissonance is contextual only:** a perfect fourth is dissonant exclusively when its lower note is the bass in the active sonority.
3. **Parallel perfect 5ths/octaves — pairwise, delay-conditional rule:**
   This rule is applied within each pairwise voice-pair overlap independently. Parallels in different voice pairs do not compound; there is no triplet-level or chain-level parallel rule.
   - If the pair's delay `d > Sb/3`: **any single parallel motion** from one P5/P8 to another P5/P8 (both voices moving by equal signed delta) makes the pair invalid.
   - If the pair's delay `d ≤ Sb/3`: only **two consecutive parallel motions** at back-to-back timepoint transitions make the pair invalid. An isolated single parallel is permitted.
   - A monophonic gap (one voice resting) **breaks** consecutive parallel tracking; the next transition after a gap is never counted as consecutive with one before it.

## 🚨 Consecutive Dissonance / Monophony Rule
The consecutive dissonance **event counter** is reset only by a consonant simultaneous interval. Monophony (fewer than 2 voices active at a timepoint) is **transparent** to the event counter — neither incrementing nor resetting it. The tick-duration accumulator (max 1 beat of continuous sounding dissonance) resets on monophony.

Example (counter trace):

```
Event:    consonance → dissonance → monophony → dissonance → dissonance
Counter:       0            1       (still 1)       2             3       → invalid
```

The monophonic gap does not reset the counter; the next polyphonic event continues from where it left off.

## 1. Hard Constraints (The "Gatekeepers")
Any chain candidate that violates *any* of these rules is immediately discarded (pruned) during the search process.

### A. Distance & Rhythm Rules
1.  **Global Uniqueness:** Every delay interval used in the chain must be unique if > 1/3 length.
2.  **Half-Length Trigger (OR form):** If previous or current delay is at least half subject length, current delay must be strictly smaller than previous.
3.  **Expansion Recoil:** If previous delay expanded and exceeded one-third subject length, current delay must contract by at least 0.5 beat relative to two entries ago.
4.  **Post-Truncation Contraction:** After a truncated entry, next delay must contract by at least 1 beat unless previous delay is below one-third subject length.
5.  **Universal Distance Limits:** All entries are allowed a maximum delay of **66% (2/3)** of the subject length.
6.  **Adjacent Transposition Separation:** For every adjacent pair `(e_i, e_{i+1})`, enforce `|t_i - t_{i+1}| >= 5` semitones (perfect fourth minimum).
7.  **Transform-Following Normality:** Any inversion or truncation must be immediately followed by a normal (non-inverted, non-truncated) entry.
8.  **Maximum Contraction Bound:** For each adjacent pair, contraction magnitude is bounded by one-quarter subject length: $d_i - d_{i+1} \le 0.25Sb$.
9.  **First Entry Non-Inversion:** Entry e1 (the first imitative entry after the subject statement) must not be inverted. The opening imitation establishes the stretto texture and must use the original subject form.
10. **No Truncation at Long Delay:** If $d_i \ge Sb/2$, then $trunc_i = 0$. An entry arriving at a large delay has room for the full subject and must use it; truncation is only permitted at tighter delays where overlap demands it.

Implementation invariant: Rule A.6 is an immediate-neighbor predicate and is therefore enforced during successor extension against the direct predecessor `(e_{i-1}, e_i)` only; non-adjacent overlapping pairs remain governed by harmonic compatibility rules, not A.6.

### B. Voice Interval Constraints

**Scope:** Rules apply to **all temporal pairs** in a chain — not only to entries that sound simultaneously. When a new entry is assigned to a voice, the ordering constraints are checked relative to the most recent prior chain entry in every other voice, whether or not that prior entry is still sounding. These are register-identity constraints (a voice maintains its register relationship throughout the chain), not acoustic simultaneity constraints.

**T values:** T(higher register) and T(lower register) in the table below are the raw semitone transposition values — pitch offsets from the original subject root — of each voice's most recently assigned entry. For non-overlapping pairs this is the transposition value of each voice's last entry, regardless of whether it is still sounding. Sounding MIDI pitches are never used in §B checks; see `isVoicePairAllowedForTransposition` in `strettoGenerator.ts`.

Voice indices are ordered from highest register to lowest (0 = soprano … `ensembleTotal−1` = bass). Voices that are `dist` steps apart must satisfy a minimum transposition gap:

| Rule | Distance between voice indices | Pair type | Minimum gap: T(higher register) − T(lower register) |
|---|---|---|---|
| 2A | dist = 1 | Non-bass adjacent pair (e.g. soprano–alto, alto–tenor) | ≥ 0 semitones |
| 2B | dist = 1 | Tenor–bass pair (lowest adjacent pair) | ≥ 7 semitones |
| 3A | dist = 2 | Non-bass pair (e.g. soprano–tenor, alto–bass... non-lowest) | ≥ 7 semitones |
| 3B | dist = 2 | Alto–bass pair (lowest dist-2 pair) | ≥ 12 semitones |
| — | dist ≥ 3 | Any pair 3 or more voice-steps apart | ≥ 12 semitones |

**Implementation note:** These rules are enforced post-hoc by a CSP backtracker (`assignVoices`) that runs after chain search completes and checks every pair of entries in the chain, ordered by voice register.

### C. Voice Allocation
1.  **Re-entry:** Any voice becomes available for re-entry 1 beat (`ppq`) before its current occupant's final note ends.
2.  **Post-hoc assignment:** Voice indices (`v_i`) are not tracked during BFS. After search, a CSP backtracker assigns voices to all entries in a completed chain, enforcing §B across all temporal pairs and §C re-entry. Chains for which no valid assignment exists are discarded.
3.  **Active Transposition Uniqueness:** At the entry point of $e_i$, no other currently active entry may share the same transposition ($t_i \ne t_j$ for all $j < i$ where $e_j$ is still sounding at $e_i$'s start). Two entries at the same transposition produce identical pitch content, which defeats the purpose of imitative counterpoint.
4.  **Voice variety (cooldown):** A voice that has previously appeared may not re-appear until at least $\max(0, N_v - 2)$ distinct other voices have each appeared at least once since its last use (where $N_v$ is the ensemble voice count). For a standard 4-voice ensemble this requires 2 intervening distinct voices. This is a pre-hoc search constraint enforced by the `voiceTranspositionAdmissibility` index.
5.  **Voice obligation:** When every voice other than $v$ has appeared since $v$ was last used, $v$ becomes *obligated*: it must be the next voice assigned before any non-obligated voice may repeat. Only one voice can be obligated at a time. Enforced by the same pre-hoc index.
6.  **Terminal coverage:** Every voice in the ensemble must appear at least once within the final $N_v$ entries of the chain (the terminal window starting at position $\max(0, L - N_v)$). Chains whose suffix voice assignments cannot cover all voices — given the remaining slots — are pruned during pre-hoc index construction.

**Implementation note (C.4–C.6):** These three constraints are encoded in the `voiceTranspositionAdmissibilityIndex` (built once per search), which marks each $(i, v_\text{prev}, v_\text{curr})$ transition as admissible or not. The index is used during both Stage 5 DAG traversal (pruning transitions) and the greedy fallback voice assigner. The primary post-hoc CSP backtracker (`assignVoices`) enforces C.1–C.3 and §B independently.

### D. Optional Consonant Termination
If `requireConsonantEnd` is enabled, dissonant endpoints invalidate the chain.

## 2. Scoring Metrics (S1-S3)
Candidates that pass the Hard Constraints are ranked by a composite score derived from these three strict metrics.

### Metric S1: Dissonance Ratio (Unweighted)
The fraction of polyphonic duration that contains any dissonance.
*   **Formula:** $TotalDissonantTime / TotalPolyphonicTime$
*   **Ideal:** Lower is better.

### Metric S2: Dissonance Ratio (Weighted)
Similar to S1, but dissonances occurring on **Strong Beats** are penalized more heavily (1.5x weight).

**Strong beat** — musical definition: the measure downbeat (beat 1) is always strong. In 4/4 and 12/8 only, beat 3 (the mid-measure accent in 4/4) or the second dotted-quarter beat (in 12/8) also carries a strong pulse. All other time signatures have only the downbeat as a strong beat.  
**Code:** `isStrongBeat(tick, ppq, tsNum, tsDenom)` in `components/services/strettoTimeUtils.ts`.

*   **Ideal:** Lower is better.

### Metric S3: Non-Chord Tone (NCT) Ratio
Measures harmonic stability by fitting vertical slices to a strict **Chord Template Library** (Triads, 7ths, Aug6).
*   **Formula:** proportional NCT burden over slices with at least 3 active voices.
*   **Ideal:** Lower indicates cleaner, more triadic harmony.

Metric S4 (Unprepared Dissonance Ratio) is intentionally excluded from the active scorer.

## 3. Scoring Composition
For feasible chains:

$$ S(C)=U_{quality}+B_{compactness}+B_{polyphony}+R_{harmony}-P_{distance}-P_{truncation}-P_{monotony}-P_{harmonyNCT} $$

where

$$ Q = 0.2S1 + 0.3S2 + 0.4S3, \quad U_{quality} = -1000Q $$

and `ScoreLog.base = 0` with no clamp.

Distance penalty decomposition:
1. $-20$ per repeated delay occurrence beyond first use.
2. $-10$ per adjacent delay within $0.5$ beat (left/right counted independently).
3. $-40$ per expansion before the final third of entries.
4. $-40$ per post-truncation contraction miss (with short-delay exemption).

## 4. Analysis Definitions

### Consonance vs. Dissonance
*   **Consonant:** P1, m3, M3, P5, m6, M6, P8.
*   **Dissonant:** m2, M2, TT, m7, M7. 
*   **Contextual:** P4 is dissonant **only** against the bass.

### Parallel Motion Check
Both voices moving into a Perfect 5th or Octave interval from another Perfect interval of the same class is a fatal error subject to chain-context gating: consecutive boundary occurrence is always invalid, and any occurrence is invalid when neither adjacent delay is below `Sb/3`. Parallel P4 is explicitly permitted.

## 5. Explicitly Removed Legacy Additions
* per-unique-distance reward,
* inversion bonus,
* chain-length bonus,
* imperfect-consonance bonus,
* score clamping.
