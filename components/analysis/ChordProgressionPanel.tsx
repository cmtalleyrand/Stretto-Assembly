
import React, { useState, useEffect } from 'react';
import { ChordEvent, TrackAnalysisData, HybridVoiceRole } from '../../types';
import { detectChordsAttack, detectChordsSustain } from '../services/midiHarmony';
import { detectChordsArpeggio } from '../services/midiArpeggio';
import { MUSICAL_TIME_OPTIONS } from '../../constants';
import { getVoiceLabel } from '../services/midiVoices';

// Constants
const VOICE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];
const getTicksFromMusicalValue = (multiplier: number, ppq: number) => Math.round(ppq * multiplier);
const ChevronDownIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>);
const ChevronUpIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>);

interface ChordProgressionPanelProps {
    data: TrackAnalysisData;
    onRecalculationComplete: (mode: string, chords: ChordEvent[]) => void;
}

export default function ChordProgressionPanel({ data, onRecalculationComplete }: ChordProgressionPanelProps) {
    const [chordDetectionMode, setChordDetectionMode] = useState<'sustain' | 'attack' | 'hybrid' | 'arpeggio_window'>('attack');
    const [toleranceIndex, setToleranceIndex] = useState<number>(3);
    const [minNoteDurationIndex, setMinNoteDurationIndex] = useState<number>(0);
    const [arpeggioWindowVal, setArpeggioWindowVal] = useState<string>('1/2');
    const [voiceConfigs, setVoiceConfigs] = useState<Record<number, HybridVoiceRole>>({});
    const [arpeggioMode, setArpeggioMode] = useState<'count' | 'beat' | '2beat'>('count'); // Legacy hybrid prop, effectively arpStrategy note vs time
    const [arpeggioCount, setArpeggioCount] = useState<number>(2);
    
    // Virtualization / Display
    const [visibleChords, setVisibleChords] = useState<ChordEvent[]>(data.chordsAttack);
    const [showAllChords, setShowAllChords] = useState(false);
    const [expandedChordIndex, setExpandedChordIndex] = useState<number | null>(null);

    // Initial Voice Config
    useEffect(() => {
        const defaults: Record<number, HybridVoiceRole> = {};
        for(let i=0; i < data.voiceCount; i++) defaults[i] = 'sustain';
        setVoiceConfigs(defaults);
    }, [data.voiceCount]);

    // Recalculate Logic
    useEffect(() => {
        if (!data.notesRaw || data.notesRaw.length === 0) return;
        
        const toleranceTicks = getTicksFromMusicalValue(MUSICAL_TIME_OPTIONS[toleranceIndex].value, data.ppq);
        const minDurTicks = getTicksFromMusicalValue(MUSICAL_TIME_OPTIONS[minNoteDurationIndex].value, data.ppq);
        let newChords: ChordEvent[] = [];

        if (chordDetectionMode === 'attack') {
            newChords = detectChordsAttack(data.notesRaw, data.ppq, data.timeSignature.numerator, data.timeSignature.denominator, toleranceTicks, minDurTicks);
        } else if (chordDetectionMode === 'sustain') {
            newChords = detectChordsSustain(data.notesRaw, data.ppq, data.timeSignature.numerator, data.timeSignature.denominator, minDurTicks);
        } else if (chordDetectionMode === 'hybrid') {
            // Mapping UI state to Arpeggio Module args
            const strategy = arpeggioMode === 'count' ? 'note_based' : 'time_based';
            const historyParam = arpeggioMode === 'count' ? arpeggioCount : '1/2'; // Defaulting time for simplicity in panel
            newChords = detectChordsArpeggio(data.notesRaw, data.ppq, data.timeSignature.numerator, data.timeSignature.denominator, minDurTicks, voiceConfigs, strategy, historyParam);
        } else if (chordDetectionMode === 'arpeggio_window') {
            // Apply Arpeggio logic to ALL voices for this section
            const allArpRoles: Record<number, HybridVoiceRole> = {};
            for(let i=0; i<data.voiceCount; i++) allArpRoles[i] = 'arpeggio';
            newChords = detectChordsArpeggio(
                data.notesRaw, data.ppq, data.timeSignature.numerator, data.timeSignature.denominator, minDurTicks,
                allArpRoles, 'time_based', arpeggioWindowVal
            );
        }
        
        setVisibleChords(newChords);
        onRecalculationComplete(chordDetectionMode, newChords);
    }, [toleranceIndex, minNoteDurationIndex, chordDetectionMode, data.notesRaw, arpeggioWindowVal, voiceConfigs, arpeggioMode, arpeggioCount]);

    const CHORD_DISPLAY_LIMIT = 100;
    const chordsToDisplay = showAllChords ? visibleChords : visibleChords.slice(0, CHORD_DISPLAY_LIMIT);
    const remainingCount = visibleChords.length - chordsToDisplay.length;

    return (
        <div className="mt-8 border-t border-gray-700 pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                 <div>
                    <h3 className="text-xl font-bold text-brand-primary">Chord Progression</h3>
                    <p className="text-xs text-gray-400 mt-1">
                        Showing {chordsToDisplay.length} of {visibleChords.length} detected chords.
                        {!showAllChords && remainingCount > 0 && " (Truncated)"}
                    </p>
                 </div>
                 
                 <div className="flex flex-col gap-3 items-end w-full sm:w-auto">
                     <div className="flex flex-col gap-2 w-full">
                         {/* Controls Row */}
                         <div className="flex flex-wrap gap-4 items-center justify-end">
                            {chordDetectionMode === 'attack' && (
                                <div className="flex items-center gap-3 bg-gray-800 px-3 py-1 rounded-lg border border-gray-700">
                                    <span className="text-xs text-gray-400 whitespace-nowrap">Strum Tolerance:</span>
                                    <input type="range" min="0" max={MUSICAL_TIME_OPTIONS.length - 1} step="1" value={toleranceIndex} onChange={(e) => setToleranceIndex(Number(e.target.value))} className="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary" />
                                    <span className="text-xs font-mono text-gray-300 w-12 text-right">{MUSICAL_TIME_OPTIONS[toleranceIndex].label}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-3 bg-gray-800 px-3 py-1 rounded-lg border border-gray-700">
                                <span className="text-xs text-gray-400 whitespace-nowrap" title="Ignore notes shorter than this">Min Note Dur:</span>
                                <input type="range" min="0" max={MUSICAL_TIME_OPTIONS.length - 1} step="1" value={minNoteDurationIndex} onChange={(e) => setMinNoteDurationIndex(Number(e.target.value))} className="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary" />
                                <span className="text-xs font-mono text-gray-300 w-12 text-right">{MUSICAL_TIME_OPTIONS[minNoteDurationIndex].label}</span>
                            </div>
                         </div>
                         
                         {/* Mode Toggle */}
                         <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700 self-end flex-wrap gap-1 justify-end">
                            {['sustain', 'attack', 'arpeggio_window', 'hybrid'].map(mode => (
                                <button key={mode} onClick={() => setChordDetectionMode(mode as any)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chordDetectionMode === mode ? 'bg-brand-primary text-white shadow' : 'text-gray-400 hover:text-white'}`}>
                                    {mode === 'arpeggio_window' ? 'Arpeggio (Time)' : mode.charAt(0).toUpperCase() + mode.slice(1).replace('_',' ')}
                                </button>
                            ))}
                         </div>
                     </div>
                 </div>
            </div>

            {/* Arpeggio Time Config */}
            {chordDetectionMode === 'arpeggio_window' && (
                <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700 animate-fade-in">
                     <h4 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-1">Arpeggio Window Size</h4>
                    <div className="flex gap-4 items-center">
                        <select 
                            value={arpeggioWindowVal} 
                            onChange={(e) => setArpeggioWindowVal(e.target.value)}
                            className="bg-gray-900 border border-gray-600 text-sm rounded px-3 py-2 text-gray-light"
                        >
                            {MUSICAL_TIME_OPTIONS.filter(o => o.value > 0).map(o => (
                                <option key={o.value} value={o.label}>{o.label}</option>
                            ))}
                        </select>
                        <span className="text-xs text-gray-400">Duration to look back for notes from any voice.</span>
                    </div>
                </div>
            )}

            {/* Hybrid Config */}
            {chordDetectionMode === 'hybrid' && (
                <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700 animate-fade-in">
                    <h4 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-1">Hybrid Voice Configuration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                         {Array.from({ length: data.voiceCount }).map((_, i) => (
                             <div key={i} className="flex items-center gap-2 p-2 bg-gray-800 rounded border border-gray-700">
                                 <div className="w-3 h-3 rounded-full" style={{ backgroundColor: VOICE_COLORS[i % VOICE_COLORS.length] }}></div>
                                 <span className="text-xs font-bold text-gray-300 w-24 truncate">{getVoiceLabel(i, data.voiceCount)}</span>
                                 <select value={voiceConfigs[i] || 'sustain'} onChange={(e) => setVoiceConfigs(prev => ({...prev, [i]: e.target.value as HybridVoiceRole}))} className="bg-gray-900 border border-gray-600 text-xs text-gray-200 rounded py-1 px-2 focus:ring-brand-primary focus:border-brand-primary">
                                     <option value="sustain">Sustain</option><option value="attack">Attack</option><option value="arpeggio">Arpeggio</option><option value="ignore">Ignore</option>
                                 </select>
                             </div>
                         ))}
                    </div>
                    {arpeggioMode === 'count' && (
                         <div className="flex items-center gap-4 bg-gray-900 p-3 rounded border border-gray-700 max-w-md mt-2">
                            <input type="range" min="0" max="16" step="1" value={arpeggioCount} onChange={(e) => setArpeggioCount(Number(e.target.value))} className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary" />
                            <span className="text-xs font-mono text-brand-primary w-20 text-right">{arpeggioCount} Notes</span>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                        <tr><th className="px-6 py-3 w-4"></th><th className="px-6 py-3">Time</th><th className="px-6 py-3">Chord</th><th className="px-6 py-3">Notes</th></tr>
                    </thead>
                    <tbody>
                        {chordsToDisplay.length > 0 ? (
                            chordsToDisplay.map((chord, i) => (
                                <React.Fragment key={i}>
                                    <tr className={`border-b border-gray-700 hover:bg-gray-700/50 cursor-pointer ${expandedChordIndex === i ? 'bg-gray-700/30' : ''}`} onClick={() => setExpandedChordIndex(expandedChordIndex === i ? null : i)}>
                                        <td className="px-6 py-4 text-center">{chord.alternatives?.length > 0 && (expandedChordIndex === i ? <ChevronUpIcon /> : <ChevronDownIcon />)}</td>
                                        <td className="px-6 py-4 font-mono text-brand-primary">{chord.formattedTime}</td>
                                        <td className="px-6 py-4 font-bold text-white">{chord.name}</td>
                                        <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                                            <span className="text-gray-300">{chord.constituentNotes.join(', ')}</span>
                                            {chord.missingNotes.length > 0 && <span className="text-amber-500 ml-2">(Missing: {chord.missingNotes.join(', ')})</span>}
                                        </td>
                                    </tr>
                                    {expandedChordIndex === i && chord.alternatives?.length > 0 && (
                                        <tr className="bg-gray-800/80"><td colSpan={4} className="px-6 py-3"><div className="space-y-2 pl-4 border-l-2 border-brand-primary/50">{chord.alternatives.map((alt, altIdx) => (
                                            <div key={altIdx} className="flex items-center gap-4 text-xs"><span className="font-bold text-gray-300 w-32">{alt.name}</span><span className="text-gray-500">Score: {alt.score}</span></div>
                                        ))}</div></td></tr>
                                    )}
                                </React.Fragment>
                            ))
                        ) : ( <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">No chords detected with current settings.</td></tr> )}
                    </tbody>
                </table>
                {visibleChords.length > CHORD_DISPLAY_LIMIT && (
                    <div className="p-2 bg-gray-700/50 text-center border-t border-gray-700">
                        <button onClick={() => setShowAllChords(!showAllChords)} className="text-xs font-bold text-brand-primary hover:text-white transition-colors uppercase tracking-wider px-4 py-2">
                            {showAllChords ? "Show Less" : `Show All (${remainingCount} more)`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
