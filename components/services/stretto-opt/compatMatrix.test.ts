import assert from 'node:assert/strict';
import { CompatCell, CompatMatrixDimensions, createCompatMatrix } from './compatMatrix';

function runFlattenUnflattenBijectionTest(): void {
    const dimensions: CompatMatrixDimensions = { V: 3, D: 2, T: 4 };
    const matrix = createCompatMatrix(dimensions);

    let visited = 0;
    for (let vi = 0; vi < dimensions.V; vi += 1) {
        for (let vj = 0; vj < dimensions.V; vj += 1) {
            for (let di = 0; di < dimensions.D; di += 1) {
                for (let ti = 0; ti < dimensions.T; ti += 1) {
                    const index = matrix.flattenIndex(vi, vj, di, ti);
                    const roundTrip = matrix.unflattenIndex(index);
                    assert.deepEqual(roundTrip, { vi, vj, di, ti }, `flatten/unflatten mismatch at index=${index}`);
                    visited += 1;
                }
            }
        }
    }

    assert.equal(visited, matrix.cellCount, 'every logical cell must map to exactly one linear index');
}

function runBoundarySetGetTest(): void {
    const dimensions: CompatMatrixDimensions = { V: 2, D: 2, T: 2 };
    const matrix = createCompatMatrix(dimensions);

    const minCell: CompatCell = { status: 0, constraintClass: 0 };
    const maxCell: CompatCell = { status: 3, constraintClass: 15 };

    matrix.set(0, 0, 0, 0, minCell);
    matrix.set(1, 1, 1, 1, maxCell);

    assert.deepEqual(matrix.get(0, 0, 0, 0), minCell, 'minimum bound cell must be preserved');
    assert.deepEqual(matrix.get(1, 1, 1, 1), maxCell, 'maximum bound cell must be preserved');

    assert.throws(
        () => matrix.set(2, 0, 0, 0, minCell),
        /vi out of range/,
        'out-of-range writes must fail in development mode'
    );
    assert.throws(
        () => matrix.set(0, 0, 0, 0, { status: 4, constraintClass: 0 }),
        /status out of range/,
        'status values above packed width must fail in development mode'
    );
}

function runReferenceFixtureEquivalenceTest(): void {
    const dimensions: CompatMatrixDimensions = { V: 2, D: 3, T: 2 };
    const matrix = createCompatMatrix(dimensions, { maxDenseBytes: 1 });
    const reference = new Map<string, CompatCell>();

    const writes = [
        { vi: 0, vj: 0, di: 0, ti: 0, cell: { status: 1, constraintClass: 2 } },
        { vi: 0, vj: 1, di: 1, ti: 1, cell: { status: 2, constraintClass: 3 } },
        { vi: 1, vj: 0, di: 2, ti: 0, cell: { status: 3, constraintClass: 15 } },
        { vi: 1, vj: 1, di: 2, ti: 1, cell: { status: 0, constraintClass: 0 } }
    ];

    for (const entry of writes) {
        matrix.set(entry.vi, entry.vj, entry.di, entry.ti, entry.cell);
        reference.set(`${entry.vi}:${entry.vj}:${entry.di}:${entry.ti}`, entry.cell);
    }

    for (let vi = 0; vi < dimensions.V; vi += 1) {
        for (let vj = 0; vj < dimensions.V; vj += 1) {
            for (let di = 0; di < dimensions.D; di += 1) {
                for (let ti = 0; ti < dimensions.T; ti += 1) {
                    const key = `${vi}:${vj}:${di}:${ti}`;
                    const expected = reference.get(key) ?? { status: 0, constraintClass: 0 };
                    assert.deepEqual(matrix.get(vi, vj, di, ti), expected, `mismatch against reference at ${key}`);
                }
            }
        }
    }
}

runFlattenUnflattenBijectionTest();
runBoundarySetGetTest();
runReferenceFixtureEquivalenceTest();

console.log('compatMatrix.test: PASS');
