
import React, { useMemo, useState } from 'react';
import { StrettoSearchOptions, StrettoConstraintMode, RawNote } from '../../types';
import { getStrictPitchName } from '../services/midiSpelling';
import { getVoiceLabel } from '../services/midiVoices';

interface StrettoSearchPanelProps {
    options: StrettoSearchOptions;
    setOptions: (opt: StrettoSearchOptions) => void;
    onSearch: () => void;
    isSearching: boolean;
    voiceNames?: Record<number, string>;
    setVoiceNames?: (names: Record<number, string>) => void;
    subjectNotes: RawNote[];
    ppq: number;
}

const SCALE_MODES = ['Major', 'Natural Minor', 'Harmonic Minor', 'Melodic Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian'];

export default function StrettoSearchPanel({ 
    options, setOptions, onSearch, isSearching, 
    voiceNames, setVoiceNames, subjectNotes, ppq 
}: StrettoSearchPanelProps) {
    
    const [showVoiceConfig, setShowVoiceConfig] = useState(false);

    const handleChange = (field: keyof StrettoSearchOptions, val: any) => {
        setOptions({ ...options, [field]: val });
    };

    const handleVoiceNameChange = (idx: number, name: string) => {
        if (setVoiceNames && voiceNames) {
            setVoiceNames({ ...voiceNames, [idx]: name });
        }
    };

    const renderConstraintSelector = (label: string, field: keyof StrettoSearchOptions, value: StrettoConstraintMode) => (
        <div className="bg-gray-900 p-2 rounded border border-gray-700">
            <label className="block text-[10px] font-bold text-gray-400 mb-2 uppercase">{label}</label>
            <div className="flex gap-1">
                {['None', 'Max 1', 'Unlimited'].map((mode) => (
                    <button
                        key={mode}
                        onClick={() => handleChange(field, mode as StrettoConstraintMode)}
                        className={`flex-1 py-1 text-[10px] rounded border transition-colors ${value === mode ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-500'}`}
                    >
                        {mode}
                    </button>
                ))}
            </div>
        </div>
    );

    const availableAbove = options.subjectVoiceIndex; 
    const availableBelow = (options.ensembleTotal - 1) - options.subjectVoiceIndex;

    // Truncation Visualization Logic
    const truncationVisual = useMemo(() => {
        if (subjectNotes.length === 0) return null;
        
        const sorted = [...subjectNotes].sort((a,b) => a.ticks - b.ticks);
        const startTick = sorted[0].ticks;
        const totalDuration = Math.max(...sorted.map(n => n.ticks + n.durationTicks)) - startTick;
        
        const targetTicks = Math.round(options.truncationTargetBeats * ppq);
        const minMidi = Math.min(...sorted.map(n => n.midi));
        const maxMidi = Math.max(...sorted.map(n => n.midi));
        const range = maxMidi - minMidi + 12; // Buffer
        
        return (
            <div className="w-full h-16 bg-gray-900 border border-gray-700 rounded mt-2 relative overflow-hidden select-none">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${totalDuration} ${range}`}>
                    {/* Background Grid (Beats) */}
                    {Array.from({ length: Math.ceil(totalDuration / ppq) }).map((_, i) => (
                        <line 
                            key={i} 
                            x1={i * ppq} y1={0} 
                            x2={i * ppq} y2={range} 
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
                    {options.truncationTargetBeats} Beats / {(totalDuration/ppq).toFixed(1)} Total
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

                    <div className="flex-1 mt-1">
                        <label className="block text-[9px] text-gray-500 mb-1">Delay Spacing</label>
                        <select
                            value={options.delaySpacingBeats}
                            onChange={(e) => handleChange('delaySpacingBeats', parseFloat(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-600 rounded text-xs text-white px-1 py-1"
                        >
                            <option value={0.5}>Half beat (eighth note)</option>
                            <option value={1}>1 beat (quarter note)</option>
                            <option value={0.25}>Quarter beat (sixteenth note)</option>
                        </select>
                    </div>

                    <div className="text-[10px] text-gray-400 flex justify-between bg-black/20 p-1 rounded mt-1">
                        <span>↑ {availableAbove} Above</span>
                        <span className="font-bold text-brand-primary">S</span>
                        <span>↓ {availableBelow} Below</span>
                    </div>
                </div>

                {/* 2. Truncation (Col 4) */}
                <div className="lg:col-span-4 flex flex-col gap-2">
                    {renderConstraintSelector("Truncated Entries", "truncationMode", options.truncationMode)}
                    <div className={`flex flex-col gap-2 px-1 transition-opacity ${options.truncationMode === 'None' ? 'opacity-30 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] text-gray-500 block">Cut Length (Beats)</label>
                            <input 
                                type="number" 
                                min="0.5" step="0.5"
                                value={options.truncationTargetBeats}
                                onChange={(e) => handleChange('truncationTargetBeats', parseFloat(e.target.value))}
                                className="w-16 bg-gray-900 border border-gray-600 text-xs rounded px-1 py-1 text-white text-center"
                            />
                        </div>
                        {truncationVisual}
                    </div>
                </div>

                {/* 3. Inversion (Col 2) */}
                <div className="lg:col-span-2 flex flex-col gap-2">
                    {renderConstraintSelector("Inverted Entries", "inversionMode", options.inversionMode)}
                    <div className={`flex flex-col gap-1 px-1 transition-opacity ${options.inversionMode === 'None' ? 'opacity-30 pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 whitespace-nowrap">Scale:</span>
                            <select 
                                value={options.scaleRoot}
                                onChange={(e) => handleChange('scaleRoot', parseInt(e.target.value))}
                                className="bg-gray-900 border border-gray-600 text-[10px] rounded px-1 py-0.5 text-gray-300 w-12"
                            >
                                {['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'].map((k, i) => (
                                    <option key={k} value={i}>{k}</option>
                                ))}
                            </select>
                            <select 
                                value={options.scaleMode}
                                onChange={(e) => handleChange('scaleMode', e.target.value)}
                                className="bg-gray-900 border border-gray-600 text-[10px] rounded px-1 py-0.5 text-gray-300 flex-grow"
                            >
                                {SCALE_MODES.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-500 whitespace-nowrap">Pivot:</span>
                            <select 
                                value={options.pivotMidi}
                                onChange={(e) => handleChange('pivotMidi', parseInt(e.target.value))}
                                className="bg-gray-900 border border-gray-600 text-[10px] rounded px-1 py-0.5 text-gray-300 flex-grow"
                            >
                                {Array.from({length: 12}).map((_, i) => {
                                    const midi = 60 + i; 
                                    return <option key={midi} value={midi}>{getStrictPitchName(midi)}</option>
                                })}
                            </select>
                        </div>
                    </div>
                </div>

                {/* 4. Intervals (Col 3) */}
                <div className="lg:col-span-3 bg-gray-900 p-2 rounded border border-gray-700 flex flex-col gap-2">
                    {renderConstraintSelector("3rds & 6ths (from Subj)", "thirdSixthMode", options.thirdSixthMode)}
                    
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
                        </div>
                    </div>
                </div>
            </div>

            <button 
                onClick={onSearch}
                disabled={isSearching}
                className="w-full py-2 bg-brand-primary hover:bg-brand-secondary text-white font-bold rounded shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wide"
            >
                {isSearching ? 'Processing Combinations...' : 'Run Search Algorithm v4.3'}
            </button>
        </div>
    );
}
