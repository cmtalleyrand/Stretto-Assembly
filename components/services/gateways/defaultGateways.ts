import { runCanonSearch } from '../canonSearch';
import { playSequence, stopPlayback } from '../../midiPlaybackService';
import type {
  AssemblyGateway,
  PlaybackGateway,
  SearchGateway,
  StrettoSearchProgressState,
  SubjectRepository,
} from '../contracts/gateways';
import type { StrettoSearchReport } from '../../../types';

interface StrettoSearchWorkerProgress {
  ok: true;
  kind: 'progress';
  elapsedMs: number;
  stage: 'pairwise' | 'triplet' | 'dag';
  completedUnits: number;
  totalUnits: number;
  terminal: boolean;
  telemetry: StrettoSearchProgressState['telemetry'];
  heartbeat: boolean;
}

interface StrettoSearchWorkerResult {
  ok: true;
  kind: 'result';
  report: StrettoSearchReport;
}

interface StrettoSearchWorkerFailure {
  ok: false;
  error: string;
}

const SUBJECT_LIBRARY_KEY = 'stretto_subject_library';

export const defaultAssemblyGateway: AssemblyGateway = {
  async assemble(request) {
    const response = await fetch('/api/assembly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const errorMessage =
        typeof errorPayload.error === 'string'
          ? errorPayload.error
          : `Proxy request failed with status ${response.status}.`;
      throw new Error(errorMessage);
    }

    const responseBody = (await response.json()) as { text?: string };
    return { text: responseBody.text || '' };
  },
};

export const defaultSearchGateway: SearchGateway = {
  runChainSearch(request, onProgress) {
    const worker = new Worker(new URL('../../workers/strettoSearchWorker.ts', import.meta.url), { type: 'module' });

    return new Promise((resolve, reject) => {
      worker.onmessage = (
        event: MessageEvent<StrettoSearchWorkerProgress | StrettoSearchWorkerResult | StrettoSearchWorkerFailure>
      ) => {
        const payload = event.data;

        if (payload.ok && payload.kind === 'progress') {
          onProgress({
            elapsedMs: payload.elapsedMs,
            stage: payload.stage,
            completedUnits: payload.completedUnits,
            totalUnits: payload.totalUnits,
            terminal: payload.terminal,
            telemetry: {
              ...payload.telemetry,
              dagExploredWorkItems: payload.telemetry.dagExploredWorkItems ?? 0,
              dagLiveFrontierWorkItems: payload.telemetry.dagLiveFrontierWorkItems ?? 0,
            },
            heartbeat: payload.heartbeat,
          });
          return;
        }

        worker.terminate();
        if (payload.ok && payload.kind === 'result') {
          resolve(payload.report);
          return;
        }

        reject(new Error((payload as StrettoSearchWorkerFailure).error));
      };

      worker.onerror = (event: ErrorEvent) => {
        worker.terminate();
        reject(new Error(event.message || 'Stretto search worker failed.'));
      };

      worker.postMessage(request);
    });
  },

  runCanonSearch(subject, options, ppq, onProgress) {
    return runCanonSearch(subject, options, ppq, onProgress);
  },
};

export const defaultSubjectRepository: SubjectRepository = {
  loadAll() {
    const saved = localStorage.getItem(SUBJECT_LIBRARY_KEY);
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(error);
      return [];
    }
  },

  saveAll(subjects) {
    localStorage.setItem(SUBJECT_LIBRARY_KEY, JSON.stringify(subjects));
  },
};

export const defaultPlaybackGateway: PlaybackGateway = {
  playSequence(notes, onEnded) {
    return playSequence(notes, onEnded);
  },
  stop() {
    stopPlayback();
  },
};
