export interface CompatMatrixDimensions {
    V: number;
    D: number;
    T: number;
}

export interface CompatCell {
    status: number;
    constraintClass: number;
}

export interface CompatMatrix {
    readonly dimensions: CompatMatrixDimensions;
    readonly cellCount: number;
    flattenIndex(vi: number, vj: number, d_idx: number, ti: number): number;
    unflattenIndex(index: number): { vi: number; vj: number; d_idx: number; ti: number };
    set(vi: number, vj: number, d_idx: number, ti: number, cell: CompatCell): void;
    get(vi: number, vj: number, d_idx: number, ti: number): CompatCell;
}

export interface CompatMatrixOptions {
    maxDenseBytes?: number;
}

const STATUS_MASK = 0b0000_0011;
const CONSTRAINT_MASK = 0b0011_1100;
const CONSTRAINT_SHIFT = 2;
const MAX_STATUS = STATUS_MASK;
const MAX_CONSTRAINT_CLASS = CONSTRAINT_MASK >> CONSTRAINT_SHIFT;
const DEFAULT_MAX_DENSE_BYTES = 64 * 1024 * 1024;
const DEV_MODE = process.env.NODE_ENV !== 'production';

function assertInt(name: string, value: number): void {
    if (!Number.isInteger(value)) {
        throw new RangeError(`${name} must be an integer; received ${value}`);
    }
}

function assertRange(name: string, value: number, size: number): void {
    assertInt(name, value);
    if (value < 0 || value >= size) {
        throw new RangeError(`${name} out of range: ${value}; expected 0 <= ${name} < ${size}`);
    }
}

function assertDims(dims: CompatMatrixDimensions): void {
    assertInt('V', dims.V);
    assertInt('D', dims.D);
    assertInt('T', dims.T);
    if (dims.V <= 0 || dims.D <= 0 || dims.T <= 0) {
        throw new RangeError(`all dimensions must be positive; received V=${dims.V}, D=${dims.D}, T=${dims.T}`);
    }
}

function assertCell(cell: CompatCell): void {
    assertInt('status', cell.status);
    assertInt('constraintClass', cell.constraintClass);
    if (cell.status < 0 || cell.status > MAX_STATUS) {
        throw new RangeError(`status out of range: ${cell.status}; expected 0 <= status <= ${MAX_STATUS}`);
    }
    if (cell.constraintClass < 0 || cell.constraintClass > MAX_CONSTRAINT_CLASS) {
        throw new RangeError(`constraintClass out of range: ${cell.constraintClass}; expected 0 <= constraintClass <= ${MAX_CONSTRAINT_CLASS}`);
    }
}

function pack(cell: CompatCell): number {
    return (cell.status & STATUS_MASK) | ((cell.constraintClass << CONSTRAINT_SHIFT) & CONSTRAINT_MASK);
}

function unpack(packed: number): CompatCell {
    return {
        status: packed & STATUS_MASK,
        constraintClass: (packed & CONSTRAINT_MASK) >> CONSTRAINT_SHIFT
    };
}

class DenseCompatMatrix implements CompatMatrix {
    public readonly dimensions: CompatMatrixDimensions;
    public readonly cellCount: number;
    private readonly packed: Uint8Array;

    public constructor(dimensions: CompatMatrixDimensions) {
        assertDims(dimensions);
        this.dimensions = dimensions;
        this.cellCount = dimensions.V * dimensions.V * dimensions.D * dimensions.T;
        this.packed = new Uint8Array(this.cellCount);
    }

    public flattenIndex(vi: number, vj: number, d_idx: number, ti: number): number {
        if (DEV_MODE) {
            assertRange('vi', vi, this.dimensions.V);
            assertRange('vj', vj, this.dimensions.V);
            assertRange('d_idx', d_idx, this.dimensions.D);
            assertRange('ti', ti, this.dimensions.T);
        }
        return (((vi * this.dimensions.V + vj) * this.dimensions.D + d_idx) * this.dimensions.T + ti);
    }

    public unflattenIndex(index: number): { vi: number; vj: number; d_idx: number; ti: number } {
        if (DEV_MODE) {
            assertRange('index', index, this.cellCount);
        }

        let remainder = index;
        const ti = remainder % this.dimensions.T;
        remainder = (remainder - ti) / this.dimensions.T;

        const d_idx = remainder % this.dimensions.D;
        remainder = (remainder - d_idx) / this.dimensions.D;

        const vj = remainder % this.dimensions.V;
        const vi = (remainder - vj) / this.dimensions.V;

        return { vi, vj, d_idx, ti };
    }

    public set(vi: number, vj: number, d_idx: number, ti: number, cell: CompatCell): void {
        if (DEV_MODE) {
            assertCell(cell);
        }
        const index = this.flattenIndex(vi, vj, d_idx, ti);
        this.packed[index] = pack(cell);
    }

    public get(vi: number, vj: number, d_idx: number, ti: number): CompatCell {
        const index = this.flattenIndex(vi, vj, d_idx, ti);
        return unpack(this.packed[index]);
    }
}

class SparseCompatMatrixAdapter implements CompatMatrix {
    public readonly dimensions: CompatMatrixDimensions;
    public readonly cellCount: number;
    private readonly entries: Map<number, number>;

    public constructor(dimensions: CompatMatrixDimensions) {
        assertDims(dimensions);
        this.dimensions = dimensions;
        this.cellCount = dimensions.V * dimensions.V * dimensions.D * dimensions.T;
        this.entries = new Map<number, number>();
    }

    public flattenIndex(vi: number, vj: number, d_idx: number, ti: number): number {
        if (DEV_MODE) {
            assertRange('vi', vi, this.dimensions.V);
            assertRange('vj', vj, this.dimensions.V);
            assertRange('d_idx', d_idx, this.dimensions.D);
            assertRange('ti', ti, this.dimensions.T);
        }
        return (((vi * this.dimensions.V + vj) * this.dimensions.D + d_idx) * this.dimensions.T + ti);
    }

    public unflattenIndex(index: number): { vi: number; vj: number; d_idx: number; ti: number } {
        if (DEV_MODE) {
            assertRange('index', index, this.cellCount);
        }

        let remainder = index;
        const ti = remainder % this.dimensions.T;
        remainder = (remainder - ti) / this.dimensions.T;

        const d_idx = remainder % this.dimensions.D;
        remainder = (remainder - d_idx) / this.dimensions.D;

        const vj = remainder % this.dimensions.V;
        const vi = (remainder - vj) / this.dimensions.V;

        return { vi, vj, d_idx, ti };
    }

    public set(vi: number, vj: number, d_idx: number, ti: number, cell: CompatCell): void {
        if (DEV_MODE) {
            assertCell(cell);
        }

        const index = this.flattenIndex(vi, vj, d_idx, ti);
        const packed = pack(cell);

        if (packed === 0) {
            this.entries.delete(index);
            return;
        }

        this.entries.set(index, packed);
    }

    public get(vi: number, vj: number, d_idx: number, ti: number): CompatCell {
        const index = this.flattenIndex(vi, vj, d_idx, ti);
        const packed = this.entries.get(index) ?? 0;
        return unpack(packed);
    }
}

export function estimateDenseBytes(dimensions: CompatMatrixDimensions): number {
    assertDims(dimensions);
    return dimensions.V * dimensions.V * dimensions.D * dimensions.T * Uint8Array.BYTES_PER_ELEMENT;
}

export function shouldUseSparseFallback(dimensions: CompatMatrixDimensions, maxDenseBytes = DEFAULT_MAX_DENSE_BYTES): boolean {
    assertInt('maxDenseBytes', maxDenseBytes);
    if (maxDenseBytes <= 0) {
        throw new RangeError(`maxDenseBytes must be positive; received ${maxDenseBytes}`);
    }
    return estimateDenseBytes(dimensions) > maxDenseBytes;
}

export function createCompatMatrix(dimensions: CompatMatrixDimensions, options: CompatMatrixOptions = {}): CompatMatrix {
    const maxDenseBytes = options.maxDenseBytes ?? DEFAULT_MAX_DENSE_BYTES;
    if (shouldUseSparseFallback(dimensions, maxDenseBytes)) {
        return new SparseCompatMatrixAdapter(dimensions);
    }
    return new DenseCompatMatrix(dimensions);
}
