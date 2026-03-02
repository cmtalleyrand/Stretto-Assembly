import { RawNote } from '../../../../types';
import { getStrictPitchName } from '../../midiSpelling';
import { 
    WEIGHT_STRONG_BEAT, WEIGHT_MEDIUM_BEAT, WEIGHT_WEAK_BEAT, 
    WEIGHT_SUBDIVISION, WEIGHT_OFF_BEAT,
    MOD_APPROACH_LEAP, MOD_APPROACH_STEP, MOD_APPROACH_OTHER,
    HIANote
} from './hiaDefs';

export function getMetricWeight(tick: number, ppq: number, tsNum: number, tsDenom: number): number {
    const quarters = tick / ppq;
    const measureLenQuarters = tsNum * (4 / tsDenom);
    const measurePos = quarters % measureLenQuarters;
    
    // Compound Meters
    if (tsDenom === 8) {
        const beatUnit = 1.5; 
        const beatIndexRaw = measurePos / beatUnit;
        const beatIndex = Math.round(beatIndexRaw);
        const distToBeat = Math.abs(beatIndexRaw - beatIndex) * beatUnit; 

        if (distToBeat < 0.1) {
            if (tsNum === 12) {
                if (beatIndex === 0) return WEIGHT_STRONG_BEAT;
                if (beatIndex === 2) return WEIGHT_MEDIUM_BEAT; 
                return WEIGHT_WEAK_BEAT;
            }
            if (tsNum === 9 || tsNum === 6) {
                if (beatIndex === 0) return WEIGHT_STRONG_BEAT;
                return WEIGHT_WEAK_BEAT;
            }
            if (beatIndex === 0) return WEIGHT_STRONG_BEAT;
            return WEIGHT_WEAK_BEAT;
        }
        
        const eighthIndexRaw = measurePos / 0.5;
        const distToEighth = Math.abs(Math.round(eighthIndexRaw) - eighthIndexRaw) * 0.5;
        if (distToEighth < 0.1) return WEIGHT_SUBDIVISION;

        return WEIGHT_OFF_BEAT;
    } 
    
    // Simple Meters
    else {
        const beatIndexRaw = measurePos; 
        const beatIndex = Math.round(beatIndexRaw);
        const distToBeat = Math.abs(beatIndexRaw - beatIndex);

        if (distToBeat < 0.1) {
            if (beatIndex === 0) return WEIGHT_STRONG_BEAT;
            if (tsNum === 4 && beatIndex === 2) return WEIGHT_MEDIUM_BEAT; 
            return WEIGHT_WEAK_BEAT;
        }
        
        const eighthIndexRaw = measurePos / 0.5;
        const distToEighth = Math.abs(Math.round(eighthIndexRaw) - eighthIndexRaw);
        if (distToEighth < 0.1) return WEIGHT_SUBDIVISION;

        return WEIGHT_OFF_BEAT;
    }
}

export function getApproachModifier(current: RawNote, prevMidi?: number): { mod: number, delta: number | null } {
    if (prevMidi === undefined || prevMidi === null) return { mod: 1.0, delta: null };
    
    const delta = current.midi - prevMidi;
    const interval = Math.abs(delta);
    
    // Leaps: 4th (5), 5th (7), Octave (12) -> Bonus
    if (interval === 5 || interval === 7 || interval === 12) return { mod: MOD_APPROACH_LEAP, delta };
    
    // Steps: m2 (1), M2 (2) -> Penalty (Melodic motion less harmonic than leaps)
    if (interval === 1 || interval === 2) return { mod: MOD_APPROACH_STEP, delta };
    
    // 3rds (3,4), 6ths (8,9), Tritone (6) -> Neutral
    return { mod: MOD_APPROACH_OTHER, delta };
}

export function calculateBaseSalience(note: RawNote, ppq: number, tsNum: number, tsDenom: number, prevVoiceMidi?: number): HIANote {
    const quarters = note.durationTicks / ppq;
    
    // Updated Duration Formula: (quarters - 0.05)
    // Clamp to minimum 0.01 to avoid zeroing out valid short notes entirely
    const durationScore = Math.max(0.01, quarters - 0.05);

    const metricWeight = getMetricWeight(note.ticks, ppq, tsNum, tsDenom);
    const { mod: approachMod, delta } = getApproachModifier(note, prevVoiceMidi);
    
    // Safety check for note name
    const noteName = note.name || getStrictPitchName(note.midi);

    // Encode delta in name for audit log visibility if available, strictly for debug
    // (We don't change the name here to avoid polluting the rest of the app, 
    // instead we can store delta in HIANote if we extend it, or just rely on the fact 
    // that HIANote is used locally. Let's not mutate name.)

    return {
        ...note,
        name: noteName, 
        baseSalience: durationScore * metricWeight * approachMod,
        voicePrevMidi: prevVoiceMidi,
        approachModifier: approachMod,
        // Hack: We can't easily add a new field to HIANote without changing all types, 
        // but we can piggyback or just trust the audit log will re-derive it if needed. 
        // Actually, let's just ensure the audit log uses approachModifier.
    };
}