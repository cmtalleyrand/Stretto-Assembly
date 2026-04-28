import { useEffect, useRef, useState } from 'react';
import { RawNote, StrettoChainResult, StrettoSearchOptions, StrettoSearchReport } from '../../../types';

interface StrettoSearchWorkerRequest {
    subject: RawNote[];
    options: StrettoSearchOptions;
    ppq: number;
}

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

export function useChainSearchState() {
    const [chainResults, setChainResults] = useState<StrettoChainResult[]>([]);
    const [searchReport, setSearchReport] = useState<StrettoSearchReport | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchProgress, setSearchProgress] = useState<StrettoSearchProgressState | null>(null);
    const [selectedChain, setSelectedChain] = useState<StrettoChainResult | null>(null);
    const activeWorkerRef = useRef<Worker | null>(null);

    const terminateActiveWorker = () => {
        if (activeWorkerRef.current) {
            activeWorkerRef.current.terminate();
            activeWorkerRef.current = null;
        }
    };

    useEffect(() => terminateActiveWorker, []);

    const runChainSearchInWorker = (
        request: StrettoSearchWorkerRequest,
        onProgress: (progress: StrettoSearchProgressState) => void
    ): Promise<StrettoSearchReport> => {
        terminateActiveWorker();
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('../../workers/strettoSearchWorker.ts', import.meta.url), { type: 'module' });
            activeWorkerRef.current = worker;

            const finalize = () => {
                worker.terminate();
                if (activeWorkerRef.current === worker) activeWorkerRef.current = null;
            };

            worker.onmessage = (event: MessageEvent<StrettoSearchWorkerProgress | StrettoSearchWorkerResult | StrettoSearchWorkerFailure>) => {
                const payload = event.data;
                if (payload.ok && payload.kind === 'progress') {
                    onProgress(normalizeWorkerProgress(payload));
                    return;
                }
                finalize();
                if (payload.ok && payload.kind === 'result') {
                    resolve(payload.report);
                    return;
                }
                reject(new Error((payload as StrettoSearchWorkerFailure).error));
            };

            worker.onerror = (event: ErrorEvent) => {
                finalize();
                reject(new Error(event.message || 'Stretto search worker failed.'));
            };

            worker.postMessage(request);
        });
    };

    const handleChainSearch = async (params: {
        subjectNotes: RawNote[];
        searchOptions: StrettoSearchOptions;
        ppq: number;
        voiceNames?: Record<number, string>;
        meter: { num: number; den: number };
    }) => {
        setIsSearching(true);
        setChainResults([]);
        setSearchReport(null);
        setSelectedChain(null);
        setSearchProgress({
            elapsedMs: 0,
            stage: 'pairwise',
            completedUnits: 0,
            totalUnits: 1,
            terminal: false,
            telemetry: {
                validPairs: 0,
                validTriplets: 0,
                chainsFound: 0,
                maxDepthReached: 0,
                targetChainLength: params.searchOptions.targetChainLength,
                pairwiseOperationsProcessed: 0,
                tripletOperationsProcessed: 0,
                dagNodesExpanded: 0,
                dagEdgesEvaluated: 0,
                dagExploredWorkItems: 0,
                dagLiveFrontierWorkItems: 0,
            },
            heartbeat: true,
        });

        setTimeout(async () => {
            try {
                const report = await runChainSearchInWorker(
                    {
                        subject: params.subjectNotes.filter(Boolean),
                        options: {
                            ...params.searchOptions,
                            voiceNames: params.voiceNames,
                            meterNumerator: params.meter.num,
                            meterDenominator: params.meter.den,
                        },
                        ppq: params.ppq || 480,
                    },
                    setSearchProgress
                );
                setChainResults(report.results);
                setSearchReport(report);
            } finally {
                setIsSearching(false);
                setSearchProgress(null);
            }
        }, 100);
    };

    const resetForSubjectChange = () => {
        setChainResults([]);
        setSelectedChain(null);
        setSearchReport(null);
    };

    return {
        chainResults,
        setChainResults,
        searchReport,
        setSearchReport,
        isSearching,
        searchProgress,
        selectedChain,
        setSelectedChain,
        handleChainSearch,
        resetForSubjectChange,
        terminateActiveWorker,
    };
}

export function normalizeWorkerProgress(payload: StrettoSearchWorkerProgress): StrettoSearchProgressState {
    return {
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
    };
}
