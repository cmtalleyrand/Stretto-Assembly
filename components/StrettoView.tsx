
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { RawNote, StrettoCandidate, StrettoSearchOptions, StrettoChainResult, HarmonicRegion, StrettoSearchReport, StrettoGrade, StrettoListFilterContext, CanonSearchOptions, CanonChainResult, CanonSearchReport } from '../types';
import { parseSimpleAbc, extractKeyFromAbc, extractMeterFromAbc } from './services/abcBridge';
import { analyzeStrettoCandidate, analyzeStrettoTripletCandidate, generatePolyphonicHarmonicRegions } from './services/strettoCore';
import { getStrictPitchName } from './services/midiSpelling';
import { downloadStrettoCandidate, downloadStrettoSelection } from './services/strettoExport';
import { Spinner, DocumentTextIcon } from './Icons';
import FileUpload from './FileUpload';
import { playSequence, stopPlayback } from './midiPlaybackService';
import { useStrettoAssembly } from '../hooks/useStrettoAssembly';
import { deriveInitialPivotSettings } from './services/stretto/pivotInitialization';
import { computeMaxDelayAutoBeats } from './services/stretto/delayUtils';

import StrettoConfig, { SearchResolution } from './stretto/StrettoConfig';
import { computeSubjectPivotCandidates, rankPivotCandidates, PivotSearchMetric, PivotCandidateObservation } from './services/pairwisePivotSearch';
import StrettoList from './stretto/StrettoList';
import StrettoInspector from './stretto/StrettoInspector';
import StrettoFooter from './stretto/StrettoFooter';
import StrettoChainView from './stretto/StrettoChainView';
import { isCandidateAllowedByHardPairwisePolicy, pruneCheckedIdsByHardPairwisePolicy } from './stretto/selectionPolicy';
import CanonSearchPanel from './stretto/CanonSearchPanel';
import CanonResultsList from './stretto/CanonResultsList';
import { runCanonSearch } from './services/canonSearch';
import PianoRoll from './PianoRoll';
import { computeSecondDelayStart, computeSecondDelayEnd, enumerateTripletInversionPairs, TripletDelayOrderingMode } from './services/tripletDiscoveryOptions';

interface StrettoViewProps {
    notes: RawNote[]; 
    ppq: number;
    ts: { num: number, den: number };
    voiceNames?: Record<number, string>;
    setVoiceNames?: (names: Record<number, string>) => void;
    onMidiUpload: (file: File) => void;
    isMidiLoading: boolean;
    midiTracks: { id: number; name: string; noteCount: number }[];
    selectedMidiTrackId: number | null;
    onSelectMidiTrack: (trackId: number) => void;
}

interface SavedSubject {
    id: string;
    name: string;
    data: string;
}

interface StrettoSearchWorkerRequest {
    subject: RawNote[];
    options: StrettoSearchOptions;
    ppq: number;
}

interface StrettoSearchProgressState {
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

export default function StrettoView({
    notes: initialNotes,
    ppq,
    ts,
    voiceNames,
    setVoiceNames,
    onMidiUpload,
    isMidiLoading,
    midiTracks,
    selectedMidiTrackId,
    onSelectMidiTrack
}: StrettoViewProps) {
    const [mode, setMode] = useState<'midi' | 'abc'>('abc');
    const [abcInput, setAbcInput] = useState<string>("M:4/4\nL:1/4\nQ:120\nK:C\nc2 G c d e f g3 a b c'2");
    const [viewMode, setViewMode] = useState<'pairwise' | 'chain' | 'canon'>('chain');
    const [discoveryArity, setDiscoveryArity] = useState<'pairwise' | 'triplet'>('pairwise');
    const [tripletDelayOrderingMode, setTripletDelayOrderingMode] = useState<TripletDelayOrderingMode>('unconstrained');
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [pairwiseResults, setPairwiseResults] = useState<StrettoCandidate[]>([]);
    // Delay range (in beats). null = auto-derived from subject length.
    const [minDelayBeats, setMinDelayBeats] = useState<number>(0.5);
    const [maxDelayBeats, setMaxDelayBeats] = useState<string>(''); // empty = auto
    
    const [gradeFilter, setGradeFilter] = useState<Record<StrettoGrade, boolean>>({
        'STRONG': true,
        'VIABLE': true,
        'INVALID': false
    });

    const [savedSubjects, setSavedSubjects] = useState<SavedSubject[]>([]);
    const [saveName, setSaveName] = useState('');
    const [showLibrary, setShowLibrary] = useState(false);

    const [configIntervals, setConfigIntervals] = useState<number[]>([0, 12, -12, 7, -7, 5, -5, 24, -24]);
    const [includeExtensions, setIncludeExtensions] = useState(false);
    const [includeInversions, setIncludeInversions] = useState(false);
    const [searchRes, setSearchRes] = useState<SearchResolution>('full');
    const [selectedCandidate, setSelectedCandidate] = useState<StrettoCandidate | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [discoveryFilterContext, setDiscoveryFilterContext] = useState<StrettoListFilterContext | null>(null);
    const [pivotSearchResults, setPivotSearchResults] = useState<PivotSearchMetric[]>([]);
    
    // Master Transposition State (Post-processing)
    const [masterTransposition, setMasterTransposition] = useState<number>(0);

    const [searchOptions, setSearchOptions] = useState<StrettoSearchOptions>({
        ensembleTotal: 4,
        targetChainLength: 8,
        delaySearchCategory: 'stretto',
        canonDelayMinBeats: 1,
        canonDelayMaxBeats: 4,
        subjectVoiceIndex: 2, 
        truncationMode: 'None', 
        truncationTargetBeats: 4,
        inversionMode: 1,
        useChromaticInversion: false,
        thirdSixthMode: 1,
        pivotMidi: 60, // Placeholder, updated in effect
        requireConsonantEnd: false,
        disallowComplexExceptions: true,
        maxPairwiseDissonance: 0.4, // Default hard cap: 40% dissonant overlap
        scaleRoot: 0,
        scaleMode: 'Major',
        maxSearchTimeMs: 30000,
        strettoMinDelayBeats: undefined,
        useAutoTruncation: false,
    });
    
    const [chainResults, setChainResults] = useState<StrettoChainResult[]>([]);
    const [searchReport, setSearchReport] = useState<StrettoSearchReport | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchProgress, setSearchProgress] = useState<StrettoSearchProgressState | null>(null);
    const activeWorkerRef = useRef<Worker | null>(null);
    const [selectedChain, setSelectedChain] = useState<StrettoChainResult | null>(null);

    // --- Canon Search State ---
    const [canonOptions, setCanonOptions] = useState<CanonSearchOptions>({
        ensembleTotal: 4,
        delayMinBeats: 1,
        delayMaxBeats: 4,
        dissonanceThreshold: 0.5,
        chainLengthMin: 4,
        chainLengthMax: 8,
        allowInversions: false,
        allowThirdSixth: false,
        pivotMidi: 60,
        useChromaticInversion: false,
        scaleRoot: 0,
        scaleMode: 'Major',
        subjectVoiceIndex: 0,
        transpositionMode: 'independent',
    });
    const [canonReport, setCanonReport] = useState<CanonSearchReport | null>(null);
    const [isCanonSearching, setIsCanonSearching] = useState(false);
    const [selectedCanonResult, setSelectedCanonResult] = useState<CanonChainResult | null>(null);
    const [canonProgress, setCanonProgress] = useState<{ pct: number; msg: string } | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('stretto_subject_library');
        if (saved) {
            try { setSavedSubjects(JSON.parse(saved)); } catch (e) { console.error(e); }
        }
    }, []);

    const subjectTitle = useMemo(() => {
        if (mode === 'abc') {
            const match = abcInput.match(/^T:\s*(.+)$/m);
            return match ? match[1].trim() : "ABC_Subject";
        }
        return "MIDI_Subject";
    }, [mode, abcInput]);

    const subjectNotes = useMemo(() => {
        if (mode === 'abc') return parseSimpleAbc(abcInput, ppq || 480);
        return initialNotes;
    }, [mode, abcInput, initialNotes, ppq]);


    const pivotOptions = useMemo(() => {
        const candidates = computeSubjectPivotCandidates(subjectNotes);
        if (candidates.length > 0) return candidates;
        return [searchOptions.pivotMidi];
    }, [subjectNotes, searchOptions.pivotMidi]);

    useEffect(() => {
        if (pivotOptions.length === 0) return;
        if (!pivotOptions.includes(searchOptions.pivotMidi)) {
            setSearchOptions((prev) => ({ ...prev, pivotMidi: pivotOptions[0] }));
        }
    }, [pivotOptions, searchOptions.pivotMidi]);

    const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const abcKeyLabel = useMemo(() => {
        if (mode !== 'abc') return null;
        const parsed = extractKeyFromAbc(abcInput);
        if (!parsed) return 'C Major (default – no K: field)';
        return `${NOTE_NAMES[parsed.root]} ${parsed.mode}`;
    }, [mode, abcInput]);

    const parsedAbcMeter = useMemo(() => {
        if (mode !== 'abc') return null;
        return extractMeterFromAbc(abcInput);
    }, [mode, abcInput]);

    const activeMeter = useMemo(() => {
        if (mode === 'abc' && parsedAbcMeter) return parsedAbcMeter;
        return ts;
    }, [mode, parsedAbcMeter, ts]);

    const subjectPianoRollData = useMemo(() => ({
        notes: subjectNotes.map(n => ({ ...n, voiceIndex: 0 })),
        name: 'Subject',
        ppq: ppq || 480,
        timeSignature: { numerator: activeMeter.num, denominator: activeMeter.den },
    }), [subjectNotes, ppq, activeMeter]);

    // Clear selection and discovery results when subject changes
    useEffect(() => {
        setSelectedCandidate(null);
        setCheckedIds(new Set());
        setChainResults([]);
        setSelectedChain(null);
        setSearchReport(null);
        setDiscoveryFilterContext(null);
        setPairwiseResults([]);
    }, [subjectNotes]);

    // Intelligent Pivot Initialization using Key Prediction or ABC Context
    useEffect(() => {
        const derived = deriveInitialPivotSettings(subjectNotes, mode, abcInput);
        if (!derived) return;
        setSearchOptions(prev => ({
            ...prev,
            pivotMidi: derived.pivotMidi,
            scaleRoot: derived.scaleRoot,
            scaleMode: derived.scaleMode
        }));
    }, [subjectNotes, mode, abcInput]);

    const handleSaveSubject = () => {
        if (!saveName.trim() || !abcInput.trim()) return;
        const newSubject: SavedSubject = { id: Date.now().toString(), name: saveName.trim(), data: abcInput };
        const updated = [...savedSubjects, newSubject];
        setSavedSubjects(updated);
        localStorage.setItem('stretto_subject_library', JSON.stringify(updated));
        setSaveName('');
    };

    const handleDeleteSubject = (id: string) => {
        const updated = savedSubjects.filter(s => s.id !== id);
        setSavedSubjects(updated);
        localStorage.setItem('stretto_subject_library', JSON.stringify(updated));
    };

    const handleLoadSubject = (data: string) => { setAbcInput(data); };

    const { 
        isAssembling, assemblyStatus, assemblyResult, assemblyLog, 
        setAssemblyResult, runAssembly 
    } = useStrettoAssembly({ notes: subjectNotes, ppq: ppq || 480, ts: activeMeter });

    /** Auto-computed max delay in beats (2/3 of subject length), shown as placeholder. */
    const maxDelayAutoBeats = useMemo(
        () => computeMaxDelayAutoBeats(subjectNotes, ppq || 480, activeMeter.den),
        [subjectNotes, ppq, activeMeter.den]
    );

    const runDiscovery = () => {
        const validNotes = subjectNotes.filter(n => !!n);
        if (validNotes.length === 0) return;

        setIsDiscovering(true);
        // Yield to React so the loading state renders before the heavy loop
        setTimeout(() => {
            const candidates: StrettoCandidate[] = [];
            const durationTicks = Math.max(...validNotes.map(n => n.ticks + n.durationTicks));
            const currentPpq = ppq || 480;
            const beatDiv = currentPpq * (4 / activeMeter.den);

            let stepTicks = currentPpq;
            if (searchRes === 'half') stepTicks = currentPpq / 2;
            else if (searchRes === 'double') stepTicks = currentPpq * 2;

            // Respect user-specified max delay (capped by the 2/3 Sb rule)
            const autoMax = durationTicks * (2/3);
            const userMax = maxDelayBeats !== '' ? parseFloat(maxDelayBeats) * beatDiv : autoMax;
            const effectiveMaxDelay = Math.min(userMax, autoMax);
            const effectiveMinDelay = Math.max(stepTicks, Math.round(minDelayBeats * beatDiv));

            let intervalsToCheck = [...configIntervals];
            if (includeExtensions) {
                const exts = [3, 4, 8, 9, -3, -4, -8, -9];
                exts.forEach(e => { if (!intervalsToCheck.includes(e)) intervalsToCheck.push(e); });
            }

            if (discoveryArity === 'pairwise') {
                intervalsToCheck.forEach(interval => {
                    for (let d = effectiveMinDelay; d <= effectiveMaxDelay; d += stepTicks) {
                        candidates.push(analyzeStrettoCandidate(validNotes, interval, Math.round(d), currentPpq, activeMeter, false, searchOptions.pivotMidi, searchOptions.useChromaticInversion, searchOptions.scaleRoot, searchOptions.maxPairwiseDissonance, searchOptions.scaleMode));
                        if (includeInversions) {
                            candidates.push(analyzeStrettoCandidate(validNotes, interval, Math.round(d), currentPpq, activeMeter, true, searchOptions.pivotMidi, searchOptions.useChromaticInversion, searchOptions.scaleRoot, searchOptions.maxPairwiseDissonance, searchOptions.scaleMode));
                        }
                    }
                });
            } else {
                // Triplet-enumeration aliases:
                // d_te_1 = delay from e0→e1, d_te_2 = relative gap from e1→e2.
                // e2 absolute position = d_te_1 + d_te_2 (handled inside analyzeStrettoTripletCandidate)
                const inversionPairs = enumerateTripletInversionPairs(includeInversions);
                for (let d_te_1 = effectiveMinDelay; d_te_1 <= effectiveMaxDelay; d_te_1 += stepTicks) {
                    const d_te_2_start = computeSecondDelayStart(d_te_1, stepTicks);
                    const d_te_2_end = computeSecondDelayEnd(d_te_1, effectiveMaxDelay, stepTicks, tripletDelayOrderingMode);
                    for (let d_te_2 = d_te_2_start; d_te_2 <= d_te_2_end; d_te_2 += stepTicks) {
                        for (const i1 of intervalsToCheck) {
                            for (const i2 of intervalsToCheck) {
                                for (const inversionPair of inversionPairs) {
                                    candidates.push(
                                        analyzeStrettoTripletCandidate(
                                            validNotes,
                                            i1,
                                            i2,
                                            Math.round(d_te_1),
                                            Math.round(d_te_2),
                                            currentPpq,
                                            activeMeter,
                                            inversionPair.firstIsInverted,
                                            inversionPair.secondIsInverted,
                                            searchOptions.pivotMidi,
                                            searchOptions.useChromaticInversion,
                                            searchOptions.scaleRoot,
                                            searchOptions.maxPairwiseDissonance,
                                            searchOptions.scaleMode
                                        )
                                    );
                                }
                            }
                        }
                    }
                }
            }

            setPairwiseResults(candidates);
            setIsDiscovering(false);
        }, 10);
    };

    const processedDiscoveryResults = useMemo(() => {
        return pairwiseResults.filter(r => gradeFilter[r.grade] && r.dissonanceRatio <= searchOptions.maxPairwiseDissonance);
    }, [pairwiseResults, gradeFilter, searchOptions.maxPairwiseDissonance]);

    useEffect(() => {
        setCheckedIds((prev) => pruneCheckedIdsByHardPairwisePolicy(prev, pairwiseResults, searchOptions.maxPairwiseDissonance));
        setSelectedCandidate((prev) => {
            if (!prev) return null;
            return isCandidateAllowedByHardPairwisePolicy(prev, searchOptions.maxPairwiseDissonance) ? prev : null;
        });
    }, [pairwiseResults, searchOptions.maxPairwiseDissonance]);

    const getSelectedCandidates = () => pairwiseResults.filter(r => checkedIds.has(r.id));

    const runChainSearchInWorker = (
        request: StrettoSearchWorkerRequest,
        onProgress: (progress: StrettoSearchProgressState) => void
    ): Promise<StrettoSearchReport> => {
        if (activeWorkerRef.current) {
            activeWorkerRef.current.terminate();
            activeWorkerRef.current = null;
        }
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./workers/strettoSearchWorker.ts', import.meta.url), { type: 'module' });
            activeWorkerRef.current = worker;
            worker.onmessage = (event: MessageEvent<StrettoSearchWorkerProgress | StrettoSearchWorkerResult | StrettoSearchWorkerFailure>) => {
                const payload = event.data;
                if (payload.ok && payload.kind === 'progress') {
                    const telemetry = {
                        ...payload.telemetry,
                        dagExploredWorkItems: payload.telemetry.dagExploredWorkItems ?? 0,
                        dagLiveFrontierWorkItems: payload.telemetry.dagLiveFrontierWorkItems ?? 0
                    };
                    onProgress({
                        elapsedMs: payload.elapsedMs,
                        stage: payload.stage,
                        completedUnits: payload.completedUnits,
                        totalUnits: payload.totalUnits,
                        terminal: payload.terminal,
                        telemetry,
                        heartbeat: payload.heartbeat
                    });
                    return;
                }
                worker.terminate();
                activeWorkerRef.current = null;
                if (payload.ok && payload.kind === 'result') {
                    resolve(payload.report);
                    return;
                }
                reject(new Error((payload as StrettoSearchWorkerFailure).error));
            };
            worker.onerror = (event: ErrorEvent) => {
                worker.terminate();
                activeWorkerRef.current = null;
                reject(new Error(event.message || 'Stretto search worker failed.'));
            };
            worker.postMessage(request);
        });
    };

    const handleChainSearch = async () => {
        setIsSearching(true); setChainResults([]); setSearchReport(null); setSelectedChain(null);
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
                targetChainLength: searchOptions.targetChainLength,
                pairwiseOperationsProcessed: 0,
                tripletOperationsProcessed: 0,
                dagNodesExpanded: 0,
                dagEdgesEvaluated: 0,
                dagExploredWorkItems: 0,
                dagLiveFrontierWorkItems: 0
            },
            heartbeat: true
        });
        setTimeout(async () => {
            try {
                const report = await runChainSearchInWorker({
                    subject: subjectNotes.filter(n => !!n),
                    options: {
                    ...searchOptions,
                    voiceNames,
                    meterNumerator: activeMeter.num,
                    meterDenominator: activeMeter.den,
                    },
                    ppq: ppq || 480
                }, setSearchProgress);
                setChainResults(report.results); setSearchReport(report);
            } catch (e) { alert("Search failed."); } finally { setIsSearching(false); }
            setSearchProgress(null);
        }, 100);
    };

    const handleCanonSearch = async () => {
        const validNotes = subjectNotes.filter(n => !!n);
        if (validNotes.length === 0) return;
        setIsCanonSearching(true);
        setCanonReport(null);
        setSelectedCanonResult(null);
        setCanonProgress({ pct: 0, msg: 'Starting…' });
        try {
            const report = await runCanonSearch(
                validNotes,
                canonOptions,
                ppq || 480,
                (pct, msg) => setCanonProgress({ pct, msg })
            );
            setCanonReport(report);
        } catch (e) {
            console.error('Canon search failed:', e);
        } finally {
            setIsCanonSearching(false);
            setCanonProgress(null);
        }
    };

    // Build a StrettoCandidate from the selected canon result for playback/download
    const canonToCandidate = useMemo((): StrettoCandidate | null => {
        if (!selectedCanonResult) return null;
        const validSubjectNotes = subjectNotes.filter(n => !!n);
        const currentPpq = ppq || 480;
        if (validSubjectNotes.length === 0) return null;
        const sortedSubj = [...validSubjectNotes].sort((a, b) => a.ticks - b.ticks);
        const startTick = sortedSubj[0].ticks;

        const invertPitchChromatic = (pitch: number, pivot: number) => pivot - (pitch - pivot);
        const SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
        const invertPitchDiatonic = (pitch: number, pivot: number) => {
            const diff = pitch - pivot;
            const oct = Math.floor(diff / 12);
            const semi = (diff % 12 + 12) % 12;
            let degree = -1, minErr = 99;
            SCALE_STEPS.forEach((s, i) => { if (Math.abs(s - semi) < minErr) { minErr = Math.abs(s - semi); degree = i; } });
            const absDegree = (oct * 7) + degree;
            const invAbsDegree = -absDegree;
            const invOct = Math.floor(invAbsDegree / 7);
            const invIndex = (invAbsDegree % 7 + 7) % 7;
            return pivot + (invOct * 12) + SCALE_STEPS[invIndex];
        };

        let allNotes: RawNote[] = [];
        selectedCanonResult.entries.forEach((entry) => {
            const entryStartTick = Math.round(entry.startBeat * currentPpq);
            // entry.length is in ticks (set by canonSearch.ts from variant.lengthTicks)
            const entryEndTick = entryStartTick + entry.length;

            const transformed = sortedSubj.map(n => {
                let pitch = n.midi;
                if (entry.type === 'I') {
                    const rawInverted = canonOptions.useChromaticInversion
                        ? invertPitchChromatic(n.midi, canonOptions.pivotMidi)
                        : invertPitchDiatonic(n.midi, canonOptions.pivotMidi);
                    const subjectFirst = sortedSubj[0].midi;
                    const invertedFirst = canonOptions.useChromaticInversion
                        ? invertPitchChromatic(subjectFirst, canonOptions.pivotMidi)
                        : invertPitchDiatonic(subjectFirst, canonOptions.pivotMidi);
                    const targetStart = subjectFirst + entry.transposition;
                    pitch = rawInverted + (targetStart - invertedFirst);
                } else {
                    pitch += entry.transposition;
                }
                return {
                    ...n,
                    ticks: (n.ticks - startTick) + entryStartTick,
                    midi: pitch,
                    name: getStrictPitchName(pitch),
                    voiceIndex: entry.voiceIndex,
                };
            });

            const clipped = transformed
                .filter(n => n.ticks < entryEndTick)
                .map(n => ({ ...n, durationTicks: Math.min(n.durationTicks, entryEndTick - n.ticks) }));
            allNotes = [...allNotes, ...clipped];
        });

        const regions = generatePolyphonicHarmonicRegions(allNotes, canonOptions.scaleRoot);
        return {
            id: selectedCanonResult.id,
            intervalLabel: 'Canon',
            intervalSemis: selectedCanonResult.transpositionSteps[0] ?? 0,
            delayBeats: selectedCanonResult.delayBeats,
            delayTicks: Math.round(selectedCanonResult.delayBeats * currentPpq),
            grade: 'STRONG',
            errors: [],
            notes: allNotes,
            regions,
            dissonanceRatio: 0,
            pairDissonanceScore: 0,
            endsOnDissonance: false,
        };
    }, [selectedCanonResult, subjectNotes, ppq, canonOptions]);

    const chainToCandidate = useMemo((): StrettoCandidate | null => {
        if (!selectedChain) return null;
        let allNotes: RawNote[] = [];
        const validSubjectNotes = subjectNotes.filter(n => !!n);
        const currentPpq = ppq || 480;
        if (validSubjectNotes.length === 0) return null;
        const sortedSubj = [...validSubjectNotes].sort((a,b)=>a.ticks-b.ticks);
        const startTick = sortedSubj[0].ticks;
        
        const SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
        const invertPitchDiatonic = (pitch: number, pivot: number) => {
            const diff = pitch - pivot;
            const oct = Math.floor(diff / 12);
            const semi = (diff % 12 + 12) % 12;
            let degree = -1;
            let minErr = 99;
            SCALE_STEPS.forEach((s, i) => {
                if (Math.abs(s - semi) < minErr) { minErr = Math.abs(s - semi); degree = i; }
            });
            const absDegree = (oct * 7) + degree;
            const invAbsDegree = -absDegree;
            const invOct = Math.floor(invAbsDegree / 7);
            const invIndex = (invAbsDegree % 7 + 7) % 7;
            return pivot + (invOct * 12) + SCALE_STEPS[invIndex];
        };

        const invertPitchChromatic = (pitch: number, pivot: number) => {
            return pivot - (pitch - pivot);
        }

        selectedChain.entries.forEach((entry) => {
            const entryStartTick = Math.round(entry.startBeat * currentPpq);
            const transformed = sortedSubj.map(n => {
                let pitch = n.midi;
                
                if (entry.type === 'I') {
                    const rawInverted = searchOptions.useChromaticInversion 
                        ? invertPitchChromatic(n.midi, searchOptions.pivotMidi)
                        : invertPitchDiatonic(n.midi, searchOptions.pivotMidi);
                    
                    const subjectFirst = sortedSubj[0].midi;
                    const invertedFirst = searchOptions.useChromaticInversion 
                        ? invertPitchChromatic(subjectFirst, searchOptions.pivotMidi)
                        : invertPitchDiatonic(subjectFirst, searchOptions.pivotMidi);
                    
                    const targetStart = subjectFirst + entry.transposition;
                    const shift = targetStart - invertedFirst;
                    pitch = rawInverted + shift;

                } else {
                    pitch += entry.transposition;
                }
                
                pitch += masterTransposition;

                return { ...n, ticks: (n.ticks - startTick) + entryStartTick, midi: pitch, name: getStrictPitchName(pitch), voiceIndex: entry.voiceIndex };
            });
            const entryEnd = entryStartTick + (entry.length * (currentPpq/4));
            const clipped = transformed.filter(n => n.ticks < entryEnd).map(n => ({ ...n, durationTicks: Math.min(n.durationTicks, entryEnd - n.ticks) }));
            allNotes = [...allNotes, ...clipped];
        });

        // Pass pivotMidi (or scaleRoot) as keyRoot for visualization
        const chainRegions = generatePolyphonicHarmonicRegions(allNotes, searchOptions.scaleRoot);

        return { id: selectedChain.id, intervalLabel: "Chain", intervalSemis: 0, delayBeats: 0, delayTicks: 0, grade: 'STRONG', errors: [], notes: allNotes, regions: chainRegions, dissonanceRatio: 0, pairDissonanceScore: 0, endsOnDissonance: false };
    }, [selectedChain, subjectNotes, ppq, searchOptions.pivotMidi, searchOptions.useChromaticInversion, masterTransposition, searchOptions.scaleRoot, searchOptions.maxPairwiseDissonance]);

    const handlePlay = (notes: RawNote[]) => {
        if (isPlaying) { stopPlayback(); setIsPlaying(false); return; }
        setIsPlaying(true);
        const currentPpq = ppq || 480;
        playSequence(notes.filter(n => !!n).map(n => ({ 
            midi: n.midi, 
            name: n.name, 
            time: n.ticks * (0.5 / currentPpq), 
            duration: n.durationTicks * (0.5 / currentPpq), 
            velocity: n.velocity 
        })), () => setIsPlaying(false));
    };


    const runOptimalPivotSearch = () => {
        if (!includeInversions || subjectNotes.length === 0 || pivotOptions.length === 0) {
            setPivotSearchResults([]);
            return;
        }

        const validNotes = subjectNotes.filter((n) => !!n);
        if (validNotes.length === 0) {
            setPivotSearchResults([]);
            return;
        }

        const durationTicks = Math.max(...validNotes.map((n) => n.ticks + n.durationTicks));
        const maxDelay = durationTicks * (2 / 3);
        const currentPpq = ppq || 480;
        let stepTicks = currentPpq;
        if (searchRes === 'half') stepTicks = currentPpq / 2;
        else if (searchRes === 'double') stepTicks = currentPpq * 2;

        let intervalsToCheck = [...configIntervals];
        if (includeExtensions) {
            const exts = [3, 4, 8, 9, -3, -4, -8, -9];
            exts.forEach((e) => { if (!intervalsToCheck.includes(e)) intervalsToCheck.push(e); });
        }

        const ranked = rankPivotCandidates({
            pivots: pivotOptions,
            referencePivot: searchOptions.pivotMidi,
            evaluatePivot: (pivotMidi) => {
                const observations: PivotCandidateObservation[] = [];
                intervalsToCheck.forEach((interval) => {
                    for (let d = stepTicks; d <= maxDelay; d += stepTicks) {
                        const candidate = analyzeStrettoCandidate(
                            validNotes,
                            interval,
                            Math.round(d),
                            currentPpq,
                            ts,
                            true,
                            pivotMidi,
                            searchOptions.useChromaticInversion,
                            searchOptions.scaleRoot,
                            searchOptions.maxPairwiseDissonance,
                            searchOptions.scaleMode
                        );
                        observations.push({
                            delayTicks: candidate.delayTicks,
                            dissonanceRatio: candidate.dissonanceRatio,
                            isViable: candidate.grade !== 'INVALID'
                        });
                    }
                });
                return observations;
            }
        });

        setPivotSearchResults(ranked);
        if (ranked.length > 0) {
            setSearchOptions((prev) => ({ ...prev, pivotMidi: ranked[0].pivotMidi }));
        }
    };

    const toggleCheck = (id: string) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            const cand = pairwiseResults.find(r => r.id === id);
            if (cand) setSelectedCandidate(cand);
            return next;
        });
    };

    return (
        <div className="w-full bg-gray-dark p-6 rounded-2xl border border-gray-medium animate-slide-up pb-32 relative">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-light">Stretto Assembly Lab</h2>
                {isAssembling && (
                    <div className="flex items-center gap-2 bg-brand-primary/20 px-4 py-2 rounded-full border border-brand-primary/40 animate-pulse">
                        <Spinner className="w-4 h-4 text-brand-primary" />
                        <span className="text-xs font-bold text-brand-primary">{assemblyStatus}</span>
                    </div>
                )}
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700 justify-between">
                <div className="flex gap-2 items-center">
                    <span className="text-xs font-bold text-gray-500 mr-2">INPUT:</span>
                    <button onClick={() => setMode('midi')} className={`px-4 py-2 text-sm rounded transition-colors font-bold ${mode === 'midi' ? 'bg-brand-primary text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700'}`}>Selected MIDI</button>
                    <button onClick={() => setMode('abc')} className={`px-4 py-2 text-sm rounded transition-colors font-bold ${mode === 'abc' ? 'bg-brand-primary text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700'}`}>ABC Notation</button>
                </div>
                <div className="flex gap-2 items-center border-l border-gray-600 pl-4">
                    <span className="text-xs font-bold text-gray-500 mr-2">MODE:</span>
                    <button onClick={() => setViewMode('pairwise')} className={`px-4 py-2 text-sm rounded transition-colors font-bold ${viewMode === 'pairwise' ? 'bg-brand-secondary text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700'}`}>Pairwise Discovery</button>
                    <button onClick={() => setViewMode('chain')} className={`px-4 py-2 text-sm rounded transition-colors font-bold ${viewMode === 'chain' ? 'bg-brand-secondary text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700'}`}>Algorithmic Chain</button>
                    <button onClick={() => setViewMode('canon')} className={`px-4 py-2 text-sm rounded transition-colors font-bold ${viewMode === 'canon' ? 'bg-brand-secondary text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700'}`}>Canon Search</button>
                </div>
            </div>
            {viewMode === 'pairwise' && (
                <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-700 flex flex-wrap items-end gap-4">
                    {/* Arity */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Discovery Arity</span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => { setDiscoveryArity('pairwise'); setPairwiseResults([]); }}
                                className={`px-3 py-1.5 text-xs rounded border font-bold transition-colors ${discoveryArity === 'pairwise' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-gray-800'}`}
                            >
                                Pairwise
                            </button>
                            <button
                                type="button"
                                onClick={() => { setDiscoveryArity('triplet'); setPairwiseResults([]); }}
                                className={`px-3 py-1.5 text-xs rounded border font-bold transition-colors ${discoveryArity === 'triplet' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-gray-800'}`}
                            >
                                Triplet
                            </button>
                        </div>
                    </div>

                    {/* Triplet: delay ordering */}
                    {discoveryArity === 'triplet' && (
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">d_te_2 (e1→e2 gap)</span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setTripletDelayOrderingMode('tightening')}
                                    className={`px-3 py-1.5 text-xs rounded border font-bold transition-colors ${tripletDelayOrderingMode === 'tightening' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-gray-800'}`}
                                    title="Only enumerate tightening triplets where d_te_2 < d_te_1"
                                >
                                    Tightening (d_te_2 &lt; d_te_1)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTripletDelayOrderingMode('unconstrained')}
                                    className={`px-3 py-1.5 text-xs rounded border font-bold transition-colors ${tripletDelayOrderingMode === 'unconstrained' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-gray-800'}`}
                                    title="Enumerate all d_te_2 values up to max delay"
                                >
                                    All d_te_2
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Delay range */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Delay Range (beats)</span>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={minDelayBeats}
                                onChange={e => setMinDelayBeats(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-brand-primary"
                                title="Minimum delay (beats)"
                            />
                            <span className="text-gray-500 text-xs">–</span>
                            <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={maxDelayBeats}
                                onChange={e => setMaxDelayBeats(e.target.value)}
                                placeholder={maxDelayAutoBeats > 0 ? `${maxDelayAutoBeats}` : 'auto'}
                                className="w-20 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-brand-primary"
                                title="Maximum delay (beats) — blank = auto (2/3 subject length)"
                            />
                        </div>
                    </div>

                    {/* Discover button */}
                    <div className="flex flex-col gap-1 ml-auto">
                        <span className="text-[10px] font-bold text-transparent select-none">_</span>
                        <button
                            type="button"
                            onClick={runDiscovery}
                            disabled={isDiscovering || subjectNotes.length === 0}
                            className="px-4 py-1.5 text-xs rounded border font-bold transition-colors bg-brand-secondary text-white border-brand-secondary hover:bg-brand-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isDiscovering && <Spinner className="w-3 h-3" />}
                            {isDiscovering ? 'Discovering…' : 'Run Discovery'}
                        </button>
                    </div>
                </div>
            )}

            {mode === 'abc' && (
                <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="block text-sm text-gray-400 font-bold uppercase tracking-wider">Subject ABC</label>
                            <button onClick={() => setShowLibrary(!showLibrary)} className="text-xs bg-gray-800 hover:bg-gray-700 text-brand-primary border border-brand-primary/30 px-3 py-1 rounded flex items-center gap-2 transition-colors">
                                <DocumentTextIcon className="w-3 h-3" /> {showLibrary ? "Hide Library" : "Subject Library"}
                            </button>
                        </div>
                        {showLibrary && (
                            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 animate-fade-in">
                                <div className="flex gap-2 mb-4 border-b border-gray-700 pb-4">
                                    <input type="text" placeholder="Subject Name..." value={saveName} onChange={(e) => setSaveName(e.target.value)} className="flex-grow bg-gray-900 border border-gray-600 rounded px-3 py-1 text-sm text-white outline-none" />
                                    <button onClick={handleSaveSubject} disabled={!saveName.trim()} className="bg-brand-primary hover:bg-brand-secondary text-white px-4 py-1 rounded text-sm font-bold transition-colors disabled:bg-gray-600">Save</button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                    {savedSubjects.length > 0 ? savedSubjects.map(s => (
                                        <div key={s.id} className="flex justify-between items-center bg-gray-900 p-2 rounded border border-gray-700 group">
                                            <span className="text-sm font-bold text-gray-300 truncate mr-2">{s.name}</span>
                                            <div className="flex gap-1 opacity-50 group-hover:opacity-100">
                                                <button onClick={() => handleLoadSubject(s.data)} className="text-[10px] bg-brand-secondary/50 px-2 py-0.5 rounded">Load</button>
                                                <button onClick={() => handleDeleteSubject(s.id)} className="text-[10px] bg-red-900/50 px-2 py-0.5 rounded">×</button>
                                            </div>
                                        </div>
                                    )) : <p className="text-xs text-gray-500 col-span-full text-center py-2">Library empty.</p>}
                                </div>
                            </div>
                        )}
                        <textarea value={abcInput} onChange={e => setAbcInput(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white font-mono h-40 outline-none focus:border-brand-primary" />
                        {abcKeyLabel && (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[11px] text-gray-500 uppercase tracking-wide font-bold">ABC Parsing Key:</span>
                                <span className="bg-brand-primary/20 text-brand-primary border border-brand-primary/40 px-2 py-0.5 rounded font-mono text-xs font-bold">
                                    {abcKeyLabel}
                                </span>
                                <span className="text-[10px] text-gray-600 italic">applied to note accidentals</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-gray-500 uppercase tracking-wide font-bold">Detected Time Signature:</span>
                            <span className="bg-brand-secondary/20 text-brand-secondary border border-brand-secondary/40 px-2 py-0.5 rounded font-mono text-xs font-bold">
                                {activeMeter.num}/{activeMeter.den}
                            </span>
                            <span className="text-[10px] text-gray-600 italic">
                                {parsedAbcMeter ? 'read from M: field in ABC source' : 'fallback (no valid M: field)'}
                            </span>
                        </div>
                    </div>

                    <aside className="bg-gray-800/70 border border-gray-700 rounded-lg p-4 space-y-3">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Optional MIDI Seed</h3>
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                            Keep ABC as canonical subject input. Use MIDI import only to seed an alternate subject and compare stretto feasibility.
                        </p>
                        <FileUpload onFileUpload={onMidiUpload} isLoading={isMidiLoading} compact />

                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Imported Track</label>
                            <select
                                value={selectedMidiTrackId ?? ''}
                                onChange={(e) => onSelectMidiTrack(Number(e.target.value))}
                                disabled={midiTracks.length === 0}
                                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-xs text-gray-200 disabled:opacity-60"
                            >
                                {midiTracks.length === 0 ? (
                                    <option value="">No MIDI tracks loaded</option>
                                ) : (
                                    midiTracks.map((track) => (
                                        <option key={track.id} value={track.id}>
                                            {track.name} · {track.noteCount} notes
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                    </aside>
                </div>
            )}

            {mode === 'abc' && subjectNotes.length > 0 && (
                <div className="mb-6">
                    <label className="block text-sm text-gray-400 font-bold uppercase tracking-wider mb-2">Subject Preview</label>
                    <div className="h-56 bg-gray-900 rounded border border-gray-700 overflow-hidden">
                        <PianoRoll trackData={subjectPianoRollData} />
                    </div>
                </div>
            )}

            {viewMode === 'canon' ? (
                <div className="flex flex-col gap-4">
                    <CanonSearchPanel
                        options={canonOptions}
                        setOptions={setCanonOptions}
                        onSearch={handleCanonSearch}
                        isSearching={isCanonSearching}
                        totalEvaluated={canonReport?.totalEvaluated}
                        timeMs={canonReport?.timeMs}
                    />
                    {isCanonSearching && canonProgress && (
                        <div className="bg-gray-900 border border-gray-700 rounded p-3">
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[10px] text-gray-400 font-mono">{canonProgress.msg}</span>
                                <span className="text-[10px] text-gray-500 font-mono">{canonProgress.pct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                                <div
                                    className="bg-brand-primary h-1.5 rounded-full transition-all duration-200"
                                    style={{ width: `${canonProgress.pct}%` }}
                                />
                            </div>
                        </div>
                    )}
                    <CanonResultsList
                        results={canonReport?.results ?? []}
                        selectedId={selectedCanonResult?.id ?? null}
                        onSelect={setSelectedCanonResult}
                        isPlaying={isPlaying}
                        onPlay={(_res) => {
                            if (canonToCandidate) handlePlay(canonToCandidate.notes);
                        }}
                        onDownload={(_res) => {
                            if (canonToCandidate) downloadStrettoCandidate(canonToCandidate, ppq || 480, voiceNames, subjectTitle, { numerator: activeMeter.num, denominator: activeMeter.den });
                        }}
                    />
                    {canonToCandidate && (
                        <StrettoInspector
                            candidate={canonToCandidate}
                            ppq={ppq || 480}
                            ts={activeMeter}
                            isPlaying={isPlaying}
                            onPlay={handlePlay}
                            assemblyResult=""
                            assemblyLog={[]}
                            onClearAssembly={() => {}}
                            onDownloadChain={() => downloadStrettoCandidate(canonToCandidate, ppq || 480, voiceNames, subjectTitle, { numerator: activeMeter.num, denominator: activeMeter.den })}
                        />
                    )}
                </div>
            ) : viewMode === 'pairwise' ? (
                <>
                    <StrettoConfig
                        selectedIntervals={configIntervals}
                        setSelectedIntervals={setConfigIntervals}
                        searchRes={searchRes}
                        setSearchRes={setSearchRes}
                        includeInversions={includeInversions}
                        setIncludeInversions={setIncludeInversions}
                        includeExtensions={includeExtensions}
                        setIncludeExtensions={setIncludeExtensions}
                        pivotMidi={searchOptions.pivotMidi}
                        setPivotMidi={(val) => setSearchOptions((prev) => ({...prev, pivotMidi: val}))}
                        pivotOptions={pivotOptions}
                        onFindOptimalPivot={runOptimalPivotSearch}
                        pivotSearchResults={pivotSearchResults}
                    />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        <StrettoList
                            candidates={pairwiseResults}
                            processedResults={processedDiscoveryResults}
                            gradeFilter={gradeFilter}
                            setGradeFilter={setGradeFilter}
                            selectedId={selectedCandidate?.id || null}
                            onSelect={setSelectedCandidate}
                            checkedIds={checkedIds}
                            onToggleCheck={toggleCheck}
                            onFilterContextChange={setDiscoveryFilterContext}
                            isTriplet={discoveryArity === 'triplet'}
                            showNct={discoveryArity === 'triplet'}
                        />
                        <StrettoInspector candidate={selectedCandidate} ppq={ppq || 480} ts={activeMeter} isPlaying={isPlaying} onPlay={handlePlay} assemblyResult={assemblyResult} assemblyLog={assemblyLog} onClearAssembly={() => setAssemblyResult('')} onDownloadChain={() => selectedCandidate && downloadStrettoCandidate(selectedCandidate, ppq || 480, voiceNames, subjectTitle, { numerator: activeMeter.num, denominator: activeMeter.den })} />
                    </div>
                    <StrettoFooter selectedCandidates={getSelectedCandidates()} onDownloadMidi={() => downloadStrettoSelection(getSelectedCandidates(), ppq || 480, voiceNames, subjectTitle, { numerator: activeMeter.num, denominator: activeMeter.den })} onAssemble={() => runAssembly(checkedIds.size > 0 ? getSelectedCandidates() : (selectedCandidate ? [selectedCandidate] : []), abcInput, { filterContext: discoveryFilterContext })} isAssembling={isAssembling} onRemoveCandidate={toggleCheck} />
                </>
            ) : (
                <StrettoChainView 
                    searchOptions={searchOptions} 
                    setSearchOptions={setSearchOptions} 
                    onSearch={handleChainSearch} 
                    isSearching={isSearching} 
                    searchProgress={searchProgress}
                    chainResults={chainResults} 
                    selectedChain={selectedChain} 
                    setSelectedChain={setSelectedChain} 
                    voiceNames={voiceNames} 
                    setVoiceNames={setVoiceNames} 
                    chainToCandidate={chainToCandidate} 
                    ppq={ppq || 480} 
                    ts={activeMeter} 
                    isPlaying={isPlaying} 
                    onPlay={handlePlay} 
                    onDownloadChain={() => chainToCandidate && downloadStrettoCandidate(chainToCandidate, ppq || 480, voiceNames, subjectTitle, { numerator: activeMeter.num, denominator: activeMeter.den })} 
                    searchReport={searchReport}
                    masterTransposition={masterTransposition}
                    setMasterTransposition={setMasterTransposition}
                    subjectNotes={subjectNotes} 
                />
            )}
        </div>
    );
}
