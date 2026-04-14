import assert from 'node:assert/strict';
import { computeSecondDelayStart, enumerateTripletInversionPairs } from './tripletDiscoveryOptions';

const withoutInversions = enumerateTripletInversionPairs(false);
assert.deepEqual(withoutInversions, [{ firstIsInverted: false, secondIsInverted: false }], 'Inversion disabled must keep only (N,N).');

const withInversions = enumerateTripletInversionPairs(true);
assert.equal(withInversions.length, 3, 'Inversion enabled must enumerate exactly three admissible states.');
assert.ok(withInversions.some((p) => p.firstIsInverted && p.secondIsInverted) === false, 'Consecutive inversions (I,I) must be excluded.');
assert.ok(withInversions.some((p) => p.firstIsInverted && !p.secondIsInverted), 'State (I,N) must be present.');
assert.ok(withInversions.some((p) => !p.firstIsInverted && p.secondIsInverted), 'State (N,I) must be present.');

assert.equal(computeSecondDelayStart(480, 240, 'allow_equal'), 480, 'Unconstrained mode must allow d2=d1.');
assert.equal(computeSecondDelayStart(480, 240, 'strict_increasing'), 720, 'Strict mode must enforce d2>d1 by one step.');

console.log('PASS tripletDiscoveryOptionsTest');
