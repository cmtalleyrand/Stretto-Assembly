import { RawNote, StrettoSearchOptions, StrettoSearchReport } from '../../types';
import { searchStrettoChains, StrettoSearchProgressStage } from '../services/strettoGenerator';

interface StrettoSearchWorkerRequest {
  subject: RawNote[];
  options: StrettoSearchOptions;
  ppq: number;
}

interface StrettoSearchWorkerProgress {
  ok: true;
  kind: 'progress';
  elapsedMs: number;
  stage: StrettoSearchProgressStage;
  completedUnits: number;
  totalUnits: number;
  heartbeat: boolean;
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
    const STAGE_WEIGHTS: Record<StrettoSearchProgressStage, number> = {
      pairwise: 0.35,
      triplet: 0.25,
      dag: 0.40
    };
    const STAGE_ORDER: StrettoSearchProgressStage[] = ['pairwise', 'triplet', 'dag'];
    const STAGE_LABELS: Record<StrettoSearchProgressStage, string> = {
      pairwise: 'Pairwise precomputation',
      triplet: 'Triplet compatibility indexing',
      dag: 'Chain expansion and scoring'
    };
    const weightedStagePercent = (stage: StrettoSearchProgressStage, completedUnits: number, totalUnits: number): number => {
      const boundedTotal = Math.max(1, totalUnits);
      const boundedCompleted = Math.max(0, Math.min(completedUnits, boundedTotal));
      const stageRatio = boundedCompleted / boundedTotal;
      let completedWeight = 0;
      for (const s of STAGE_ORDER) {
        if (s === stage) {
          completedWeight += STAGE_WEIGHTS[s] * stageRatio;
          break;
        }
        completedWeight += STAGE_WEIGHTS[s];
      }
      return Math.max(0, Math.min(99, Math.round(completedWeight * 100)));
    };
    let hasConcreteProgress = false;

    const emitHeartbeatProgress = () => {
      if (hasConcreteProgress) return;
      const elapsedMs = Date.now() - searchStartedAt;
      const boundedPercent = Math.max(0, Math.min(99, Math.round((elapsedMs / searchBudgetMs) * 100)));
      const progressPayload: StrettoSearchWorkerProgress = {
        ok: true,
        kind: 'progress',
        elapsedMs,
        stage: 'pairwise',
        completedUnits: 0,
        totalUnits: 1,
        heartbeat: true,
        progressPercent: boundedPercent,
        stars: renderStars(boundedPercent),
        stageLabel: 'Search active (awaiting stage metrics)'
      };
      self.postMessage(progressPayload);
    };

    emitHeartbeatProgress();
    heartbeatTimer = setInterval(emitHeartbeatProgress, 250);
    const report = await searchStrettoChains(subject, options, ppq, (progress) => {
      hasConcreteProgress = true;
      const elapsedMs = Date.now() - searchStartedAt;
      const weightedPercent = weightedStagePercent(progress.stage, progress.completedUnits, progress.totalUnits);
      const progressPayload: StrettoSearchWorkerProgress = {
        ok: true,
        kind: 'progress',
        elapsedMs,
        stage: progress.stage,
        completedUnits: progress.completedUnits,
        totalUnits: progress.totalUnits,
        heartbeat: false,
        progressPercent: weightedPercent,
        stars: renderStars(weightedPercent),
        stageLabel: STAGE_LABELS[progress.stage]
      };
      self.postMessage(progressPayload);
    });
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
