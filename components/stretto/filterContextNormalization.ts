export function normalizeLexical(values: Set<string>): string[] {
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function normalizeNumericStrings(values: Set<string>): string[] {
    return Array.from(values).sort((a, b) => parseFloat(a) - parseFloat(b));
}
