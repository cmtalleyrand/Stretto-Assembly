import assert from 'node:assert/strict';
import { shouldExtendTimeoutNearCompletion } from './strettoGenerator';

assert.equal(shouldExtendTimeoutNearCompletion(4, 5), true, 'should extend when search is one step from target depth');
assert.equal(shouldExtendTimeoutNearCompletion(5, 5), true, 'should extend when search already reached target depth boundary');
assert.equal(shouldExtendTimeoutNearCompletion(2, 5), false, 'should not extend when search is not near completion');

console.log('stretto timeout policy tests passed');
