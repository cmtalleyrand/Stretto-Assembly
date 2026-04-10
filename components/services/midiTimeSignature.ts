type HeaderTimeSignatureEvent = {
    ticks?: number;
    timeSignature?: number[];
};

export function resolveMidiTimeSignatureAtTick(
    timeSignatures: HeaderTimeSignatureEvent[] | undefined,
    tick: number = 0
): [number, number] {
    if (!timeSignatures || timeSignatures.length === 0) return [4, 4];

    const sorted = [...timeSignatures]
        .filter((entry) => Array.isArray(entry.timeSignature) && entry.timeSignature.length >= 2)
        .sort((a, b) => (a.ticks ?? 0) - (b.ticks ?? 0));

    if (sorted.length === 0) return [4, 4];

    let chosen = sorted[0].timeSignature as number[];
    for (const entry of sorted) {
        const entryTick = entry.ticks ?? 0;
        if (entryTick <= tick) {
            chosen = entry.timeSignature as number[];
            continue;
        }
        break;
    }

    const numerator = chosen[0];
    const denominator = chosen[1];
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
        return [4, 4];
    }
    return [Math.round(numerator), Math.round(denominator)];
}
