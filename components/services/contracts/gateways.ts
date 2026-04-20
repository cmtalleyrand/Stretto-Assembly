import type {
  CanonSearchOptions,
  CanonSearchReport,
  RawNote,
  StrettoCandidate,
  StrettoSearchOptions,
  StrettoSearchReport,
  StrettoListFilterContext,
} from '../../../types';

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
