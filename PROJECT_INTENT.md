
# Project Intent & Target Architecture

This document defines the **Desired End State** of the application. All future code changes must align with these specifications.

## 1. Data Pipeline Architecture

The application assumes **Pre-Processed / Intentional MIDI Inputs**. 
*   **No Aggressive Correction:** The system should NOT attempt complex "Shadow Quantization" or heuristic grid alignment to fix performance errors. It assumes the input MIDI is musically correct or that any desired quantization is simple and manual.
*   **Analysis Integrity:** While we do not auto-correct the notes, the **Analysis Reports** (Rhythm, Harmony) must still provide deep insights into the structure of the data as provided.

### Processing Order
1.  **Parse & Filter:** Ingest raw MIDI; remove unwanted events.
2.  **Section Identification:** 
    *   **Boundary:** A new Section is created whenever there is a period of silence **equal to or greater than 1 measure**.
3.  **Identify Ornaments:** Detect musical ornaments (Trills, Turns, Grace Notes).
4.  **Transformation (Optional):** Apply simple user-defined transformations (Transpose, Time Scale, basic Grid Snap) only if explicitly configured.
5.  **Voice Separation:** Distribute notes into voices based on pitch/density.
6.  **Export/Render:** Generate outputs.

## 2. Harmonic Analysis & Arpeggiation

The user requires sophisticated Chord Identification capabilities, specifically handling arpeggiation logic.

### Harmonic Modes
1.  **Attack (Block):** Chords are identified by notes starting simultaneously (within a small tolerance).
2.  **Sustain:** Chords are identified by the set of notes currently held down (overlapping durations).
3.  **Hybrid:** Configurable per-voice logic.
4.  **Arpeggio (Time Window):** *Replaces "Beat Synced".* Treats the whole texture as a potential arpeggio within a time window.

## 3. Visual & Reporting Requirements
*   **Tables:** All analysis outputs must be in detailed Markdown tables, not summary lists.
*   **Per-Voice Data:** Frequency, Interval, and Rhythm stats must be broken down by individual voice.
*   **Spelling:** Use key-aware spelling for pitch names.

## 4. Constraints
*   **Simplify Input Processing:** Do not add complex quantization logic. Trust the input.
*   **Preserve Complexity:** Do not simplify the *output* analysis or the chord logic itself.

---

## 5. Formal Specification: Harmonic Implication Algorithm (HIA) v2.2

### I. Directionality: The Time-Arrow
The algorithm MUST operate in a **Forward** direction (Beat 1 -> End). 

### II. Lookahead (Anticipation)
The algorithm employs a **Lookahead Window** of up to 2 beats into the future.

### III. Note Salience and Weighted Evidence
`S_N = D * W_m * A` (Duration, Metric Weight, Approach Modifier).

### IV. Global Optimization
Viterbi (Beam Search) maximizing path score over the whole sequence.

---

## 6. Stretto Logic Specification (v3.1)

### I. Distance Rules
1.  **Rule 6.1 (Unified Ceiling):** Entry Delay $Delay \le \text{SubjectLength} \times 0.66$ (66%). This applies to both Discovery and Chain menus.
2.  **Elasticity:** $Delay_{new} \le Delay_{prev} + 1.0$.
3.  **Expansion Reaction:** If $Delay_{new} > Delay_{prev}$, the *next* delay must be significantly smaller.

### II. Scoring Indicators (Base Score: 0)

**1. Polyphony (30% Weight)**
**2. Dissonance (30-40% Weight)**
**3. Harmonic Quality (Sustain Mode)**

### III. Unified Pivot Logic
1.  **Rule 6.5:** The Inversion Pivot selection must be shared between Pairwise Discovery and Algorithmic Chain search to ensure that "Candidate #5 (Inv)" in the list sounds identical to "Entry #5 (Inv)" in a generated chain.
