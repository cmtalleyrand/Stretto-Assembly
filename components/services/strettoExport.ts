
import { StrettoCandidate } from '../../types';
import { Midi } from '@tonejs/midi';
import { getVoiceLabel } from './midiVoices';
import { resolveTimeSignature, TimeSignatureValue } from './timeSignatureResolver';

/**
 * Generates and downloads a multi-track MIDI file representing the Stretto result.
 * Fixes "Cannot set property ppq" error by scaling ticks instead of modifying read-only header.
 */
export function downloadStrettoCandidate(
    candidate: StrettoCandidate,
    sourcePpq: number,
    voiceNames?: Record<number, string>,
    subjectName: string = "Untitled",
    timeSignature?: TimeSignatureValue
) {
    const midi = new Midi();
    
    // Tone.js MIDI instances default to 480 PPQ. 
    // We scale incoming ticks to this resolution to avoid modifying read-only header properties.
    const TARGET_PPQ = 480; 
    const scaleFactor = TARGET_PPQ / sourcePpq;
    
    // Set basic metadata
    midi.header.setTempo(120);
    const [numerator, denominator] = resolveTimeSignature(timeSignature);
    midi.header.timeSignatures.push({
        timeSignature: [numerator, denominator],
        ticks: 0,
    });
    
    // Group notes by voice index
    const notesByVoice: Record<number, StrettoCandidate['notes']> = {};
    candidate.notes.forEach(n => {
        const v = n.voiceIndex ?? 0;
        if (!notesByVoice[v]) notesByVoice[v] = [];
        notesByVoice[v].push(n);
    });

    const voiceIndices = Object.keys(notesByVoice).map(Number).sort((a,b) => a-b);
    
    // Determine total count for fallback labels
    const maxIdx = voiceIndices.length > 0 ? Math.max(...voiceIndices) : 0;
    const totalVoicesForLabeling = maxIdx + 1;

    voiceIndices.forEach(vIdx => {
        const track = midi.addTrack();
        
        // Use user-assigned voice name if available, else fallback to algorithmic label
        const nameFromConfig = voiceNames?.[vIdx];
        track.name = nameFromConfig || getVoiceLabel(vIdx, totalVoicesForLabeling);
        
        // Standard channel assignment (0-15)
        track.channel = vIdx % 16;
        track.instrument.number = 0; // Acoustic Grand Piano default
        
        const voiceNotes = [...notesByVoice[vIdx]].sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
        voiceNotes.forEach(n => {
            track.addNote({
                midi: n.midi,
                ticks: Math.round(n.ticks * scaleFactor),
                durationTicks: Math.round(n.durationTicks * scaleFactor),
                velocity: n.velocity
            });
        });
    });

    // Prepare and trigger download
    const midiBytes = midi.toArray();
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Descriptive filename logic
    const safeSubject = subjectName.replace(/[^a-z0-9]/gi, '_').slice(0, 25);
    const dateStr = new Date().toISOString().slice(0,16).replace(/[:T]/g, '-');
    
    let filename = `Stretto_${safeSubject}`;
    
    if (candidate.intervalLabel === "Chain") {
        // Chain specific naming
        const voiceCount = voiceIndices.length;
        filename += `_Chain_${voiceCount}Voices_${dateStr}`;
    } else {
        // Pairwise specific naming
        const safeLabel = candidate.intervalLabel.replace(/[^a-z0-9]/gi, '');
        filename += `_${safeLabel}_${candidate.delayBeats}beats_${dateStr}`;
    }
    
    a.download = `${filename}.mid`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Bundles multiple candidates into a single multi-track MIDI file.
 */
export function downloadStrettoSelection(
    candidates: StrettoCandidate[],
    sourcePpq: number,
    voiceNames?: Record<number, string>,
    subjectName: string = "Untitled",
    timeSignature?: TimeSignatureValue
) {
    if (candidates.length === 0) return;

    const midi = new Midi();
    const TARGET_PPQ = 480; 
    const scaleFactor = TARGET_PPQ / sourcePpq;
    
    midi.header.setTempo(120);
    const [numerator, denominator] = resolveTimeSignature(timeSignature);
    midi.header.timeSignatures.push({ timeSignature: [numerator, denominator], ticks: 0 });

    candidates.forEach((candidate, cIdx) => {
        // Group notes by voice index
        const notesByVoice: Record<number, StrettoCandidate['notes']> = {};
        candidate.notes.forEach(n => {
            const v = n.voiceIndex ?? 0;
            if (!notesByVoice[v]) notesByVoice[v] = [];
            notesByVoice[v].push(n);
        });

        const voiceIndices = Object.keys(notesByVoice).map(Number).sort((a,b) => a-b);
        if (voiceIndices.length === 0) return;
        const totalInCand = Math.max(...voiceIndices) + 1;

        voiceIndices.forEach(vIdx => {
            const track = midi.addTrack();
            const baseName = voiceNames?.[vIdx] || getVoiceLabel(vIdx, totalInCand);
            track.name = `S${cIdx+1} - ${baseName} (${candidate.intervalLabel})`;
            
            // Channel offset per candidate to avoid cross-talk if possible
            track.channel = (cIdx * 2 + vIdx) % 16;
            track.instrument.number = 0;

            const voiceNotes = [...notesByVoice[vIdx]].sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
            voiceNotes.forEach(n => {
                track.addNote({
                    midi: n.midi,
                    ticks: Math.round(n.ticks * scaleFactor),
                    durationTicks: Math.round(n.durationTicks * scaleFactor),
                    velocity: n.velocity
                });
            });
        });
    });

    const midiBytes = midi.toArray();
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const safeSubject = subjectName.replace(/[^a-z0-9]/gi, '_').slice(0, 25);
    const dateStr = new Date().toISOString().slice(0,16).replace(/[:T]/g, '-');
    a.download = `Stretto_Selection_${safeSubject}_${candidates.length}items_${dateStr}.mid`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
