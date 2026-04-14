
import React from 'react';
import { StrettoSearchOptions, StrettoChainResult, StrettoCandidate, RawNote, StrettoSearchReport, HarmonicRegion } from '../../types';
import StrettoSearchPanel from './StrettoSearchPanel';
import StrettoResultsList from './StrettoResultsList';
import StrettoInspector from './StrettoInspector';
import { DownloadIcon } from '../Icons';
import { generatePolyphonicHarmonicRegions, getInvertedPitch } from '../services/strettoCore'; // Use centralized inversion
import { getStrictPitchName } from '../services/midiSpelling';
import { deriveSearchRuntimePresentation, deriveSearchStatusPresentation } from './searchStatus';
import { computeHarmonicRegionDissonanceAudit, computeMaxConsecutiveDissonanceRegions } from './harmonicRegionDiagnostics';
import { metricHelpText } from './telemetryGlossary';

interface StrettoChainViewProps {
    searchOptions: StrettoSearchOptions;
    setSearchOptions: (opt: StrettoSearchOptions) => void;
    onSearch: () => void;
    isSearching: boolean;
    searchProgress?: {
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
        };
        heartbeat: boolean;
    } | null;
    chainResults: StrettoChainResult[];
    selectedChain: StrettoChainResult | null;
    setSelectedChain: (res: StrettoChainResult | null) => void;
    voiceNames?: Record<number, string>;
    setVoiceNames?: (names: Record<number, string>) => void;
    
    // Inspector Props
    chainToCandidate: StrettoCandidate | null; // Note: We actually override this logic locally to ensure polyphony
    ppq: number;
    ts: { num: number, den: number };
    isPlaying: boolean;
    onPlay: (notes: RawNote[]) => void;
    onDownloadChain: () => void;
    searchReport?: StrettoSearchReport | null;
    
    // Master Transposition
    masterTransposition: number;
    setMasterTransposition: (val: number) => void;
    subjectNotes: RawNote[]; // New prop
}

export default function StrettoChainView({
    searchOptions, setSearchOptions, onSearch, isSearching, searchProgress,
    chainResults, selectedChain, setSelectedChain, voiceNames, setVoiceNames,
    chainToCandidate: _unusedLegacyProp, // We recreate it here to ensure correct polyphonic region generation
    ppq, ts, isPlaying, onPlay, onDownloadChain,
    searchReport, masterTransposition, setMasterTransposition,
    subjectNotes
}: StrettoChainViewProps) {
    const MetricHelp = ({ metricKey }: { metricKey: Parameters<typeof metricHelpText>[0] }) => (
        <span className="ml-1 cursor-help text-[9px] text-cyan-300/80" title={metricHelpText(metricKey)} aria-label={metricHelpText(metricKey)}>
            ⓘ
        </span>
    );

    const [searchElapsedMs, setSearchElapsedMs] = React.useState(0);

    React.useEffect(() => {
        if (!isSearching) {
            setSearchElapsedMs(0);
            return;
        }
        const startedAt = Date.now();
        setSearchElapsedMs(0);
        const intervalId = window.setInterval(() => {
            setSearchElapsedMs(Date.now() - startedAt);
        }, 200);
        return () => window.clearInterval(intervalId);
    }, [isSearching]);

    const runtimePresentation = React.useMemo(() => {
        if (!isSearching) return null;
        const configuredBudgetMs = Math.max(1, searchOptions.maxSearchTimeMs || 30000);
        return deriveSearchRuntimePresentation(searchElapsedMs, configuredBudgetMs);
    }, [isSearching, searchElapsedMs, searchOptions.maxSearchTimeMs]);

    // Re-implement candidate generation here to use the new Polyphonic Region Logic
    // instead of relying on the parent's potentially outdated logic
    const chainCandidate = React.useMemo((): StrettoCandidate | null => {
        if (!selectedChain) return null;
        let allNotes: RawNote[] = [];
        const validSubjectNotes = subjectNotes.filter(n => !!n);
        const currentPpq = ppq || 480;
        if (validSubjectNotes.length === 0) return null;
        const sortedSubj = [...validSubjectNotes].sort((a,b)=>a.ticks-b.ticks);
        const startTick = sortedSubj[0].ticks;
        
        selectedChain.entries.forEach((entry) => {
            const entryStartTick = Math.round(entry.startBeat * currentPpq);
            const transformed = sortedSubj.map(n => {
                let pitch = n.midi;
                
                if (entry.type === 'I') {
                    // Use Shared Core Logic for Inversion
                    const rawInverted = getInvertedPitch(n.midi, searchOptions.pivotMidi, searchOptions.scaleRoot, searchOptions.scaleMode, searchOptions.useChromaticInversion);
                    const subjectFirst = sortedSubj[0].midi;
                    const invertedFirst = getInvertedPitch(subjectFirst, searchOptions.pivotMidi, searchOptions.scaleRoot, searchOptions.scaleMode, searchOptions.useChromaticInversion);
                    
                    const targetStart = subjectFirst + entry.transposition;
                    const shift = targetStart - invertedFirst;
                    pitch = rawInverted + shift;
                } else {
                    pitch += entry.transposition;
                }
                
                pitch += masterTransposition;

                return { ...n, ticks: (n.ticks - startTick) + entryStartTick, midi: pitch, name: getStrictPitchName(pitch), voiceIndex: entry.voiceIndex };
            });
            const entryEnd = entryStartTick + (entry.length * (currentPpq/2));
            const clipped = transformed.filter(n => n.ticks < entryEnd).map(n => ({ ...n, durationTicks: Math.min(n.durationTicks, entryEnd - n.ticks) }));
            allNotes = [...allNotes, ...clipped];
        });

        // Use new Polyphonic logic for the Chain
        const harmonicRegions = generatePolyphonicHarmonicRegions(allNotes, searchOptions.scaleRoot);
        
        return { 
            id: selectedChain.id, 
            intervalLabel: "Chain", 
            intervalSemis: 0, 
            delayBeats: 0, 
            delayTicks: 0, 
            grade: 'STRONG', 
            errors: [], 
            notes: allNotes, 
            regions: harmonicRegions, 
            dissonanceRatio: selectedChain.dissonanceRatio || 0,
            nctRatio: selectedChain.nctRatio || 0, // Use the calculated value from the search result for consistency
            pairDissonanceScore: selectedChain.pairDissonanceScore || 0, // Use the calculated intensity from the search result
            endsOnDissonance: false,
            detectedChords: selectedChain.detectedChords
        };
    }, [selectedChain, subjectNotes, ppq, searchOptions.pivotMidi, searchOptions.useChromaticInversion, masterTransposition, searchOptions.scaleRoot, searchOptions.scaleMode]);

    const searchStatus = React.useMemo(() => {
        if (!searchReport) return null;
        return deriveSearchStatusPresentation(searchReport, searchOptions.targetChainLength);
    }, [searchReport, searchOptions.targetChainLength]);

    const diagnostics = React.useMemo(() => {
        if (!searchReport || !(searchReport.stats as any).stageStats) return null;
        const stats = searchReport.stats as any;
        const transitionRowsReturned = stats.stageStats.transitionsReturned ?? 0;
        const transitionCandidatesEnumerated = stats.stageStats.candidateTransitionsEnumerated ?? 0;
        return {
            stage: stats.stageStats,
            coverage: stats.coverage ?? null,
            edgesTraversed: stats.edgesTraversed ?? 0,
            timeoutExtensionAppliedMs: stats.timeoutExtensionAppliedMs ?? 0,
            transitionRowsReturned,
            transitionCandidatesEnumerated,
            transitionAccountingHolds: transitionRowsReturned >= transitionCandidatesEnumerated
        };
    }, [searchReport]);

    const maxConsecutiveDissonanceRegions = React.useMemo(() => {
        if (!chainCandidate) return 0;
        return computeMaxConsecutiveDissonanceRegions(chainCandidate.regions);
    }, [chainCandidate]);

    const dissonanceAudit = React.useMemo(() => {
        if (!chainCandidate) {
            return { nctRegions: 0, dissonantRegions: 0, consonantRegionsWithNct: 0 };
        }
        return computeHarmonicRegionDissonanceAudit(chainCandidate.regions);
    }, [chainCandidate]);


    return (
        <>
            <StrettoSearchPanel 
                options={searchOptions} 
                setOptions={setSearchOptions}
                onSearch={onSearch}
                isSearching={isSearching}
                searchProgress={searchProgress}
                voiceNames={voiceNames}
                setVoiceNames={setVoiceNames}
                subjectNotes={subjectNotes}
                ppq={ppq}
            />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-1 bg-gray-900 border border-gray-700 rounded shadow-inner">
                    <div className="p-3 border-b border-gray-700 bg-gray-800 flex justify-between items-center">
                        <h3 className="text-xs font-bold text-gray-400">FOUND CHAINS ({chainResults.length})</h3>
                        {searchReport && (
                            <div className="text-[9px] text-gray-500 text-right">
                                {searchReport.stats.nodesVisited.toLocaleString()} nodes
                                <MetricHelp metricKey="nodesVisited" /> in {searchReport.stats.timeMs}ms
                                <MetricHelp metricKey="runTimeMs" />
                            </div>
                        )}
                    </div>
                    {searchStatus && (
                        <div className={`border-b p-2 text-[10px] ${searchStatus.toneClass}`}>
                            <strong>{searchStatus.heading}:</strong> {searchStatus.detail}
                            <div className="mt-1 text-[9px] text-gray-300">
                                Progress {searchStatus.progressPercent}%<MetricHelp metricKey="progressPercent" /> · Target {searchOptions.targetChainLength}<MetricHelp metricKey="targetChainLength" /> · Reached {searchReport?.stats.maxDepthReached ?? 0}<MetricHelp metricKey="maxDepthReached" />
                            </div>
                        </div>
                    )}
                    {runtimePresentation && (
                        <div className="border-b border-cyan-800/60 bg-cyan-950/20 p-2 text-[10px] text-cyan-100">
                            <div>
                                <strong>Live Search Telemetry:</strong> Budget-phase heuristic: {runtimePresentation.algorithmPhase}
                                <MetricHelp metricKey="runtimePhaseHeuristic" />
                            </div>
                            <div className="text-[9px] text-cyan-200 mt-0.5">{runtimePresentation.phaseDetail} This label tracks wall-clock budget segments, not guaranteed algorithmic completion milestones.</div>
                            <div className="mt-1 h-1.5 w-full rounded bg-cyan-900/60">
                                <div
                                    className="h-1.5 rounded bg-cyan-400 transition-all"
                                    style={{ width: `${runtimePresentation.elapsedPercent}%` }}
                                />
                            </div>
                            <div className="mt-1 text-[9px] text-cyan-200">
                                Time budget usage {runtimePresentation.elapsedPercent}%<MetricHelp metricKey="elapsedBudgetPercent" /> · Elapsed {runtimePresentation.elapsedMs}ms<MetricHelp metricKey="elapsedWallClockMs" /> · Estimated remaining {runtimePresentation.estimatedRemainingMs}ms<MetricHelp metricKey="estimatedRemainingMs" />
                            </div>
                        </div>
                    )}
                    {diagnostics && (
                        <div className="border-b border-gray-700 p-2 text-[9px] text-gray-300 bg-gray-850">
                            <div className="font-semibold text-gray-200 mb-1">Search diagnostics</div>
                            <div>Edges traversed: {diagnostics.edgesTraversed.toLocaleString()} · Structural scans: {diagnostics.stage.structuralScanInvocations.toLocaleString()}<MetricHelp metricKey="structuralScanInvocations" /></div>
                            <div>Pair rejects: {diagnostics.stage.pairStageRejected.toLocaleString()}<MetricHelp metricKey="pairStageRejected" /> · Triplet rejects: {diagnostics.stage.tripletStageRejected.toLocaleString()}<MetricHelp metricKey="tripletStageRejected" /> · Global rejects: {diagnostics.stage.globalLineageStageRejected.toLocaleString()}<MetricHelp metricKey="globalLineageStageRejected" /></div>
                            <div>Triplet fail breakdown → pairwise: {diagnostics.stage.triplePairwiseRejected.toLocaleString()}, lower-bound: {diagnostics.stage.tripleLowerBoundRejected.toLocaleString()}, voice: {diagnostics.stage.tripleVoiceRejected.toLocaleString()}, P4-bass: {diagnostics.stage.tripleP4BassRejected.toLocaleString()}, parallel: {diagnostics.stage.tripleParallelRejected.toLocaleString()}</div>
                            <div>
                                Transition accounting → returned rows: {diagnostics.transitionRowsReturned.toLocaleString()}<MetricHelp metricKey="transitionRowsReturned" /> · enumerated candidates: {diagnostics.transitionCandidatesEnumerated.toLocaleString()}<MetricHelp metricKey="transitionCandidatesEnumerated" /> · invariant:
                                <span className={diagnostics.transitionAccountingHolds ? 'text-emerald-300 font-semibold' : 'text-red-300 font-semibold'}>
                                    {diagnostics.transitionAccountingHolds ? 'holds' : 'violated'}
                                </span>
                            </div>
                            {diagnostics.coverage && (
                                <div>Coverage → node budget: {diagnostics.coverage.nodeBudgetUsedPercent}%<MetricHelp metricKey="nodeBudgetUsedPercent" /> · completion lower bound: {diagnostics.coverage.completionRatioLowerBound != null ? `${diagnostics.coverage.completionRatioLowerBound}%` : 'n/a'}<MetricHelp metricKey="completionRatioLowerBound" /> · max frontier: {diagnostics.coverage.maxFrontierSize.toLocaleString()}<MetricHelp metricKey="maxFrontierSize" /> ({diagnostics.coverage.maxFrontierClassCount.toLocaleString()} classes)</div>
                            )}
                            {diagnostics.timeoutExtensionAppliedMs > 0 && (
                                <div>Timeout extension applied: +{diagnostics.timeoutExtensionAppliedMs}ms near completion.</div>
                            )}
                        </div>
                    )}
                    <StrettoResultsList 
                        results={chainResults}
                        selectedId={selectedChain?.id || null}
                        onSelect={setSelectedChain}
                        voiceNames={voiceNames}
                    />
                </div>
                <div className="lg:col-span-2">
                    <StrettoInspector 
                        candidate={chainCandidate}
                        ppq={ppq}
                        ts={ts}
                        isPlaying={isPlaying}
                        onPlay={onPlay}
                        assemblyResult={""}
                        assemblyLog={[]}
                        onClearAssembly={() => {}}
                        onDownloadChain={onDownloadChain}
                    />
                    {selectedChain && (
                        <div className="mt-3 rounded border border-gray-700 bg-gray-900/60 p-2 text-[10px] text-gray-300">
                            <span className="font-semibold text-gray-200">Rendered Harmonic-Region Diagnostic:</span>{' '}
                            Maximum consecutive dissonant regions = <span className="font-mono text-amber-300">{maxConsecutiveDissonanceRegions}</span>
                            <div className="mt-1 text-[9px] text-gray-400">
                                NCT regions: <span className="font-mono text-amber-300">{dissonanceAudit.nctRegions}</span> ·
                                Dissonant regions: <span className="font-mono text-amber-300">{dissonanceAudit.dissonantRegions}</span> ·
                                Consonant-with-NCT anomalies: <span className={`font-mono ${dissonanceAudit.consonantRegionsWithNct > 0 ? 'text-red-300' : 'text-green-300'}`}>{dissonanceAudit.consonantRegionsWithNct}</span>
                            </div>
                        </div>
                    )}
                    
                    <div className="mt-4 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-800 p-3 rounded border border-gray-700">
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-400 uppercase">Master Transpose:</span>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setMasterTransposition(Math.max(-24, masterTransposition - 1))}
                                    className="bg-gray-700 hover:bg-gray-600 text-white w-6 h-6 rounded flex items-center justify-center font-bold text-sm"
                                >-</button>
                                <span className={`text-sm font-mono w-12 text-center ${masterTransposition !== 0 ? 'text-brand-primary font-bold' : 'text-gray-300'}`}>
                                    {masterTransposition > 0 ? '+' : ''}{masterTransposition}
                                </span>
                                <button 
                                    onClick={() => setMasterTransposition(Math.min(24, masterTransposition + 1))}
                                    className="bg-gray-700 hover:bg-gray-600 text-white w-6 h-6 rounded flex items-center justify-center font-bold text-sm"
                                >+</button>
                            </div>
                            <span className="text-[10px] text-gray-500 hidden sm:inline">Shift entire chain before export.</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
