import assert from 'node:assert/strict';
import { HarmonicRegion } from '../../types';
import { computeHarmonicRegionDissonanceAudit, computeMaxConsecutiveDissonanceRegions } from './harmonicRegionDiagnostics';

const regions: HarmonicRegion[] = [
  {
    startTick: 0,
    endTick: 120,
    type: 'consonant_stable',
    intervalLabel: 'C Maj',
    detailedInfo: { chordName: 'C Maj', allNotes: ['C4', 'E4', 'G4'], noteDetails: [], chordTones: ['C4', 'E4', 'G4'], ncts: [] }
  },
  {
    startTick: 120,
    endTick: 240,
    type: 'dissonant_secondary',
    intervalLabel: 'C Maj + NCT',
    detailedInfo: { chordName: 'C Maj', allNotes: ['C4', 'E4', 'F4'], noteDetails: [], chordTones: ['C4', 'E4'], ncts: ['F4'] }
  },
  {
    startTick: 240,
    endTick: 360,
    type: 'dissonant_tertiary',
    intervalLabel: 'Diss',
    detailedInfo: { chordName: 'Diss', allNotes: ['B3', 'C4', 'F4'], noteDetails: [], chordTones: ['C4'], ncts: ['B3', 'F4'] }
  },
  {
    startTick: 360,
    endTick: 480,
    type: 'consonant_stable',
    intervalLabel: 'ANOMALY',
    detailedInfo: { chordName: 'ANOMALY', allNotes: ['C4', 'D4', 'E4'], noteDetails: [], chordTones: ['C4', 'E4'], ncts: ['D4'] }
  }
];

assert.equal(computeMaxConsecutiveDissonanceRegions(regions), 2, 'Expected the maximum contiguous dissonance run to be exactly two regions.');

const audit = computeHarmonicRegionDissonanceAudit(regions);
assert.equal(audit.nctRegions, 3, 'Three regions carry one or more NCT tokens.');
assert.equal(audit.dissonantRegions, 2, 'Two regions are explicitly tagged as non-consonant.');
assert.equal(audit.consonantRegionsWithNct, 1, 'One synthetic anomaly region has NCTs but is tagged consonant.');

console.log('harmonicRegionDiagnosticsTest passed');
