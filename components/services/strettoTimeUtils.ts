
function resolveBeatAndMeasureTicks(ppq: number, tsNum: number, tsDenom: number): { beatTicks: number; measureTicks: number } {
    const measureTicks = ppq * tsNum * (4 / tsDenom);
    const isCompound = tsDenom === 8 && tsNum % 3 === 0 && tsNum >= 6;
    const beatTicks = isCompound ? (3 * ppq) / 2 : ppq * (4 / tsDenom);
    return { beatTicks, measureTicks };
}

/**
 * Returns true if the given tick falls on a metrically strong position.
 *
 * Musical definition: the measure downbeat (beat 1) is always strong. In 4/4 and 12/8 only,
 * beat 3 (the mid-measure accent) also carries a strong pulse. All other time signatures
 * have only the downbeat as a strong beat.
 *
 * See STRETTO_RULES.md §S2 for the scoring use of this predicate.
 */
export function isStrongBeat(tick: number, ppq: number, tsNum: number = 4, tsDenom: number = 4): boolean {
    const { beatTicks, measureTicks } = resolveBeatAndMeasureTicks(ppq, tsNum, tsDenom);
    const posInMeasure = ((tick % measureTicks) + measureTicks) % measureTicks;
    const eps = 1e-6;

    if (Math.abs(posInMeasure) < eps) return true;

    // Second strong pulse only in 4/4 and 12/8 (beat 3 / second dotted-quarter beat).
    const hasSecondStrongPulse = (tsNum === 4 && tsDenom === 4) || (tsNum === 12 && tsDenom === 8);
    if (!hasSecondStrongPulse) return false;

    return Math.abs(posInMeasure - 2 * beatTicks) < eps;
}
