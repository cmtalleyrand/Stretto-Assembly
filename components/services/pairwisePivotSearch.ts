import { RawNote } from '../../types';

export interface PivotCandidateObservation {
  delayTicks: number;
  dissonanceRatio: number;
  isViable: boolean;
}

export interface PivotSearchMetric {
  pivotMidi: number;
  viablePairRate: number;
  averageViableDissonance: number;
  delayCoverageRate: number;
  varietyWeightedDelayDissonance: number;
  objectiveScore: number;
  totalPairs: number;
  viablePairs: number;
  totalDelays: number;
  delaysWithViablePairs: number;
}

interface RankPivotCandidatesInput {
  pivots: number[];
  referencePivot: number;
  evaluatePivot: (pivotMidi: number) => PivotCandidateObservation[];
}

export function computeSubjectPivotCandidates(subjectNotes: RawNote[]): number[] {
  const unique = new Set<number>();
  for (const note of subjectNotes) {
    if (!note || Number.isNaN(note.midi)) continue;
    unique.add(Math.max(0, Math.min(127, Math.round(note.midi))));
  }
  return Array.from(unique).sort((a, b) => a - b);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function summarizePivotObservations(observations: PivotCandidateObservation[]): Omit<PivotSearchMetric, 'pivotMidi'> {
  const totalPairs = observations.length;
  const delaySet = new Set<number>(observations.map((o) => o.delayTicks));
  const totalDelays = delaySet.size;

  const viable = observations.filter((o) => o.isViable);
  const viablePairs = viable.length;
  const viablePairRate = totalPairs > 0 ? viablePairs / totalPairs : 0;
  const averageViableDissonance = viablePairs > 0
    ? clamp01(viable.reduce((sum, o) => sum + o.dissonanceRatio, 0) / viablePairs)
    : 1;

  const viableByDelay = new Map<number, number[]>();
  for (const candidate of viable) {
    const bucket = viableByDelay.get(candidate.delayTicks) ?? [];
    bucket.push(clamp01(candidate.dissonanceRatio));
    viableByDelay.set(candidate.delayTicks, bucket);
  }

  const delaysWithViablePairs = viableByDelay.size;
  const delayCoverageRate = totalDelays > 0 ? delaysWithViablePairs / totalDelays : 0;

  let weightedDelaySum = 0;
  for (const delay of delaySet) {
    const delayRatios = (viableByDelay.get(delay) ?? []).sort((a, b) => a - b);
    if (delayRatios.length === 0) {
      weightedDelaySum += 1;
      continue;
    }
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < delayRatios.length; i++) {
      const weight = 1 / (2 ** i);
      numerator += weight * delayRatios[i];
      denominator += weight;
    }
    weightedDelaySum += denominator > 0 ? numerator / denominator : 1;
  }

  const varietyWeightedDelayDissonance = totalDelays > 0 ? clamp01(weightedDelaySum / totalDelays) : 1;

  const objectiveScore = (0.4 * viablePairRate) + (0.3 * delayCoverageRate) + (0.3 * (1 - varietyWeightedDelayDissonance));

  return {
    viablePairRate,
    averageViableDissonance,
    delayCoverageRate,
    varietyWeightedDelayDissonance,
    objectiveScore,
    totalPairs,
    viablePairs,
    totalDelays,
    delaysWithViablePairs,
  };
}

export function rankPivotCandidates({
  pivots,
  referencePivot,
  evaluatePivot,
}: RankPivotCandidatesInput): PivotSearchMetric[] {
  const metrics: PivotSearchMetric[] = [];

  for (const pivotMidi of pivots) {
    const observations = evaluatePivot(pivotMidi);
    if (observations.length === 0) continue;
    metrics.push({ pivotMidi, ...summarizePivotObservations(observations) });
  }

  return metrics.sort((a, b) => {
    if (b.objectiveScore !== a.objectiveScore) return b.objectiveScore - a.objectiveScore;
    if (b.viablePairRate !== a.viablePairRate) return b.viablePairRate - a.viablePairRate;
    if (b.delayCoverageRate !== a.delayCoverageRate) return b.delayCoverageRate - a.delayCoverageRate;
    if (a.varietyWeightedDelayDissonance !== b.varietyWeightedDelayDissonance) return a.varietyWeightedDelayDissonance - b.varietyWeightedDelayDissonance;
    if (a.averageViableDissonance !== b.averageViableDissonance) return a.averageViableDissonance - b.averageViableDissonance;
    const distanceA = Math.abs(a.pivotMidi - referencePivot);
    const distanceB = Math.abs(b.pivotMidi - referencePivot);
    if (distanceA !== distanceB) return distanceA - distanceB;
    return a.pivotMidi - b.pivotMidi;
  });
}
