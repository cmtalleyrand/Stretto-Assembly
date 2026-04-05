import { RawNote, StrettoSearchOptions, StrettoSearchReport } from '../../types';
import { searchStrettoChains } from '../services/strettoGenerator';

interface StrettoSearchWorkerRequest {
  subject: RawNote[];
  options: StrettoSearchOptions;
  ppq: number;
}

interface StrettoSearchWorkerProgress {
  ok: true;
  kind: 'progress';
  elapsedMs: number;
  progressPercent: number;
  stars: string;
  stageLabel: string;
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

self.onmessage = async (event: MessageEvent<StrettoSearchWorkerRequest>) => {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  try {
    const { subject, options, ppq } = event.data;
    const searchBudgetMs = Math.max(1, options.maxSearchTimeMs ?? 30000);
    const searchStartedAt = Date.now();
    const renderStars = (percent: number): string => {
      const filled = Math.max(1, Math.min(10, Math.round(percent / 10)));
      return '★'.repeat(filled).padEnd(10, '☆');
    };

    const emitProgress = () => {
      const elapsedMs = Date.now() - searchStartedAt;
      const boundedPercent = Math.max(0, Math.min(99, Math.round((elapsedMs / searchBudgetMs) * 100)));
      const progressPayload: StrettoSearchWorkerProgress = {
        ok: true,
        kind: 'progress',
        elapsedMs,
        progressPercent: boundedPercent,
        stars: renderStars(boundedPercent),
        stageLabel: boundedPercent < 35
          ? 'Pairwise precomputation'
          : boundedPercent < 70
            ? 'Triplet compatibility indexing'
            : 'Chain expansion and scoring'
      };
      self.postMessage(progressPayload);
    };

    emitProgress();
    heartbeatTimer = setInterval(emitProgress, 250);
    const report = await searchStrettoChains(subject, options, ppq);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    const response: StrettoSearchWorkerResult = { ok: true, kind: 'result', report };
    self.postMessage(response);
  } catch (error) {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    const message = error instanceof Error ? error.message : 'Unknown worker error.';
    const response: StrettoSearchWorkerFailure = { ok: false, error: message };
    self.postMessage(response);
  }
};
