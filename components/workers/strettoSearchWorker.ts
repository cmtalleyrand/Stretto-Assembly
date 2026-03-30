import { RawNote, StrettoSearchOptions, StrettoSearchReport } from '../../types';
import { searchStrettoChains } from '../services/strettoGenerator';

interface StrettoSearchWorkerRequest {
  subject: RawNote[];
  options: StrettoSearchOptions;
  ppq: number;
}

interface StrettoSearchWorkerSuccess {
  ok: true;
  report: StrettoSearchReport;
}

interface StrettoSearchWorkerFailure {
  ok: false;
  error: string;
}

self.onmessage = async (event: MessageEvent<StrettoSearchWorkerRequest>) => {
  try {
    const { subject, options, ppq } = event.data;
    const report = await searchStrettoChains(subject, options, ppq);
    const response: StrettoSearchWorkerSuccess = { ok: true, report };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error.';
    const response: StrettoSearchWorkerFailure = { ok: false, error: message };
    self.postMessage(response);
  }
};
