
# Stretto Scoring Mechanism Specification v1.1

## Objective
To algorithmically rank Stretto Chain candidates so that the most musically significant, valid, and interesting results appear at the top of the list.

## 1. Validity Constraints (The "Gatekeepers")
Before a candidate is scored, it must pass these hard checks. If it fails, it is discarded immediately.

### A. Consonant Termination (New)
*   **Rule:** The last note of every voice entry must form a consonance (P1, m3, M3, P5, m6, M6, P8) with at least one other active voice.
*   **Purpose:** Excludes "pure unresolved dissonances" where a voice trails off on a clashing note.
*   **Config:** Enabled by default (Toggle: `Require Consonant End`).

### B. No Unison Chains
*   **Rule:** A voice cannot enter at the exact same transposition interval as the immediately preceding voice.
*   **Purpose:** Prevents "Unison stacking" (e.g., Voice 1 at P1, Voice 2 at P1) which creates clumps rather than counterpoint.

---

## 2. The Scoring Formula

Candidates that pass validity are ranked using a **Base Score** of 1000.

$$ S_{total} = 1000 - P_{errors} - P_{truncation} - P_{monotony} + B_{compactness} + B_{variety} + B_{complexity} $$

### Penalties ($P$)

#### A. Contrapuntal Errors ($P_{errors}$)
*   **Parallel Perfects (5ths/8ves):**
    *   **Fatal (Strong Beat):** $-500$ points.
    *   **Warning (Weak Beat):** $-100$ points.
*   **Dissonance Runs:**
    *   Consecutive dissonant beats without resolution: $-150$ points.

#### B. Truncation ($P_{truncation}$)
*   **Cost:** $-20$ points per *beat* of the subject removed.

#### C. Monotony / Clumping ($P_{monotony}$)
*   **Rule:** We want a range of intervals, not clumps of the same one. // and distsnces!!!
*   **Cost:** $-100$ points if any single interval type (e.g., "+P5") makes up more than 50% of the entry relationships.

### Bonuses ($B$)

#### A. Compactness ($B_{compactness}$)
Rewards "Hyper-Stretto" (entries that occur very soon after the previous one).
*   **Formula:** For each entry $e$:
    *   If $Delay_e < 25\%$ of Subject Length: $+50$ points.
    *   If $Delay_e < 50\%$ of Subject Length: $+25$ points.

#### B. Interval Variety ($B_{variety}$)
Rewards using a diverse palette of intervals (e.g., mixing 5ths, Octaves, and 3rds) rather than just stacking one type.
*   **Unique Count Bonus:** $+40$ points for every *unique* transposition interval used in the chain beyond the first.
    *   *Example:* A chain using `{0, +7, +12}` (P1, P5, P8) gets $+80$ points. A chain using `{0, +7, +7}` gets $0$ points.
*   **Imperfect Consonance:** $+30$ points for entries at 3rds or 6ths.

#### C. Complexity ($B_{complexity}$)
*   **Inversion:** $+100$ points per inverted voice.
*   **Length:** $+10$ points per extra voice beyond 2. // temove


---

## 3. Implementation Logic

```typescript
function calculateChainScore(chain: StrettoChainResult): number {
    let score = 1000;

    // 1. Penalties
    score -= (chain.warnings.length * 100); 

    // 2. Truncation
    chain.entries.forEach(e => {
        // ... calc missing beats ...
        score -= (missingBeats * 20);
    });

    // 3. Compactness
    chain.entries.forEach((e, i) => {
        if (i === 0) return;
        const delay = e.startBeat - chain.entries[i-1].startBeat;
        // ... calc ratio ...
        if (ratio <= 0.25) score += 50;
    });

    // 4. Interval Variety & Clumping
    const intervals = new Set<number>();
    const intervalCounts: Record<number, number> = {};
    
    chain.entries.forEach((e, i) => {
        if (i === 0) return;
        const relInt = e.transposition - chain.entries[i-1].transposition;
        intervals.add(relInt);
        intervalCounts[relInt] = (intervalCounts[relInt] || 0) + 1;
    });

    // Variety Bonus
    const uniqueCount = intervals.size;
    if (uniqueCount > 1) {
        score += (uniqueCount - 1) * 40;
    }

    // Clumping Penalty
    const totalLinks = chain.entries.length - 1;
    if (totalLinks > 2) {
        for (const k in intervalCounts) {
            if (intervalCounts[k] > totalLinks * 0.5) {
                score -= 100; // Penalty for overuse of one interval
                break;
            }
        }
    }

    return Math.max(0, score);
}
```
