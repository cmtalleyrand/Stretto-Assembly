
import { Midi, Track } from '@tonejs/midi';
import { ConversionOptions, MidiEventType, PianoRollTrackData } from '../../types';
import { quantizeNotes, performInversion, performModalConversion, pruneOverlaps } from './midiTransform';
import { distributeToVoices } from './midiVoices';

export function copyAndTransformTrackEvents(sourceTrack: Track, destinationTrack: Track, options: ConversionOptions, eventsToDelete: Set<MidiEventType>, header: Midi['header']) {
    let timeScale = options.noteTimeScale;
    if (options.tempoChangeMode === 'time' && options.originalTempo > 0 && options.tempo > 0) {
        timeScale *= options.originalTempo / options.tempo;
    }
    let transformedNotes: any[] = sourceTrack.notes.map((note: any) => {
        let newMidi = note.midi + options.transposition;
        newMidi = Math.max(0, Math.min(127, newMidi));
        
        const { name, ...rest } = note;

        return { 
            ...rest, 
            midi: newMidi, 
            ticks: Math.round(note.ticks * timeScale), 
            durationTicks: Math.round(note.durationTicks * timeScale),
            velocity: note.velocity,
        } as any;
    });

    if (options.removeShortNotesThreshold > 0) {
        transformedNotes = transformedNotes.filter(n => n.durationTicks >= options.removeShortNotesThreshold);
    }

    transformedNotes = quantizeNotes(transformedNotes, options, header.ppq);
    const maxTick = transformedNotes.length > 0 ? Math.max(...transformedNotes.map(n => n.ticks + n.durationTicks)) : 0;
    transformedNotes = performInversion(transformedNotes, options.inversionMode, header.ppq, options.timeSignature, maxTick);
    transformedNotes = performModalConversion(transformedNotes, options);

    const secondsPerTick = (60 / options.tempo) / header.ppq;
    transformedNotes = transformedNotes.map(n => ({ ...n, time: n.ticks * secondsPerTick, duration: n.durationTicks * secondsPerTick }));
    transformedNotes.forEach(note => destinationTrack.addNote(note));
    
    const isGlobalInversion = options.inversionMode === 'global';
    const transformEvent = (e: any) => {
        let ticks = Math.round(e.ticks * timeScale);
        if (isGlobalInversion) ticks = maxTick - ticks;
        return { ...e, ticks, time: ticks * secondsPerTick };
    };

    if (!eventsToDelete.has('controlChange')) {
        Object.values(sourceTrack.controlChanges).flat().forEach((cc: any) => { destinationTrack.addCC(transformEvent(cc)); });
    }
    if (!eventsToDelete.has('pitchBend')) {
        (sourceTrack.pitchBends || []).forEach((pb: any) => { destinationTrack.addPitchBend(transformEvent(pb)); });
    }
    if (!eventsToDelete.has('programChange')) {
        ((sourceTrack as any).programChanges || []).forEach((pc: any) => { (destinationTrack as any).addProgramChange(pc.number, transformEvent(pc).time); });
    }
}

export function createPreviewMidi(originalMidi: Midi, trackId: number, eventsToDelete: Set<MidiEventType>, options: ConversionOptions): Midi {
    if (trackId < 0 || trackId >= originalMidi.tracks.length) throw new Error(`Track ${trackId} not found.`);
    const newMidi = originalMidi.clone();
    newMidi.tracks = []; 
    const originalTrack = originalMidi.tracks[trackId];
    const newTrack = newMidi.addTrack();
    newTrack.name = originalTrack.name;
    newTrack.instrument.number = originalTrack.instrument.number;
    newTrack.instrument.name = originalTrack.instrument.name;
    copyAndTransformTrackEvents(originalTrack, newTrack, options, eventsToDelete, newMidi.header);
    return newMidi;
}

export function getTransformedTrackDataForPianoRoll(originalMidi: Midi, trackId: number, options: ConversionOptions): PianoRollTrackData {
    const newMidi = originalMidi.clone();
    newMidi.tracks = []; 
    const originalTrack = originalMidi.tracks[trackId];
    const newTrack = newMidi.addTrack();
    newTrack.name = originalTrack.name;
    copyAndTransformTrackEvents(originalTrack, newTrack, options, new Set(), newMidi.header);
    const voices = distributeToVoices(newTrack.notes, options) as any[][];
    const noteVoiceMap = new Map<any, number>();
    voices.forEach((voiceNotes, voiceIdx) => { voiceNotes.forEach(n => noteVoiceMap.set(n, voiceIdx)); });
    return {
        notes: newTrack.notes.map(n => ({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks, velocity: n.velocity, name: n.name, voiceIndex: noteVoiceMap.get(n), isOrnament: (n as any).isOrnament })),
        name: newTrack.name,
        ppq: newMidi.header.ppq,
        timeSignature: options.timeSignature
    };
}

export async function combineAndDownload(originalMidi: Midi, trackIds: number[], newFileName: string, eventsToDelete: Set<MidiEventType>, options: ConversionOptions): Promise<void> {
    if (trackIds.length < 1) throw new Error("At least one track must be selected.");
    const newMidi = originalMidi.clone();
    newMidi.tracks = [];
    newMidi.header.setTempo(options.tempo);
    newMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [options.timeSignature.numerator, options.timeSignature.denominator] }];

    const selectedTrackIds = new Set(trackIds);

    // Strategy 1: Keep Separate Tracks
    if (options.outputStrategy === 'separate_tracks') {
        originalMidi.tracks.forEach((track, index) => {
            if (selectedTrackIds.has(index)) {
                const newTrack = newMidi.addTrack();
                newTrack.name = track.name;
                newTrack.instrument.number = track.instrument.number;
                newTrack.instrument.name = track.instrument.name;
                copyAndTransformTrackEvents(track, newTrack, options, eventsToDelete, newMidi.header);
                
                if (options.pruneOverlaps) {
                    const multipliers: number[] = [0, 0.03125, 0.0416, 0.0625, 0.0833, 0.125, 0.1666, 0.25, 0.3333, 0.5, 1.0];
                    const pruneThresholdTicks = Math.round(newMidi.header.ppq * multipliers[options.pruneThresholdIndex]);
                    newTrack.notes = pruneOverlaps(newTrack.notes, pruneThresholdTicks);
                }
            }
        });
    } 
    // Strategy 2 & 3: Combine first (then optionally separate by voice)
    else {
        const combinedTrack = newMidi.addTrack();
        const first = originalMidi.tracks.find((_, index) => selectedTrackIds.has(index));
        if (first) { 
            combinedTrack.instrument.number = first.instrument.number; 
            combinedTrack.instrument.name = first.instrument.name; 
            combinedTrack.name = trackIds.length === 1 ? first.name : "Ensemble";
        }

        originalMidi.tracks.forEach((track, index) => {
            if (selectedTrackIds.has(index)) {
                copyAndTransformTrackEvents(track, combinedTrack, options, eventsToDelete, newMidi.header);
            }
        });

        if (options.pruneOverlaps) {
            const multipliers: number[] = [0, 0.03125, 0.0416, 0.0625, 0.0833, 0.125, 0.1666, 0.25, 0.3333, 0.5, 1.0];
            const pruneThresholdTicks = Math.round(newMidi.header.ppq * multipliers[options.pruneThresholdIndex]);
            combinedTrack.notes = pruneOverlaps(combinedTrack.notes, pruneThresholdTicks);
        }

        // Strategy 3: Separate Voices
        if (options.outputStrategy === 'separate_voices') {
            const voices = distributeToVoices(combinedTrack.notes, options) as any[][];
            newMidi.tracks.pop(); // Remove combined track
            voices.forEach((vNotes, idx) => {
                const voiceTrack = newMidi.addTrack();
                voiceTrack.name = `${combinedTrack.name} - Voice ${idx + 1}`;
                voiceTrack.instrument = combinedTrack.instrument;
                vNotes.forEach(n => voiceTrack.addNote(n));
            });
        }
    }

    const midiBytes = newMidi.toArray();
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = newFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
