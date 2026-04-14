export function formatQuarterNoteUnits(value: number): string {
    if (!Number.isFinite(value)) return '?';
    const normalized = Math.round(value * 2) / 2;
    const whole = Math.trunc(normalized);
    const hasHalf = Math.abs(normalized - whole) > 1e-9;

    if (normalized === 0.5) return '1/2Q';
    if (!hasHalf) return `${whole}Q`;
    return `${whole} 1/2Q`;
}
