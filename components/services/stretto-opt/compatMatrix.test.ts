import assert from 'node:assert/strict';
import { CompatMatrixDimensions, createCompatMatrix } from './compatMatrix';

// Test: Flatten/unflatten are true inverses (bijection property)
// This ensures the index mapping is deterministic and preserves all coordinates.
function runFlattenUnflattenBijectionTest(): void {
    const dimensions: CompatMatrixDimensions = { V: 3, D: 2, T: 4 };
    const matrix = createCompatMatrix(dimensions);

    let visited = 0;
    for (let vi = 0; vi < dimensions.V; vi += 1) {
        for (let vj = 0; vj < dimensions.V; vj += 1) {
            for (let d_idx = 0; d_idx < dimensions.D; d_idx += 1) {
                for (let ti = 0; ti < dimensions.T; ti += 1) {
                    const index = matrix.flattenIndex(vi, vj, d_idx, ti);
                    const roundTrip = matrix.unflattenIndex(index);
                    assert.deepEqual(roundTrip, { vi, vj, d_idx, ti }, `flatten/unflatten mismatch at index=${index}`);
                    visited += 1;
                }
            }
        }
    }

    assert.equal(visited, matrix.cellCount, 'every logical cell must map to exactly one linear index');
}

runFlattenUnflattenBijectionTest();

console.log('compatMatrix.test: PASS');
