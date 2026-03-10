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
if (timeoutFar.heading !== 'Search Timed Out') {
  throw new Error('Timeout heading should use concise terminal label.');
}
if (!timeoutFar.detail.includes('Depth 3/8')) {
  throw new Error('Timeout detail must report concise depth metrics.');
}

const timeoutNear = deriveSearchStatusPresentation(mkReport('Timeout', 7, 10000), 8);
if (timeoutNear.heading !== 'Search Timed Out') {
  throw new Error('Timeout near-target heading should use concise terminal label.');
}
if (!timeoutNear.detail.includes('+10000ms')) {
  throw new Error('Timeout near-target extension visibility is missing.');
}

const exhaustedNone = deriveSearchStatusPresentation(mkReport('Exhausted', 0), 8);
if (!exhaustedNone.heading.includes('No Valid Chain')) {
  throw new Error('Exhausted with no depth heading is incorrect.');
}

console.log('searchStatusTest passed');
