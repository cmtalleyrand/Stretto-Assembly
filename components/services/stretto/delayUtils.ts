import { RawNote } from '../../../types';

export function computeMaxDelayAutoBeats(notes: RawNote[], ppq: number, meterDenominator: number): number {
    const validNotes = notes.filter(Boolean);
    if (validNotes.length === 0) return 0;
    const durationTicks = Math.max(...validNotes.map((n) => n.ticks + n.durationTicks));
    const beatDiv = ppq * (4 / meterDenominator);
    return parseFloat(((durationTicks * (2 / 3)) / beatDiv).toFixed(2));
}

export function computeDiscoveryDelayBounds(params: {
    notes: RawNote[];
    ppq: number;
    meterDenominator: number;
    minDelayBeats: number;
    maxDelayBeatsInput: string;
    stepTicks: number;
}): { effectiveMinDelayTicks: number; effectiveMaxDelayTicks: number; durationTicks: number; beatDiv: number } {
    const validNotes = params.notes.filter(Boolean);
    if (validNotes.length === 0) {
        return { effectiveMinDelayTicks: 0, effectiveMaxDelayTicks: 0, durationTicks: 0, beatDiv: params.ppq * (4 / params.meterDenominator) };
    }
    const durationTicks = Math.max(...validNotes.map((n) => n.ticks + n.durationTicks));
    const beatDiv = params.ppq * (4 / params.meterDenominator);
    const autoMaxTicks = durationTicks * (2 / 3);
    const userMaxTicks = params.maxDelayBeatsInput !== '' ? parseFloat(params.maxDelayBeatsInput) * beatDiv : autoMaxTicks;
    const effectiveMaxDelayTicks = Math.min(userMaxTicks, autoMaxTicks);
    const effectiveMinDelayTicks = Math.max(params.stepTicks, Math.round(params.minDelayBeats * beatDiv));
    return { effectiveMinDelayTicks, effectiveMaxDelayTicks, durationTicks, beatDiv };
}
