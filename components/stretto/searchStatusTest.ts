import { deriveSearchStatusPresentation } from './searchStatus';
import { StrettoSearchReport } from '../../types';

function mkReport(stopReason: StrettoSearchReport['stats']['stopReason'], maxDepthReached: number, timeoutExtensionAppliedMs: number = 0): StrettoSearchReport {
  return {
    results: [],
    stats: {
      nodesVisited: 100,
      timeMs: 5000,
      stopReason,
      maxDepthReached,
      timeoutExtensionAppliedMs
    }
  };
}

const timeoutFar = deriveSearchStatusPresentation(mkReport('Timeout', 3), 8);
if (!timeoutFar.heading.includes('Before Target Depth')) {
  throw new Error('Timeout far-from-target heading is incorrect.');
}
if (!timeoutFar.detail.includes('reduce branching factor')) {
  throw new Error('Timeout far-from-target guidance is incorrect.');
}

const timeoutNear = deriveSearchStatusPresentation(mkReport('Timeout', 7, 10000), 8);
if (!timeoutNear.heading.includes('Near Completion')) {
  throw new Error('Timeout near-target heading is incorrect.');
}
if (!timeoutNear.detail.includes('+10000ms')) {
  throw new Error('Timeout near-target extension visibility is missing.');
}

const exhaustedNone = deriveSearchStatusPresentation(mkReport('Exhausted', 0), 8);
if (!exhaustedNone.heading.includes('No Valid Chain')) {
  throw new Error('Exhausted with no depth heading is incorrect.');
}

console.log('searchStatusTest passed');
