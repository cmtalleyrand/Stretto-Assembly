
import { Midi, Track } from '@tonejs/midi';
import { ConversionOptions, TransformationStats } from '../../../types';
import { getQuantizationTickValue, pruneOverlaps } from '../midiTransform';
import { getFormattedTime } from '../midiHarmony';

export function getQuantizationWarning(midi: Midi, selectedTrackIds: Set<number>, options: ConversionOptions): { message: string, details: string[] } | null {
    if ((options.quantizationValue === 'off' && !options.pruneOverlaps) || selectedTrackIds.size === 0) return null;
    const ppq = midi.header.ppq;
    const quantizationTicks = getQuantizationTickValue(options.quantizationValue, ppq);
    
    let clampedNotesCount = 0;
    let microNotesCount = 0;
    const microLocations: Set<string> = new Set();

    selectedTrackIds.forEach(id => {
        const track = midi.tracks[id];
        if (!track) return;
        let timeScale = options.noteTimeScale;
        if (options.tempoChangeMode === 'time' && options.originalTempo > 0 && options.tempo > 0) {
            timeScale *= options.originalTempo / options.tempo;
        }
        track.notes.forEach(n => {
            const scaledTicks = Math.round(n.ticks * timeScale);
            const scaledDur = Math.round(n.durationTicks * timeScale);
            
            if (quantizationTicks > 0) {
                let quantizedDuration = Math.round(scaledDur / quantizationTicks) * quantizationTicks;
                if (quantizedDuration < quantizationTicks) clampedNotesCount++;
                if (quantizedDuration < Math.floor(ppq/32)) {
                    microNotesCount++;
                    microLocations.add(`${n.name} at ${getFormattedTime(scaledTicks, ppq, options.timeSignature.numerator, options.timeSignature.denominator)}`);
                }
            }
        });
    });
    
    if (microNotesCount === 0 && clampedNotesCount === 0) return null;
    
    let msg = "";
    const details: string[] = [];
    if (microNotesCount > 0) {
        msg += `${microNotesCount} tiny notes detected. `;
        microLocations.forEach(l => details.push(`[Micro] ${l}`));
    }
    if (clampedNotesCount > 0) msg += `${clampedNotesCount} notes snapped to min grid.`;
    
    return { message: msg.trim(), details };
}

export function calculateTransformationStats(track: Track, options: ConversionOptions, ppq: number): TransformationStats {
    let processedNotes = track.notes.map(n => ({ ...n }));
    const initialCount = processedNotes.length;
    let removedByDuration = 0;
    let removedByOverlap = 0;
    let truncatedByOverlap = 0;
    let quantizedCount = 0;
    let durationAdjustedCount = 0;
    let notesExtended = 0;
    let notesShortened = 0;
    let totalShift = 0;
    
    let timeScale = options.noteTimeScale;
    if (options.tempoChangeMode === 'time' && options.originalTempo > 0 && options.tempo > 0) {
        timeScale *= options.originalTempo / options.tempo;
    }

    // Filter Short Notes
    if (options.removeShortNotesThreshold > 0) {
        const before = processedNotes.length;
        processedNotes = processedNotes.filter(n => Math.round(n.durationTicks * timeScale) >= options.removeShortNotesThreshold);
        removedByDuration = before - processedNotes.length;
    }
    
    const qTicks = getQuantizationTickValue(options.quantizationValue, ppq);
    let minTicks = 0;
    if (options.quantizeDurationMin !== 'off') {
        minTicks = getQuantizationTickValue(options.quantizeDurationMin, ppq);
    } else if (qTicks > 0) {
        minTicks = qTicks;
    }

    // Alignment Metrics Helper
    // Use target grid if quantization is enabled, otherwise default to 1/16th for baseline measure
    const measureGrid = qTicks > 0 ? qTicks : ppq / 4;
    
    const calculateAlignment = (notes: any[]) => {
        if (notes.length === 0) return 0;
        let onGrid = 0;
        notes.forEach(n => {
            const dist = n.ticks % measureGrid;
            const deviation = Math.min(dist, measureGrid - dist);
            if (deviation < measureGrid * 0.05) onGrid++; // 5% tolerance
        });
        return onGrid / notes.length;
    };

    // Calculate Input Alignment (Scaled)
    // We must scale input ticks to match output tempo context for fair comparison
    const inputSimulated = processedNotes.map(n => ({ ...n, ticks: Math.round(n.ticks * timeScale) }));
    const inputGridAlignment = calculateAlignment(inputSimulated);

    // Apply Quantization & Duration Adjustments
    if (qTicks > 0 || minTicks > 0) {
        processedNotes.forEach(n => {
            const scaledTick = Math.round(n.ticks * timeScale);
            const originalScaledDuration = Math.round(n.durationTicks * timeScale);
            let targetTick = scaledTick;
            
            // Quantize Start
            if (qTicks > 0) {
                targetTick = Math.round(scaledTick / qTicks) * qTicks;
                const diff = Math.abs(targetTick - scaledTick);
                if (diff > 0) {
                    quantizedCount++;
                    totalShift += diff;
                }
                n.ticks = targetTick; 
            } else {
                n.ticks = scaledTick;
            }
            
            // Quantize/Extend Duration
            let targetDuration = originalScaledDuration;
            if (qTicks > 0) targetDuration = Math.round(targetDuration / qTicks) * qTicks;
            if (minTicks > 0) targetDuration = Math.max(targetDuration, minTicks);
            if (targetDuration === 0 && qTicks > 0) targetDuration = qTicks;

            if (targetDuration !== originalScaledDuration) {
                durationAdjustedCount++;
                if (targetDuration > originalScaledDuration) notesExtended++;
                else notesShortened++;
            }
            n.durationTicks = targetDuration;
        });
    } else {
        processedNotes.forEach(n => {
            n.ticks = Math.round(n.ticks * timeScale);
            n.durationTicks = Math.round(n.durationTicks * timeScale);
        });
    }

    // Prune Overlaps
    if (options.pruneOverlaps) {
        const multipliers = [0, 0.03125, 0.0416, 0.0625, 0.0833, 0.125, 0.1666, 0.25, 0.3333, 0.5, 1.0];
        const threshold = Math.round(ppq * multipliers[options.pruneThresholdIndex]);
        const countBefore = processedNotes.length;
        processedNotes.forEach((n, i) => (n as any)._analysisId = i);
        const durationMap = new Map<number, number>();
        processedNotes.forEach(n => durationMap.set((n as any)._analysisId, n.durationTicks));
        const pruned = pruneOverlaps(processedNotes, threshold);
        removedByOverlap = countBefore - pruned.length;
        pruned.forEach(n => {
            const id = (n as any)._analysisId;
            const originalDur = durationMap.get(id);
            if (originalDur !== undefined && n.durationTicks < originalDur) {
                truncatedByOverlap++;
            }
        });
        processedNotes = pruned;
    }

    // Calculate Output Alignment
    const outputGridAlignment = calculateAlignment(processedNotes);

    return {
        totalNotesInput: initialCount,
        totalNotesOutput: processedNotes.length,
        notesRemovedDuration: removedByDuration,
        notesQuantized: quantizedCount,
        notesDurationChanged: durationAdjustedCount,
        notesExtended,
        notesShortened,
        avgShiftTicks: quantizedCount > 0 ? totalShift / quantizedCount : 0,
        notesRemovedOverlap: removedByOverlap,
        notesTruncatedOverlap: truncatedByOverlap,
        inputGridAlignment,
        outputGridAlignment
    };
}
