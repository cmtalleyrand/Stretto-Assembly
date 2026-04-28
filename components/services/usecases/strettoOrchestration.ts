import type {
  CanonChainResult,
  CanonSearchOptions,
  RawNote,
  StrettoCandidate,
  StrettoSearchOptions,
} from '../../../types';
import { extractKeyFromAbc, extractMeterFromAbc, parseSimpleAbc } from '../abcBridge';
import { getStrictPitchName } from '../midiSpelling';
import { analyzeStrettoCandidate, analyzeStrettoTripletCandidate, generatePolyphonicHarmonicRegions } from '../strettoCore';
import { downloadStrettoCandidate, downloadStrettoSelection } from '../strettoExport';
import { computeMaxDelayAutoBeats } from '../stretto/delayUtils';
import { deriveInitialPivotSettings } from '../stretto/pivotInitialization';
import {
  computeSubjectPivotCandidates,
  rankPivotCandidates,
  type PivotCandidateObservation,
  type PivotSearchMetric,
} from '../pairwisePivotSearch';
import {
  computeSecondDelayEnd,
  computeSecondDelayStart,
  enumerateTripletInversionPairs,
  type TripletDelayOrderingMode,
} from '../tripletDiscoveryOptions';

export interface RunDiscoveryRequest {
  subjectNotes: RawNote[];
  ppq: number;
  meter: { num: number; den: number };
  searchResolution: 'full' | 'half' | 'double';
  discoveryArity: 'pairwise' | 'triplet';
  tripletDelayOrderingMode: TripletDelayOrderingMode;
  minDelayBeats: number;
  maxDelayBeats: string;
  configIntervals: number[];
  includeExtensions: boolean;
  includeInversions: boolean;
  searchOptions: Pick<StrettoSearchOptions, 'pivotMidi' | 'useChromaticInversion' | 'scaleRoot' | 'maxPairwiseDissonance' | 'scaleMode'>;
}

export interface ReconstructChainCandidateRequest {
  selectedChain: { id: string; entries: { startBeat: number; type: string; transposition: number; voiceIndex: number; length: number }[] } | null;
  subjectNotes: RawNote[];
  ppq: number;
  pivotMidi: number;
  useChromaticInversion: boolean;
  scaleRoot: number;
  masterTransposition: number;
}

export interface ReconstructCanonCandidateRequest {
  selectedCanonResult: CanonChainResult | null;
  subjectNotes: RawNote[];
  ppq: number;
  canonOptions: Pick<CanonSearchOptions, 'pivotMidi' | 'useChromaticInversion' | 'scaleRoot'>;
}

const SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];

const invertPitchDiatonic = (pitch: number, pivot: number) => {
  const diff = pitch - pivot;
  const oct = Math.floor(diff / 12);
  const semi = (diff % 12 + 12) % 12;
  let degree = -1;
  let minErr = 99;
  SCALE_STEPS.forEach((s, i) => {
    if (Math.abs(s - semi) < minErr) {
      minErr = Math.abs(s - semi);
      degree = i;
    }
  });
  const absDegree = oct * 7 + degree;
  const invAbsDegree = -absDegree;
  const invOct = Math.floor(invAbsDegree / 7);
  const invIndex = (invAbsDegree % 7 + 7) % 7;
  return pivot + invOct * 12 + SCALE_STEPS[invIndex];
};

const invertPitchChromatic = (pitch: number, pivot: number) => pivot - (pitch - pivot);

export const strettoOrchestrationUsecase = {
  parseSubject(mode: 'midi' | 'abc', abcInput: string, initialNotes: RawNote[], ppq: number): RawNote[] {
    if (mode === 'abc') return parseSimpleAbc(abcInput, ppq);
    return initialNotes;
  },

  parseAbcKey(abcInput: string) {
    return extractKeyFromAbc(abcInput);
  },

  parseAbcMeter(abcInput: string) {
    return extractMeterFromAbc(abcInput);
  },

  deriveInitialPivotSettings,
  computeMaxDelayAutoBeats,
  computeSubjectPivotCandidates,
  rankPivotCandidates(request: {
    pivots: number[];
    referencePivot: number;
    evaluatePivot: (pivotMidi: number) => PivotCandidateObservation[];
  }): PivotSearchMetric[] {
    return rankPivotCandidates(request);
  },

  runDiscovery(request: RunDiscoveryRequest): StrettoCandidate[] {
    const validNotes = request.subjectNotes.filter((n) => !!n);
    if (validNotes.length === 0) return [];

    const candidates: StrettoCandidate[] = [];
    const durationTicks = Math.max(...validNotes.map((n) => n.ticks + n.durationTicks));
    const beatDiv = request.ppq * (4 / request.meter.den);

    let stepTicks = request.ppq;
    if (request.searchResolution === 'half') stepTicks = request.ppq / 2;
    else if (request.searchResolution === 'double') stepTicks = request.ppq * 2;

    const autoMax = durationTicks * (2 / 3);
    const userMax = request.maxDelayBeats !== '' ? parseFloat(request.maxDelayBeats) * beatDiv : autoMax;
    const effectiveMaxDelay = Math.min(userMax, autoMax);
    const effectiveMinDelay = Math.max(stepTicks, Math.round(request.minDelayBeats * beatDiv));

    const intervalsToCheck = [...request.configIntervals];
    if (request.includeExtensions) {
      [3, 4, 8, 9, -3, -4, -8, -9].forEach((e) => {
        if (!intervalsToCheck.includes(e)) intervalsToCheck.push(e);
      });
    }

    if (request.discoveryArity === 'pairwise') {
      intervalsToCheck.forEach((interval) => {
        for (let d = effectiveMinDelay; d <= effectiveMaxDelay; d += stepTicks) {
          candidates.push(
            analyzeStrettoCandidate(
              validNotes,
              interval,
              Math.round(d),
              request.ppq,
              request.meter,
              false,
              request.searchOptions.pivotMidi,
              request.searchOptions.useChromaticInversion,
              request.searchOptions.scaleRoot,
              request.searchOptions.maxPairwiseDissonance,
              request.searchOptions.scaleMode
            )
          );
          if (request.includeInversions) {
            candidates.push(
              analyzeStrettoCandidate(
                validNotes,
                interval,
                Math.round(d),
                request.ppq,
                request.meter,
                true,
                request.searchOptions.pivotMidi,
                request.searchOptions.useChromaticInversion,
                request.searchOptions.scaleRoot,
                request.searchOptions.maxPairwiseDissonance,
                request.searchOptions.scaleMode
              )
            );
          }
        }
      });
      return candidates;
    }

    const inversionPairs = enumerateTripletInversionPairs(request.includeInversions);
    for (let dTe1 = effectiveMinDelay; dTe1 <= effectiveMaxDelay; dTe1 += stepTicks) {
      const dTe2Start = computeSecondDelayStart(dTe1, stepTicks);
      const dTe2End = computeSecondDelayEnd(dTe1, effectiveMaxDelay, stepTicks, request.tripletDelayOrderingMode);
      for (let dTe2 = dTe2Start; dTe2 <= dTe2End; dTe2 += stepTicks) {
        for (const i1 of intervalsToCheck) {
          for (const i2 of intervalsToCheck) {
            for (const inversionPair of inversionPairs) {
              candidates.push(
                analyzeStrettoTripletCandidate(
                  validNotes,
                  i1,
                  i2,
                  Math.round(dTe1),
                  Math.round(dTe2),
                  request.ppq,
                  request.meter,
                  inversionPair.firstIsInverted,
                  inversionPair.secondIsInverted,
                  request.searchOptions.pivotMidi,
                  request.searchOptions.useChromaticInversion,
                  request.searchOptions.scaleRoot,
                  request.searchOptions.maxPairwiseDissonance,
                  request.searchOptions.scaleMode
                )
              );
            }
          }
        }
      }
    }

    return candidates;
  },

  reconstructCanonCandidate(request: ReconstructCanonCandidateRequest): StrettoCandidate | null {
    if (!request.selectedCanonResult) return null;
    const validSubjectNotes = request.subjectNotes.filter((n) => !!n);
    if (validSubjectNotes.length === 0) return null;

    const sortedSubj = [...validSubjectNotes].sort((a, b) => a.ticks - b.ticks);
    const startTick = sortedSubj[0].ticks;
    let allNotes: RawNote[] = [];

    request.selectedCanonResult.entries.forEach((entry) => {
      const entryStartTick = Math.round(entry.startBeat * request.ppq);
      const entryEndTick = entryStartTick + entry.length;
      const transformed = sortedSubj.map((n) => {
        let pitch = n.midi;
        if (entry.type === 'I') {
          const rawInverted = request.canonOptions.useChromaticInversion
            ? invertPitchChromatic(n.midi, request.canonOptions.pivotMidi)
            : invertPitchDiatonic(n.midi, request.canonOptions.pivotMidi);
          const subjectFirst = sortedSubj[0].midi;
          const invertedFirst = request.canonOptions.useChromaticInversion
            ? invertPitchChromatic(subjectFirst, request.canonOptions.pivotMidi)
            : invertPitchDiatonic(subjectFirst, request.canonOptions.pivotMidi);
          const targetStart = subjectFirst + entry.transposition;
          pitch = rawInverted + (targetStart - invertedFirst);
        } else {
          pitch += entry.transposition;
        }
        return {
          ...n,
          ticks: n.ticks - startTick + entryStartTick,
          midi: pitch,
          name: getStrictPitchName(pitch),
          voiceIndex: entry.voiceIndex,
        };
      });

      const clipped = transformed
        .filter((n) => n.ticks < entryEndTick)
        .map((n) => ({ ...n, durationTicks: Math.min(n.durationTicks, entryEndTick - n.ticks) }));
      allNotes = [...allNotes, ...clipped];
    });

    return {
      id: request.selectedCanonResult.id,
      intervalLabel: 'Canon',
      intervalSemis: request.selectedCanonResult.transpositionSteps[0] ?? 0,
      delayBeats: request.selectedCanonResult.delayBeats,
      delayTicks: Math.round(request.selectedCanonResult.delayBeats * request.ppq),
      grade: 'STRONG',
      errors: [],
      notes: allNotes,
      regions: generatePolyphonicHarmonicRegions(allNotes, request.canonOptions.scaleRoot),
      dissonanceRatio: 0,
      pairDissonanceScore: 0,
      endsOnDissonance: false,
    };
  },

  reconstructChainCandidate(request: ReconstructChainCandidateRequest): StrettoCandidate | null {
    if (!request.selectedChain) return null;
    const validSubjectNotes = request.subjectNotes.filter((n) => !!n);
    if (validSubjectNotes.length === 0) return null;

    const sortedSubj = [...validSubjectNotes].sort((a, b) => a.ticks - b.ticks);
    const startTick = sortedSubj[0].ticks;
    let allNotes: RawNote[] = [];

    request.selectedChain.entries.forEach((entry) => {
      const entryStartTick = Math.round(entry.startBeat * request.ppq);
      const transformed = sortedSubj.map((n) => {
        let pitch = n.midi;
        if (entry.type === 'I') {
          const rawInverted = request.useChromaticInversion
            ? invertPitchChromatic(n.midi, request.pivotMidi)
            : invertPitchDiatonic(n.midi, request.pivotMidi);
          const subjectFirst = sortedSubj[0].midi;
          const invertedFirst = request.useChromaticInversion
            ? invertPitchChromatic(subjectFirst, request.pivotMidi)
            : invertPitchDiatonic(subjectFirst, request.pivotMidi);
          pitch = rawInverted + (subjectFirst + entry.transposition - invertedFirst);
        } else {
          pitch += entry.transposition;
        }
        pitch += request.masterTransposition;
        return {
          ...n,
          ticks: n.ticks - startTick + entryStartTick,
          midi: pitch,
          name: getStrictPitchName(pitch),
          voiceIndex: entry.voiceIndex,
        };
      });

      const entryEndTick = entryStartTick + entry.length * (request.ppq / 4);
      const clipped = transformed
        .filter((n) => n.ticks < entryEndTick)
        .map((n) => ({ ...n, durationTicks: Math.min(n.durationTicks, entryEndTick - n.ticks) }));
      allNotes = [...allNotes, ...clipped];
    });

    return {
      id: request.selectedChain.id,
      intervalLabel: 'Chain',
      intervalSemis: 0,
      delayBeats: 0,
      delayTicks: 0,
      grade: 'STRONG',
      errors: [],
      notes: allNotes,
      regions: generatePolyphonicHarmonicRegions(allNotes, request.scaleRoot),
      dissonanceRatio: 0,
      pairDissonanceScore: 0,
      endsOnDissonance: false,
    };
  },

  exportCandidate(candidate: StrettoCandidate, ppq: number, voiceNames: Record<number, string> | undefined, subjectTitle: string, meter: { numerator: number; denominator: number }) {
    downloadStrettoCandidate(candidate, ppq, voiceNames, subjectTitle, meter);
  },

  exportSelection(candidates: StrettoCandidate[], ppq: number, voiceNames: Record<number, string> | undefined, subjectTitle: string, meter: { numerator: number; denominator: number }) {
    downloadStrettoSelection(candidates, ppq, voiceNames, subjectTitle, meter);
  },
};
