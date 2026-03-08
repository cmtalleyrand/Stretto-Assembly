
# Project Intent & Target Architecture

This document defines the **Desired End State** of the application. All future code changes must align with these specifications.

## 1. Data Pipeline Architecture

The application assumes **Pre-Processed / Intentional MIDI Inputs**. 
*   **No Aggressive Correction:** The system should NOT attempt complex "Shadow Quantization" or heuristic grid alignment to fix performance errors. It assumes the input MIDI is musically correct or that any desired quantization is simple and manual.
*   **Analysis Integrity:** While we do not auto-correct the notes, the **Analysis Reports** (Rhythm, Harmony) must still provide deep insights into the structure of the data as provided.


## 2. Harmonic Analysis & Arpeggiation

The user requires sophisticated Chord Identification capabilities, specifically handling arpeggiation logic.

### Harmonic Modes
1.  **Attack (Block):** Chords are identified by notes starting simultaneously (within a small tolerance).
2.  **Sustain:** Chords are identified by the set of notes currently held down (overlapping durations).
3.  **Arpeggio (Time Window):** Treats the whole texture as a potential arpeggio within a time window.

## 3. Visual & Reporting Requirements
*   **Tables:** All analysis outputs must be in detailed Markdown tables, not summary lists.
*   **Spelling:** Use key-aware spelling for pitch names.

---

## 5. Stretto Logic Specification (v3.1)

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
