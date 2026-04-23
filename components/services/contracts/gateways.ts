import type {
  CanonChainResult,
  CanonSearchOptions,
  CanonSearchReport,
  RawNote,
  StrettoCandidate,
  StrettoChainResult,
  StrettoSearchOptions,
  StrettoSearchReport,
  StrettoListFilterContext,
} from '../../../types';
import type { TripletDelayOrderingMode } from '../tripletDiscoveryOptions';
export type { TripletDelayOrderingMode } from '../tripletDiscoveryOptions';
import type { PivotCandidateObservation, PivotSearchMetric } from '../pairwisePivotSearch';
export type { PivotCandidateObservation, PivotSearchMetric } from '../pairwisePivotSearch';

export interface StrettoSearchProgressState {
  elapsedMs: number;
  stage: 'pairwise' | 'triplet' | 'dag';
  completedUnits: number;
  totalUnits: number;
  terminal: boolean;
  telemetry: {
    validPairs: number;
    validTriplets: number;
    chainsFound: number;
    maxDepthReached: number;
    targetChainLength: number;
    pairwiseOperationsProcessed: number;
    tripletOperationsProcessed: number;
    dagNodesExpanded: number;
    dagEdgesEvaluated: number;
    dagExploredWorkItems: number;
    dagLiveFrontierWorkItems: number;
    dagHeuristicCompletionRatio?: number;
  };
  heartbeat: boolean;
}

export interface SearchGateway {
  runChainSearch(
    request: {
      subject: RawNote[];
      options: StrettoSearchOptions & {
        voiceNames?: Record<number, string>;
        meterNumerator: number;
        meterDenominator: number;
      };
      ppq: number;
    },
    onProgress: (progress: StrettoSearchProgressState) => void
  ): Promise<StrettoSearchReport>;

  runCanonSearch(
    subject: RawNote[],
    options: CanonSearchOptions,
    ppq: number,
    onProgress: (pct: number, msg: string) => void
  ): Promise<CanonSearchReport>;
}

export interface AssemblyGateway {
  assemble(request: {
    model: string;
    contents: string;
    systemInstruction: string;
  }): Promise<{ text: string }>;
}

export interface SubjectRepository {
  loadAll(): { id: string; name: string; data: string }[];
  saveAll(subjects: { id: string; name: string; data: string }[]): void;
}

export interface PlaybackGateway {
  playSequence(
    notes: { midi?: number; name?: string; time: number; duration: number; velocity: number }[],
    onEnded?: () => void
  ): Promise<void>;
  stop(): void;
}

export interface AssemblyFilterContextPayload {
  filterContext?: StrettoListFilterContext | null;
}

export interface AssemblyRequestInput {
  candidates: StrettoCandidate[];
  abcInput: string;
  payload?: AssemblyFilterContextPayload;
}

export interface OrchestrationGateway {
  parseSubject(mode: 'midi' | 'abc', abcInput: string, initialNotes: RawNote[], ppq: number): RawNote[];
  parseAbcKey(abcInput: string): { root: number; mode: string } | null;
  parseAbcMeter(abcInput: string): { num: number; den: number } | null;
  deriveInitialPivotSettings(subjectNotes: RawNote[], mode: 'midi' | 'abc', abcInput: string): { pivotMidi: number; scaleRoot: number; scaleMode: string } | null;
  computeMaxDelayAutoBeats(subjectNotes: RawNote[], ppq: number, meterDenominator: number): number;
  computeSubjectPivotCandidates(subjectNotes: RawNote[]): number[];
  rankPivotCandidates(request: {
    pivots: number[];
    referencePivot: number;
    evaluatePivot: (pivotMidi: number) => PivotCandidateObservation[];
  }): PivotSearchMetric[];
  runDiscovery(request: {
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
  }): StrettoCandidate[];
  reconstructCanonCandidate(request: {
    selectedCanonResult: CanonChainResult | null;
    subjectNotes: RawNote[];
    ppq: number;
    canonOptions: Pick<CanonSearchOptions, 'pivotMidi' | 'useChromaticInversion' | 'scaleRoot'>;
  }): StrettoCandidate | null;
  reconstructChainCandidate(request: {
    selectedChain: StrettoChainResult | null;
    subjectNotes: RawNote[];
    ppq: number;
    pivotMidi: number;
    useChromaticInversion: boolean;
    scaleRoot: number;
    masterTransposition: number;
  }): StrettoCandidate | null;
  exportCandidate(
    candidate: StrettoCandidate,
    ppq: number,
    voiceNames: Record<number, string> | undefined,
    subjectTitle: string,
    meter: { numerator: number; denominator: number }
  ): void;
  exportSelection(
    candidates: StrettoCandidate[],
    ppq: number,
    voiceNames: Record<number, string> | undefined,
    subjectTitle: string,
    meter: { numerator: number; denominator: number }
  ): void;
}
