
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { StrettoSearchOptions, StrettoConstraintMode, RawNote } from '../../types';
import { getStrictPitchName } from '../services/midiSpelling';
import { getVoiceLabel } from '../services/midiVoices';
import ConstraintSelector from './ConstraintSelector';
import {
    computeSearchProgressDisplay,
    nextSearchProgressAccumulator,
    SearchProgressAccumulator
} from './searchProgressModel';
import { metricHelpText } from './telemetryGlossary';
import { resolvePivotSelectOptions } from './pivotSelection';

interface StrettoSearchPanelProps {
    options: StrettoSearchOptions;
    setOptions: (opt: StrettoSearchOptions) => void;
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
            dagExploredWorkItems: number;
            dagLiveFrontierWorkItems: number;
            dagHeuristicCompletionRatio?: number;
        };
        heartbeat: boolean;
    } | null;
    voiceNames?: Record<number, string>;
    setVoiceNames?: (names: Record<number, string>) => void;
    subjectNotes: RawNote[];
    ppq: number;
}

const SCALE_MODES = ['Major', 'Natural Minor', 'Harmonic Minor', 'Melodic Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian'];

export default function StrettoSearchPanel({ 
    options, setOptions, onSearch, isSearching, searchProgress,
    voiceNames, setVoiceNames, subjectNotes, ppq 
}: StrettoSearchPanelProps) {
    const MetricHelp = ({ metricKey }: { metricKey: Parameters<typeof metricHelpText>[0] }) => (
        <span className="ml-1 cursor-help text-[9px] text-cyan-300/80" title={metricHelpText(metricKey)} aria-label={metricHelpText(metricKey)}>
            ⓘ
        </span>
    );
    
    const [showVoiceConfig, setShowVoiceConfig] = useState(false);
    const progressAccumulatorRef = useRef<SearchProgressAccumulator | null>(null);
    const progressDisplay = useMemo(() => {
        if (!searchProgress) {
            progressAccumulatorRef.current = null;
        } else {
            progressAccumulatorRef.current = nextSearchProgressAccumulator(searchProgress, progressAccumulatorRef.current);
        }
        return computeSearchProgressDisplay(searchProgress ?? null, progressAccumulatorRef.current);
    }, [searchProgress]);

    const handleChange = (field: keyof StrettoSearchOptions, val: any) => {
        setOptions({ ...options, [field]: val });
    };

    const handleVoiceNameChange = (idx: number, name: string) => {
        if (setVoiceNames && voiceNames) {
            setVoiceNames({ ...voiceNames, [idx]: name });
        }
    };

    const handleConstraintChange = (field: keyof StrettoSearchOptions, value: StrettoConstraintMode) => {
        setOptions({ ...options, [field]: value });
    };
    const handleCanonDelayBoundChange = (field: 'canonDelayMinBeats' | 'canonDelayMaxBeats', value: number) => {
        const safeValue = Number.isFinite(value) ? Math.max(0.5, value) : 0.5;
        const next = { ...options, [field]: safeValue };
        const minBeats = field === 'canonDelayMinBeats' ? safeValue : (next.canonDelayMinBeats ?? 1);
        const maxBeats = field === 'canonDelayMaxBeats' ? safeValue : (next.canonDelayMaxBeats ?? 4);
        if (minBeats > maxBeats) {
            if (field === 'canonDelayMinBeats') {
                next.canonDelayMaxBeats = safeValue;
            } else {
                next.canonDelayMinBeats = safeValue;
            }
        }
        setOptions(next);
    };

    const availableAbove = options.subjectVoiceIndex;
    const availableBelow = (options.ensembleTotal - 1) - options.subjectVoiceIndex;
    const pivotSelectOptions = useMemo(
        () => resolvePivotSelectOptions(options.pivotMidi, subjectNotes),
        [options.pivotMidi, subjectNotes]
    );

    // Local string state for inline canon delay inputs (avoid snap-back on clear)
    const [canonMinStr, setCanonMinStr] = useState(String(options.canonDelayMinBeats ?? 1));
    const [canonMaxStr, setCanonMaxStr] = useState(String(options.canonDelayMaxBeats ?? 4));
    useEffect(() => { setCanonMinStr(String(options.canonDelayMinBeats ?? 1)); }, [options.canonDelayMinBeats]);
    useEffect(() => { setCanonMaxStr(String(options.canonDelayMaxBeats ?? 4)); }, [options.canonDelayMaxBeats]);

    // Local string state for strettoMinDelayBeats input
    const [minDelayStr, setMinDelayStr] = useState(
        options.strettoMinDelayBeats != null ? String(options.strettoMinDelayBeats) : ''
    );
    useEffect(() => {
        setMinDelayStr(options.strettoMinDelayBeats != null ? String(options.strettoMinDelayBeats) : '');
    }, [options.strettoMinDelayBeats]);

    const commitCanonMin = () => {
        handleCanonDelayBoundChange('canonDelayMinBeats', parseFloat(canonMinStr));
    };
    const commitCanonMax = () => {
        handleCanonDelayBoundChange('canonDelayMaxBeats', parseFloat(canonMaxStr));
    };
    const commitMinDelay = () => {
        const v = parseFloat(minDelayStr);
        handleChange('strettoMinDelayBeats', Number.isFinite(v) && v > 0 ? v : undefined);
    };

    // Truncation Visualization Logic
    const truncationVisual = useMemo(() => {
        if (subjectNotes.length === 0) return null;
        
        const effectivePpq = ppq || 480;
        const sorted = [...subjectNotes].sort((a,b) => a.ticks - b.ticks);
        const startTick = sorted[0].ticks;
        const totalDuration = Math.max(...sorted.map(n => n.ticks + n.durationTicks)) - startTick;
        
        const targetTicks = Math.round(options.truncationTargetBeats * effectivePpq);
        const minMidi = Math.min(...sorted.map(n => n.midi));
        const maxMidi = Math.max(...sorted.map(n => n.midi));
        const range = maxMidi - minMidi + 12; // Buffer
        
        return (
            <div className="w-full h-16 bg-gray-900 border border-gray-700 rounded mt-2 relative overflow-hidden select-none">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${totalDuration} ${range}`}>
                    {/* Background Grid (Quarter notes) */}
                    {Array.from({ length: Math.ceil(totalDuration / effectivePpq) }).map((_, i) => (
                        <line 
                            key={i} 
                            x1={i * effectivePpq} y1={0} 
                            x2={i * effectivePpq} y2={range} 
                            stroke="#333" 
                            strokeWidth={i % 4 === 0 ? 2 : 1}
                            vectorEffect="non-scaling-stroke" 
                        />
                    ))}

                    {/* Notes */}
                    {sorted.map((n, i) => {
                        const relStart = n.ticks - startTick;
                        const relEnd = relStart + n.durationTicks;
                        
                        // Check if note is cut
                        let isKept = true;
                        let opacity = 1.0;
                        let fill = "#14b8a6"; // brand-primary

                        if (relStart >= targetTicks) {
                            isKept = false;
                            opacity = 0.3;
                            fill = "#4b5563"; // gray-600
                        } else if (relEnd > targetTicks) {
                            // Split note visualization?
                            fill = "#f59e0b"; // amber for clipped
                        }

                        // Invert Y for SVG
                        const y = range - (n.midi - minMidi) - 6;

                        return (
                            <rect 
                                key={i}
                                x={relStart}
                                y={y}
                                width={n.durationTicks}
                                height={4} // Note height
                                fill={fill}
                                opacity={opacity}
                                rx={2}
                            />
                        );
                    })}

                    {/* Cut Line */}
                    <line 
                        x1={targetTicks} y1={0} 
                        x2={targetTicks} y2={range} 
                        stroke="#ef4444" 
                        strokeWidth={2} 
                        strokeDasharray="4,4"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
                <div className="absolute top-1 right-1 text-[9px] bg-black/50 px-1 rounded text-gray-400">
                    {options.truncationTargetBeats}Q / {(totalDuration/ppq).toFixed(1)}Q total
                </div>
            </div>
        );
    }, [subjectNotes, options.truncationTargetBeats, ppq]);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded p-4 mb-6 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Algorithmic Chain Finder</h3>
                {isSearching && <span className="text-xs text-brand-primary animate-pulse">Searching...</span>}
            </div>

            {/* Ensemble & Voice Naming Configuration */}
            <div className="mb-6 bg-black/20 p-2 rounded border border-gray-700">
                <button 
                    onClick={() => setShowVoiceConfig(!showVoiceConfig)}
                    className="w-full flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2"
                >
                    <span>Voice Configuration (SATB)</span>
                    <span>{showVoiceConfig ? '▲' : '▼'}</span>
                </button>
                
                {showVoiceConfig && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 px-2 pb-2 animate-fade-in">
                        {Array.from({ length: options.ensembleTotal }).map((_, idx) => {
                            const defaultLabel = getVoiceLabel(idx, options.ensembleTotal);
                            return (
                                <div key={idx} className="flex flex-col gap-1">
                                    <label className="text-[9px] text-gray-400 font-bold uppercase">
                                        Voice {idx + 1} {idx === options.subjectVoiceIndex ? "(Subject)" : ""}
                                    </label>
                                    <input 
                                        type="text"
                                        placeholder={defaultLabel}
                                        value={voiceNames?.[idx] || ''}
                                        onChange={(e) => handleVoiceNameChange(idx, e.target.value)}
                                        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-brand-primary outline-none"
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 mb-4">
                
                {/* 1. Ensemble Configuration (Col 3) */}
                <div className="lg:col-span-3 bg-gray-900 p-2 rounded border border-gray-700 flex flex-col gap-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase">Search Setup</label>
                    
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="block text-[9px] text-gray-500 mb-1">Total Voices</label>
                            <select 
                                value={options.ensembleTotal}
                                onChange={(e) => {
                                    const total = parseInt(e.target.value);
                                    const newSubj = Math.min(options.subjectVoiceIndex, total - 1);
                                    setOptions({ ...options, ensembleTotal: total, subjectVoiceIndex: newSubj });
                                }}
                                className="w-full bg-gray-800 border border-gray-600 rounded text-xs text-white px-1 py-1"
                            >
                                {Array.from({length: 7}, (_, i) => i + 2).map(num => (
                                    <option key={num} value={num}>{num} Voices</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-[9px] text-gray-500 mb-1">Subject Voice</label>
                            <select 
                                value={options.subjectVoiceIndex}
                                onChange={(e) => handleChange('subjectVoiceIndex', parseInt(e.target.value))}
                                className="w-full bg-gray-800 border border-gray-600 rounded text-xs text-white px-1 py-1"
                            >
                                {Array.from({length: options.ensembleTotal}, (_, i) => i).map(idx => {
                                    const label = voiceNames?.[idx] || getVoiceLabel(idx, options.ensembleTotal);
                                    return <option key={idx} value={idx}>{label}</option>;
                                })}
                            </select>
                        </div>
                    </div>
                    
                    <div className="flex-1 mt-1">
                        <label className="block text-[9px] text-gray-500 mb-1">Chain Length (Entries)</label>
                        <select 
                            value={options.targetChainLength}
                            onChange={(e) => handleChange('targetChainLength', parseInt(e.target.value))}
                            className="w-full bg-gray-800 border border-brand-primary/50 rounded text-xs text-white px-1 py-1"
                        >
                            {Array.from({length: 12}, (_, i) => i + 2).map(num => (
                                <option key={num} value={num}>{num} Entries</option>
                            ))}
                        </select>
                    </div>
                    <div className="mt-1 rounded border border-gray-700 bg-black/20 p-2">
                        <label className="block text-[9px] text-gray-500 mb-1">Delay Category</label>
                        <select
                            value={options.delaySearchCategory ?? 'stretto'}
                            onChange={(e) => handleChange('delaySearchCategory', e.target.value as 'stretto' | 'canon')}
                            className="w-full bg-gray-800 border border-gray-600 rounded text-xs text-white px-1 py-1"
                        >
                            <option value="stretto">Standard Stretto Rules</option>
                            <option value="canon">Canon Search (Equal Delays)</option>
                        </select>
                        {(options.delaySearchCategory ?? 'stretto') === 'canon' && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <label className="text-[9px] text-gray-500 flex flex-col gap-1">
                                    Min Delay (Q)
                                    <input
                                        type="number"
                                        min="0.5"
                                        step="0.5"
                                        value={canonMinStr}
                                        onChange={(e) => setCanonMinStr(e.target.value)}
                                        onBlur={commitCanonMin}
                                        className="bg-gray-900 border border-gray-600 text-xs rounded px-1 py-1 text-white text-center"
                                    />
                                </label>
                                <label className="text-[9px] text-gray-500 flex flex-col gap-1">
                                    Max Delay (Q)
                                    <input
                                        type="number"
                                        min="0.5"
                                        step="0.5"
                                        value={canonMaxStr}
                                        onChange={(e) => setCanonMaxStr(e.target.value)}
                                        onBlur={commitCanonMax}
                                        className="bg-gray-900 border border-gray-600 text-xs rounded px-1 py-1 text-white text-center"
                                    />
                                </label>
                            </div>
                        )}
                    </div>

                    <div className="text-[10px] text-gray-400 flex justify-between bg-black/20 p-1 rounded mt-1">
                        <span>↑ {availableAbove} Above</span>
                        <span className="font-bold text-brand-primary">S</span>
                        <span>↓ {availableBelow} Below</span>
                    </div>
                </div>

                {/* 1b. Min Entry Delay */}
                {(options.delaySearchCategory ?? 'stretto') === 'stretto' && (
                    <div className="lg:col-span-4 flex items-center gap-3">
                        <label className="text-[9px] text-gray-500 whitespace-nowrap">Min Entry Delay (beats)</label>
                        <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            placeholder="rule default"
                            value={minDelayStr}
                            onChange={(e) => setMinDelayStr(e.target.value)}
                            onBlur={commitMinDelay}
                            className="w-24 bg-gray-900 border border-gray-600 text-xs rounded px-1 py-1 text-white text-center"
                        />
                        <span className="text-[9px] text-gray-600 italic">floor on every d_i; leave blank for rule default</span>
                    </div>
                )}

                {/* 2. Truncation (Col 4) */}
                <div className="lg:col-span-4 flex flex-col gap-2">
                    <ConstraintSelector
                        label="Truncated Entries"
                        field="truncationMode"
                        value={options.truncationMode}
                        onChange={handleConstraintChange}
                    />
                    <div className={`flex flex-col gap-2 px-1 transition-opacity ${options.truncationMode === 'None' ? 'opacity-30 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] text-gray-500 block">Cut Length (Q)</label>
                            <input
                                type="number"
                                min="0.5" step="0.5"
                                value={isNaN(options.truncationTargetBeats) ? '' : options.truncationTargetBeats}
                                onChange={(e) => handleChange('truncationTargetBeats', parseFloat(e.target.value))}
                                className="w-16 bg-gray-900 border border-gray-600 text-xs rounded px-1 py-1 text-white text-center"
                            />
                        </div>
                        {truncationVisual}
                    </div>
                    <label className="flex items-center gap-2 mt-1 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={options.useAutoTruncation ?? false}
                            onChange={(e) => handleChange('useAutoTruncation', e.target.checked)}
                            className="h-3 w-3 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-0"
                        />
                        <span className="text-[10px] text-gray-300">Auto-truncate oldest voice when all voices exhausted</span>
                        <span className="text-[9px] text-gray-600 italic">(enables chains requiring voice re-entry beyond capacity)</span>
                    </label>
                </div>

                {/* 3. Inversion (Col 2) */}
                <div className="lg:col-span-2 flex flex-col gap-2">
                    <ConstraintSelector
                        label="Inverted Entries"
                        field="inversionMode"
                        value={options.inversionMode}
                        onChange={handleConstraintChange}
                    />
                    <div className={`flex flex-col gap-1 px-1 transition-opacity ${options.inversionMode === 'None' ? 'opacity-30 pointer-events-none' : ''}`}>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={options.useChromaticInversion}
                                onChange={(e) => handleChange('useChromaticInversion', e.target.checked)}
                                className="h-3 w-3 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-0"
                            />
                            <span className="text-[10px] text-gray-300 font-bold">Chromatic Inversion</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 whitespace-nowrap">Inv. Scale:</span>
                            <select 
                                value={options.scaleRoot}
                                onChange={(e) => handleChange('scaleRoot', parseInt(e.target.value))}
                                disabled={options.useChromaticInversion}
                                className={`bg-gray-900 border border-gray-600 text-[10px] rounded px-1 py-0.5 text-gray-300 w-12 ${options.useChromaticInversion ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'].map((k, i) => (
                                    <option key={k} value={i}>{k}</option>
                                ))}
                            </select>
                            <select 
                                value={options.scaleMode}
                                onChange={(e) => handleChange('scaleMode', e.target.value)}
                                disabled={options.useChromaticInversion}
                                className={`bg-gray-900 border border-gray-600 text-[10px] rounded px-1 py-0.5 text-gray-300 flex-grow ${options.useChromaticInversion ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {SCALE_MODES.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-500 whitespace-nowrap">Pivot:</span>
                            <select
                                value={String(options.pivotMidi)}
                                onChange={(e) => handleChange('pivotMidi', parseInt(e.target.value))}
                                className="bg-gray-900 border border-gray-600 text-[10px] rounded px-1 py-0.5 text-gray-300 flex-grow"
                            >
                                {pivotSelectOptions.map((midi) => {
                                    return <option key={midi} value={String(midi)}>{getStrictPitchName(midi)}</option>
                                })}
                            </select>
                        </div>
                    </div>
                </div>

                {/* 4. Intervals (Col 3) */}
                <div className="lg:col-span-3 bg-gray-900 p-2 rounded border border-gray-700 flex flex-col gap-2">
                    <ConstraintSelector
                        label="3rds & 6ths (from Subj)"
                        field="thirdSixthMode"
                        value={options.thirdSixthMode}
                        onChange={handleConstraintChange}
                    />
                    
                    <div className="flex flex-col gap-2 mt-1">
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={options.requireConsonantEnd} 
                                onChange={(e) => handleChange('requireConsonantEnd', e.target.checked)} 
                                className="h-3 w-3 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-0"
                            />
                            <span className="ml-2 text-[10px] font-bold text-gray-300">Require Consonant End</span>
                        </label>
                        
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={options.disallowComplexExceptions} 
                                onChange={(e) => handleChange('disallowComplexExceptions', e.target.checked)} 
                                className="h-3 w-3 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-0"
                            />
                            <span className="ml-2 text-[10px] font-bold text-gray-300" title="Prevents combining Inversion/Truncation with 3rd/6th intervals">Disallow Complex Exceptions</span>
                        </label>
                        
                        <div className="pt-2 border-t border-gray-700">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] font-bold text-gray-400">Max Pair Dissonance %</label>
                                <span className="text-[9px] bg-red-900/50 text-white px-1 rounded">{Math.round(options.maxPairwiseDissonance * 100)}%</span>
                            </div>
                            <input 
                                type="range" min="0" max="1" step="0.05"
                                value={options.maxPairwiseDissonance}
                                onChange={(e) => handleChange('maxPairwiseDissonance', parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                            />
                            <p className="mt-1 text-[9px] text-gray-400 leading-tight">
                                Hard pairwise policy: dissonance ratio ≤ cap, maximum consecutive dissonance run length ≤ 2 events (or 3 when enabled and at least one run dissonance is P4), and continuous dissonance duration ≤ 1 beat.
                            </p>
                            <label className="mt-2 flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={options.allowP4RunLengthExtension ?? false}
                                    onChange={(e) => handleChange('allowP4RunLengthExtension', e.target.checked)}
                                    className="h-3 w-3 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-0"
                                />
                                <span className="ml-2 text-[9px] font-bold text-gray-300">Allow +1 run event when run includes a P4 dissonance</span>
                            </label>
                        </div>


                        <div className="pt-2 border-t border-gray-700">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] font-bold text-gray-400">Search Time Limit</label>
                                <span className="text-[9px] bg-blue-900/50 text-white px-1 rounded">{Math.round((options.maxSearchTimeMs ?? 30000) / 1000)}s</span>
                            </div>
                            <input
                                type="range" min="10" max="180" step="1"
                                value={Math.round((options.maxSearchTimeMs ?? 30000) / 1000)}
                                onChange={(e) => handleChange('maxSearchTimeMs', parseInt(e.target.value, 10) * 1000)}
                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <p className="mt-1 text-[9px] text-gray-400 leading-tight">
                                Hard timeout for chain enumeration (10–180 seconds).
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <button 
                onClick={onSearch}
                disabled={isSearching}
                className="w-full py-2 bg-brand-primary hover:bg-brand-secondary text-white font-bold rounded shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wide"
            >
                {isSearching ? `Processing Combinations ${progressDisplay.stars}` : 'Run Search Algorithm v4.3'}
            </button>
            {isSearching && searchProgress && (
                <div className="mt-2 rounded border border-brand-primary/40 bg-black/30 px-3 py-2 text-[10px] text-gray-200">
                    <div className="flex justify-between items-center gap-2">
                        <span className="font-semibold text-brand-primary">
                            {progressDisplay.stageLabel}
                            {progressDisplay.isHeartbeat ? ' · liveness heartbeat' : ''}
                        </span>
                        <span className="font-mono">
                            {progressDisplay.phaseLabel} · {progressDisplay.overallEstimatePercent}% est · {(searchProgress.elapsedMs / 1000).toFixed(1)}s<MetricHelp metricKey="elapsedProgressMs" />
                        </span>
                    </div>
                    <div className="mt-1 text-[9px] text-gray-400 font-mono">
                        {searchProgress.stage === 'dag'
                            ? `Depth reached ${searchProgress.telemetry.maxDepthReached} / ${searchProgress.telemetry.targetChainLength} · search-space completion estimate ${progressDisplay.dagCompletionLowerBoundPercent ?? 0}% · edges/node ${(progressDisplay.dagEdgesPerExpandedNode ?? 0).toFixed(2)}`
                            : `Stage progress: ${progressDisplay.stageEstimatePercent}% · units ${progressDisplay.unitLabel}`}
                    </div>
                    <div className="mt-1 text-[9px] text-gray-400 font-mono">
                        Valid pairs {searchProgress.telemetry.validPairs.toLocaleString()}<MetricHelp metricKey="validPairs" /> · valid triplets {searchProgress.telemetry.validTriplets.toLocaleString()}<MetricHelp metricKey="validTriplets" /> · chains {searchProgress.telemetry.chainsFound.toLocaleString()}<MetricHelp metricKey="chainsFound" />
                    </div>
                    <div className="mt-1 text-[9px] text-gray-400 font-mono">
                        Pairwise ops {searchProgress.telemetry.pairwiseOperationsProcessed.toLocaleString()}<MetricHelp metricKey="pairwiseOperationsProcessed" /> · Triplet ops {searchProgress.telemetry.tripletOperationsProcessed.toLocaleString()}<MetricHelp metricKey="tripletOperationsProcessed" />
                    </div>
                    <div className="mt-1 text-[9px] text-gray-400 font-mono">
                        Max depth {searchProgress.telemetry.maxDepthReached}<MetricHelp metricKey="maxDepthReached" /> / target {searchProgress.telemetry.targetChainLength}<MetricHelp metricKey="targetChainLength" />
                    </div>
                    <div className="mt-1 text-[9px] text-gray-400 font-mono">
                        {progressDisplay.countersLabel}
                    </div>
                    <div className="mt-1 text-[9px] text-gray-400 font-mono">
                        {progressDisplay.throughputLabel} · {progressDisplay.etaLabel}
                    </div>
                    <div className="mt-1 text-[9px] text-gray-300 font-semibold">Depth reached</div>
                    <div className="mt-1 h-1.5 rounded bg-gray-700 overflow-hidden">
                        <div
                            className="h-full bg-brand-primary transition-all duration-200"
                            style={{ width: searchProgress.stage === 'dag'
                                ? `${Math.max(2, progressDisplay.depthAxisPercent)}%`
                                : `${Math.max(2, progressDisplay.stageEstimatePercent)}%`
                            }}
                        />
                    </div>
                    {searchProgress.stage === 'dag' && (
                        <>
                            <div className="mt-1 text-[9px] text-gray-300 font-semibold">Traversal completion heuristic</div>
                            <div className="mt-1 h-1.5 rounded bg-gray-700 overflow-hidden">
                                <div
                                    className="h-full bg-cyan-500 transition-all duration-200"
                                    style={{ width: `${Math.max(2, progressDisplay.dagCompletionLowerBoundPercent ?? progressDisplay.traversalCompletionPercent ?? 0)}%` }}
                                />
                            </div>
                            <div className="mt-1 text-[9px] text-gray-400 font-mono">
                                Frontier pressure {(progressDisplay.dagFrontierPressurePercent ?? 0).toFixed(1)}% · explored share {progressDisplay.traversalCompletionPercent ?? 0}%
                            </div>
                        </>
                    )}
                </div>
            )}
            
        </div>
    );
}
