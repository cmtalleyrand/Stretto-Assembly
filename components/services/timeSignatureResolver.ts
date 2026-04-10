export interface TimeSignatureValue {
    numerator: number;
    denominator: number;
}

export function resolveTimeSignature(timeSignature?: TimeSignatureValue): [number, number] {
    const numerator = timeSignature?.numerator ?? 4;
    const denominator = timeSignature?.denominator ?? 4;
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
        return [4, 4];
    }
    return [Math.round(numerator), Math.round(denominator)];
}
