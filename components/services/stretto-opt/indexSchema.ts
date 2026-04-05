export declare const VariantIndexBrand: unique symbol;
export declare const DelayIndexBrand: unique symbol;
export declare const TranspositionIndexBrand: unique symbol;

export type VariantIndex = number & { readonly [VariantIndexBrand]: 'VariantIndex' };
export type DelayIndex = number & { readonly [DelayIndexBrand]: 'DelayIndex' };
export type TranspositionIndex = number & { readonly [TranspositionIndexBrand]: 'TranspositionIndex' };

export interface VariantNoteLike {
    relTick: number;
    durationTicks: number;
    pitch: number;
}

export interface VariantLike {
    type: string;
    truncationBeats: number;
    lengthTicks: number;
    notes: readonly VariantNoteLike[];
}

export interface IndexBoundsDescriptor {
    readonly variantCount: number;
    readonly delayCount: number;
    readonly transpositionCount: number;
}

export interface StrettoIndexSchema {
    readonly bounds: IndexBoundsDescriptor;
    readonly mapVariantToIndex: (variant: VariantLike) => VariantIndex;
    readonly mapDelayToIndex: (delay: number) => DelayIndex;
    readonly mapTranspositionToIndex: (delta: number) => TranspositionIndex;
    readonly variantFromIndex: (index: VariantIndex) => VariantLike;
    readonly delayFromIndex: (index: DelayIndex) => number;
    readonly transpositionFromIndex: (index: TranspositionIndex) => number;
    readonly variantSignatureFromIndex: (index: VariantIndex) => string;
}

const freezeBoundsDescriptor = (descriptor: IndexBoundsDescriptor): IndexBoundsDescriptor => Object.freeze(descriptor);

const asVariantIndex = (value: number): VariantIndex => value as VariantIndex;
const asDelayIndex = (value: number): DelayIndex => value as DelayIndex;
const asTranspositionIndex = (value: number): TranspositionIndex => value as TranspositionIndex;

const assertFiniteNumber = (label: string, value: number): void => {
    if (!Number.isFinite(value)) {
        throw new Error(`${label} must be a finite number. Received: ${value}`);
    }
};

const variantSignature = (variant: VariantLike): string => {
    const notesSignature = variant.notes
        .map((note) => `${note.relTick}:${note.durationTicks}:${note.pitch}`)
        .join(',');
    return `${variant.type}|${variant.truncationBeats}|${variant.lengthTicks}|${notesSignature}`;
};

const freezeVariant = (variant: VariantLike): VariantLike => Object.freeze({
    type: variant.type,
    truncationBeats: variant.truncationBeats,
    lengthTicks: variant.lengthTicks,
    notes: Object.freeze(variant.notes.map((note) => Object.freeze({
        relTick: note.relTick,
        durationTicks: note.durationTicks,
        pitch: note.pitch
    })))
});

export function createStrettoIndexSchema(
    variants: readonly VariantLike[],
    delays: readonly number[],
    transpositionDeltas: readonly number[]
): StrettoIndexSchema {
    const canonicalVariants: VariantLike[] = [];
    const variantSignatures: string[] = [];
    const variantIndexBySignature = new Map<string, VariantIndex>();

    variants.forEach((variant) => {
        const signature = variantSignature(variant);
        if (!variantIndexBySignature.has(signature)) {
            variantIndexBySignature.set(signature, asVariantIndex(canonicalVariants.length));
            canonicalVariants.push(freezeVariant(variant));
            variantSignatures.push(signature);
        }
    });

    const canonicalDelays: number[] = [];
    const delayIndexByValue = new Map<number, DelayIndex>();
    delays.forEach((delay) => {
        assertFiniteNumber('delay', delay);
        if (!delayIndexByValue.has(delay)) {
            delayIndexByValue.set(delay, asDelayIndex(canonicalDelays.length));
            canonicalDelays.push(delay);
        }
    });

    const canonicalTranspositions: number[] = [];
    const transpositionIndexByValue = new Map<number, TranspositionIndex>();
    transpositionDeltas.forEach((delta) => {
        assertFiniteNumber('transposition delta', delta);
        if (!transpositionIndexByValue.has(delta)) {
            transpositionIndexByValue.set(delta, asTranspositionIndex(canonicalTranspositions.length));
            canonicalTranspositions.push(delta);
        }
    });

    const bounds = freezeBoundsDescriptor({
        variantCount: canonicalVariants.length,
        delayCount: canonicalDelays.length,
        transpositionCount: canonicalTranspositions.length
    });

    const mapVariantToIndex = (variant: VariantLike): VariantIndex => {
        const signature = variantSignature(variant);
        const index = variantIndexBySignature.get(signature);
        if (index === undefined) {
            throw new Error(`Unknown variant signature: ${signature}`);
        }
        return index;
    };

    const mapDelayToIndex = (delay: number): DelayIndex => {
        assertFiniteNumber('delay', delay);
        const index = delayIndexByValue.get(delay);
        if (index === undefined) {
            throw new Error(`Unknown delay value: ${delay}`);
        }
        return index;
    };

    const mapTranspositionToIndex = (delta: number): TranspositionIndex => {
        assertFiniteNumber('transposition delta', delta);
        const index = transpositionIndexByValue.get(delta);
        if (index === undefined) {
            throw new Error(`Unknown transposition delta: ${delta}`);
        }
        return index;
    };

    const variantFromIndex = (index: VariantIndex): VariantLike => {
        const resolved = canonicalVariants[index as number];
        if (!resolved) {
            throw new Error(`Variant index out of range: ${index as number}`);
        }
        return resolved;
    };

    const delayFromIndex = (index: DelayIndex): number => {
        const resolved = canonicalDelays[index as number];
        if (resolved === undefined) {
            throw new Error(`Delay index out of range: ${index as number}`);
        }
        return resolved;
    };

    const transpositionFromIndex = (index: TranspositionIndex): number => {
        const resolved = canonicalTranspositions[index as number];
        if (resolved === undefined) {
            throw new Error(`Transposition index out of range: ${index as number}`);
        }
        return resolved;
    };

    const variantSignatureFromIndex = (index: VariantIndex): string => {
        const resolved = variantSignatures[index as number];
        if (!resolved) {
            throw new Error(`Variant index out of range: ${index as number}`);
        }
        return resolved;
    };

    return {
        bounds,
        mapVariantToIndex,
        mapDelayToIndex,
        mapTranspositionToIndex,
        variantFromIndex,
        delayFromIndex,
        transpositionFromIndex,
        variantSignatureFromIndex
    };
}
