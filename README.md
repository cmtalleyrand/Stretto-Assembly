
# MIDI Track Combiner & Analyzer

A powerful web-based tool for processing, analyzing, and transforming MIDI files. This application allows musicians and developers to upload MIDI files, analyze their harmonic and rhythmic content, apply rigorous quantization and transformations, and export the results as new MIDI files or ABC notation.

## Key Features

### 1. Track Management & Playback
- **Upload & Parse:** Drag and drop support for `.mid` files using `@tonejs/midi`.
- **Track Selection:** Choose specific tracks to process or analyze.
- **Audio Preview:** Real-time preview of individual tracks using `Tone.js` polyphonic synths.
- **Piano Roll:** Interactive visual inspection of track notes with zoom controls and voice coloring.

### 2. Analysis Engine
Deep inspection of MIDI data to inform processing decisions.
- **Rhythmic Integrity:** visualizes how "tight" the playing is against the grid and consistent the note durations are.
- **Key & Mode Prediction:** Algorithms to detect the likely key (Major, Minor, Dorian, Phrygian, etc.) and even exotic modes based on pitch class histograms.
- **Chord Detection:** Four distinct algorithms to identify harmonies:
  - *Sustain:* Chords formed by overlapping held notes.
  - *Attack:* Block chords struck simultaneously (with configurable tolerance).
  - *Hybrid:* Intelligent detection for arpeggiated or polyphonic textures based on voice config.
  - *Beat Synced:* Harmonies normalized to specific beat buckets (Harmonic Rhythm).
- **Voice Leading:** Histograms of melodic intervals to analyze the smoothness of lines.

### 3. Transformation Pipeline (The "Shadow Grid")
The application uses a sophisticated 2-pass "Shadow Quantization" engine logic:
- **Quantization:** Snap notes to standard (1/4, 1/8, 1/16) or tuplets grids (Triplets, Quintuplets).
- **Duration Constraints:** Enforce minimum note lengths to clean up staccato performance or "ghost notes".
- **Overlap Pruning:** Intelligently shorten notes to prevent monophonic overlap conflicts, essential for clean sheet music export.
- **Time Scaling:** Change tempo or double/half-time the rhythm (Augmentation/Diminution).
- **Inversion:** Retrograde (play backwards) support, including segmented inversion (e.g., reverse every measure).
- **Modal Conversion:** Remap pitches from one scale/mode to another (e.g., C Major to C Minor).

### 4. Voice Separation
An algorithm to split polyphonic tracks (piano/guitar) into separate monophonic voices (SATB).
- **Logic:** Uses density analysis to determine structural polyphony, then assigns notes to voices based on pitch-proximity pathfinding and vertical sorting.
- **Configurable:** Adjust overlap tolerance and pitch bias (Horizontal smoothness vs Vertical strictness).

### 5. Export
- **MIDI Download:** Get the processed file.
- **ABC Notation:** Export to text-based sheet music format, preserving the calculated voice separation and quantization.

## Technical Architecture

### Core Tech Stack
- **Framework:** React 18 (TypeScript)
- **Styling:** Tailwind CSS
- **Audio/MIDI:** `tone`, `@tonejs/midi`
- **Build:** Standard ES Modules (no bundler config required for editing in this environment).

### Directory Structure
- `components/`: UI Components.
  - `analysis/`: Visualization components (Reports, Charts).
  - `settings/`: Configuration panels.
  - `services/`: Core logic (non-UI).
    - `midiCore.ts`: Parsing and Ornament detection.
    - `midiTransform.ts`: Quantization and Time manipulation.
    - `midiHarmony.ts`: Chord detection algorithms.
    - `midiVoices.ts`: Polyphonic voice separation logic.
    - `midiPipeline.ts`: The main processing chain connecting inputs to outputs.
- `hooks/`: State management (`useMidiController`).
- `types.ts`: Shared TypeScript interfaces.

## Usage Guide

1.  **Upload:** Drop a MIDI file onto the landing zone.
2.  **Select:** Check the boxes for the tracks you want to include.
3.  **Analyze (Optional):** Click the "Chart" icon on a track to view its key, rhythm, and chords. Use this to determine the best settings.
4.  **Configure:**
    - *Tempo & Time:* Set the target BPM or Time Signature.
    - *Transform:* Transpose, Scale Time, or apply Inversion.
    - *Voice Separation:* Configure how chords are split if "Separate Voices" is chosen.
    - *Quantization:* Apply grid snapping. **Check the Quantization Warning** to see if you are destroying musical detail (micro-notes).
5.  **Process:** Click "Download MIDI" to get the result, or "Export ABC" for sheet music.
