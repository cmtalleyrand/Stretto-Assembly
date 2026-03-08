import React, { useMemo } from 'react';
import { AnalysisSection, HybridVoiceRole, TrackInfo, VoiceAssignmentMode, ArpeggioStrategy } from '../types';
import { MUSICAL_TIME_OPTIONS } from '../constants';
import { Midi } from '@tonejs/midi';
import { getStrictPitchName } from './services/midiSpelling';

interface AnalysisSettingsProps {
    sections: AnalysisSection[];
    setSections: (sections: AnalysisSection[]) => void;
    contextText: string;
    setContextText: (text: string) => void;
    
    // Voice Naming
    voiceNames: Record<number, string>;
    setVoiceNames: (names: Record<number, string>) => void;
    voiceCountEstimate: number; 
    
    // New Props for stats
    midiData: Midi | null;
    trackInfo: TrackInfo[];
    selectedTracks: Set<number>;
    voiceAssignmentMode: VoiceAssignmentMode;
}

const MUSICAL_OPTIONS_SELECT = MUSICAL_TIME_OPTIONS.filter(o => o.value > 0);

export default function AnalysisSettings({ 
    sections, setSections, contextText, setContextText, 
    voiceNames, setVoiceNames, voiceCountEstimate,
    midiData, trackInfo, selectedTracks, voiceAssignmentMode
}: AnalysisSettingsProps) {
    
    // Determine effective number of voices
    const displayVoiceCount = voiceAssignmentMode === 'manual' 
        ? selectedTracks.size 
        : Math.max(voiceCountEstimate || 4, 4);

    const sortedSelectedTracks = useMemo(() => Array.from(selectedTracks).sort((a,b) => a - b), [selectedTracks]);

    const handleVoiceNameChange = (idx: number, name: string) => {
        setVoiceNames({ ...voiceNames, [idx]: name });
    };

    const addSection = () => {
        const lastSection = sections[sections.length - 1];
        const newStart = lastSection ? lastSection.endMeasure + 1 : 1;
        const newSection: AnalysisSection = {
            id: Date.now().toString(),
            name: `Section ${String.fromCharCode(65 + sections.length)}`,
            startMeasure: newStart,
            endMeasure: newStart + 4,
            harmonyMode: 'sustain',
            pitchStatsMode: 'frequency',
            chordTolerance: '1/32', 
            chordMinDuration: 'off',
            arpeggioWindowVal: '1/2',
            ignorePassingMotion: false,
            hybridConfig: {
                voiceRoles: {},
                arpStrategy: 'note_based',
                arpHistoryCount: 4,
                arpHistoryTime: '1/2'
            },
            debugLogging: false
        };
        setSections([...sections, newSection]);
    };

    const updateSection = (id: string, field: keyof AnalysisSection, value: any) => {
        setSections(sections.map(s => s.id === id ? { ...s, [field]: value } : s));
    };
    
    const updateHybridConfig = (id: string, field: string, value: any) => {
        setSections(sections.map(s => {
            if (s.id !== id) return s;
            const current = s.hybridConfig || { voiceRoles: {}, arpStrategy: 'note_based', arpHistoryCount: 4, arpHistoryTime: '1/2' };
            return {
                ...s,
                hybridConfig: { ...current, [field]: value }
            };
        }));
    };

    const updateHybridRole = (sectionId: string, voiceIdx: number, role: HybridVoiceRole) => {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;
        const currentRoles = section.hybridConfig?.voiceRoles || {};
        updateHybridConfig(sectionId, 'voiceRoles', { ...currentRoles, [voiceIdx]: role });
    }

    const removeSection = (id: string) => {
        setSections(sections.filter(s => s.id !== id));
    };

    // Helper to calculate stats on the fly for the UI
    const getTrackStatsForSection = (trackId: number, startMeas: number, endMeas: number) => {
        if (!midiData) return null;
        const track = midiData.tracks[trackId];
        if (!track) return null;

        const ppq = midiData.header.ppq;
        const tsNum = midiData.header.timeSignatures[0]?.timeSignature[0] || 4;
        const tsDenom = midiData.header.timeSignatures[0]?.timeSignature[1] || 4;
        const ticksPerMeasure = ppq * tsNum * (4 / tsDenom);
        const startTick = (startMeas - 1) * ticksPerMeasure;
        const endTick = endMeas * ticksPerMeasure;

        const targetNotes = track.notes.filter(n => n.ticks >= startTick && n.ticks < endTick);

        if (targetNotes.length === 0) return { count: 0, range: 'Silent' };

        const min = Math.min(...targetNotes.map(n => n.midi));
        const max = Math.max(...targetNotes.map(n => n.midi));
        
        return {
            count: targetNotes.length,
            range: `${getStrictPitchName(min)}-${getStrictPitchName(max)}`
        };
    };

    return (
        <div className="w-full bg-gray-dark p-6 rounded-2xl shadow-2xl border border-gray-medium mt-6 animate-slide-up">
            
            {/* Global Voice Naming */}
            <div className="border-b border-gray-medium pb-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-light">Voice Configuration</h2>
                    {voiceAssignmentMode === 'auto' && (
                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded border border-gray-600">Auto-Detected ({displayVoiceCount} Voices)</span>
                    )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: displayVoiceCount }).map((_, idx) => {
                        let trackLabel = "";
                        if (voiceAssignmentMode === 'manual') {
                            const trackId = sortedSelectedTracks[idx];
                            const t = trackInfo.find(t => t.id === trackId);
                            trackLabel = t ? `${t.name}` : `Track ID ${trackId}`;
                        }

                        return (
                            <div key={idx} className="bg-gray-800 p-3 rounded border border-gray-700">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-[10px] text-gray-400 uppercase font-bold">Voice {idx + 1}</label>
                                    {trackLabel && <span className="text-[10px] text-brand-primary truncate max-w-[100px] block" title={trackLabel}>{trackLabel}</span>}
                                </div>
                                <input 
                                    type="text"
                                    placeholder={`e.g. ${idx === 0 ? 'Soprano' : idx === displayVoiceCount-1 ? 'Bass' : 'Alto'}`}
                                    value={voiceNames[idx] || ''}
                                    onChange={(e) => handleVoiceNameChange(idx, e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded text-xs text-gray-200 px-2 py-1 focus:ring-1 focus:ring-brand-primary"
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="border-b border-gray-medium pb-4 mb-4 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-light">Analysis Sections</h2>
                <button onClick={addSection} className="text-xs bg-brand-primary hover:bg-brand-secondary text-white px-3 py-1 rounded font-bold transition-colors">
                    + Add Section
                </button>
            </div>

            <div className="space-y-4 mb-6">
                {sections.map((section, idx) => (
                    <div key={section.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 relative group">
                        {sections.length > 1 && (
                            <button 
                                onClick={() => removeSection(section.id)}
                                className="absolute top-2 right-2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove Section"
                            >
                                ✕
                            </button>
                        )}
                        
                        <div className="flex flex-col gap-4">
                            {/* Stats Header - Now Always Visible if tracks selected */}
                            {sortedSelectedTracks.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 bg-black/20 p-2 rounded">
                                    {sortedSelectedTracks.map((trackId) => {
                                        const t = trackInfo.find(tr => tr.id === trackId);
                                        const stats = getTrackStatsForSection(trackId, section.startMeasure, section.endMeasure);
                                        return (
                                            <div key={trackId} className="text-[10px] text-gray-300 flex flex-col">
                                                <span className="font-bold text-gray-500 truncate" title={t?.name}>{t?.name || `Trk ${trackId}`}</span>
                                                <span>{stats ? `${stats.count} n (${stats.range})` : '...'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Row 1: Basic Config */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                                <div className="md:col-span-3">
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Label</label>
                                    <input 
                                        type="text" 
                                        value={section.name} 
                                        onChange={(e) => updateSection(section.id, 'name', e.target.value)}
                                        className="block w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-sm text-gray-light font-bold"
                                    />
                                </div>
                                
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Range (Meas)</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" min="1" 
                                            value={section.startMeasure} 
                                            onChange={(e) => updateSection(section.id, 'startMeasure', parseInt(e.target.value))}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-sm text-center text-gray-light"
                                        />
                                        <span className="text-gray-500">-</span>
                                        <input 
                                            type="number" min={section.startMeasure} 
                                            value={section.endMeasure} 
                                            onChange={(e) => updateSection(section.id, 'endMeasure', parseInt(e.target.value))}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-sm text-center text-gray-light"
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-3">
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Harmony Logic</label>
                                    <select 
                                        value={section.harmonyMode} 
                                        onChange={(e) => updateSection(section.id, 'harmonyMode', e.target.value)}
                                        className="block w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-sm text-gray-light"
                                    >
                                        <option value="attack">Attack (Block)</option>
                                        <option value="sustain">Sustain (Overlap)</option>
                                        <option value="hybrid">Hybrid (Legacy)</option>
                                        <option value="arpeggio_window">Arpeggio (Time Window)</option>
                                        <option value="hia_v2">HIA v2.2 (Optional Diagnostic)</option>
                                    </select>
                                </div>

                                <div className="md:col-span-4">
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Pitch Stats</label>
                                    <div className="flex bg-gray-900 rounded-md p-1 border border-gray-600">
                                        <button 
                                            onClick={() => updateSection(section.id, 'pitchStatsMode', 'modal')}
                                            className={`flex-1 text-xs py-1 rounded transition-colors ${section.pitchStatsMode === 'modal' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            Modal
                                        </button>
                                        <button 
                                            onClick={() => updateSection(section.id, 'pitchStatsMode', 'frequency')}
                                            className={`flex-1 text-xs py-1 rounded transition-colors ${section.pitchStatsMode === 'frequency' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            Frequency
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Granular Harmony Sliders (Conditional) */}
                            <div className="bg-gray-900/50 p-3 rounded border border-gray-700 flex flex-wrap gap-4 items-center">
                                {section.harmonyMode === 'hia_v2' ? (
                                    <div className="w-full flex items-center justify-between">
                                        <div className="text-xs text-brand-primary font-mono flex items-center gap-2">
                                            <span className="font-bold">Optional HIA Diagnostic Active:</span>
                                            <span className="text-gray-400">Advanced salience-weighted Viterbi trace mode</span>
                                        </div>
                                        <label className="flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={section.debugLogging || false} 
                                                onChange={(e) => updateSection(section.id, 'debugLogging', e.target.checked)} 
                                                className="h-4 w-4 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-brand-primary"
                                            />
                                            <span className="ml-2 text-xs font-bold text-gray-300">Detailed Report (Under the Hood)</span>
                                        </label>
                                    </div>
                                ) : (
                                    <>
                                        {section.harmonyMode === 'attack' && (
                                            <div>
                                                <label className="text-[10px] text-gray-400 uppercase font-bold block mb-1">Strum Tolerance</label>
                                                <select 
                                                    value={section.chordTolerance} 
                                                    onChange={(e) => updateSection(section.id, 'chordTolerance', e.target.value)}
                                                    className="bg-gray-800 border border-gray-600 text-xs rounded px-2 py-1 text-gray-light"
                                                >
                                                    {MUSICAL_OPTIONS_SELECT.map(o => (
                                                        <option key={o.value} value={o.label}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        {(section.harmonyMode === 'sustain' || section.harmonyMode === 'hybrid' || section.harmonyMode === 'arpeggio_window') && (
                                            <div>
                                                <label className="text-[10px] text-gray-400 uppercase font-bold block mb-1">Min Note Duration</label>
                                                <select 
                                                    value={section.chordMinDuration} 
                                                    onChange={(e) => updateSection(section.id, 'chordMinDuration', e.target.value)}
                                                    className="bg-gray-800 border border-gray-600 text-xs rounded px-2 py-1 text-gray-light"
                                                >
                                                    <option value="off">Off (0)</option>
                                                    {MUSICAL_OPTIONS_SELECT.map(o => (
                                                        <option key={o.value} value={o.label}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        {section.harmonyMode === 'arpeggio_window' && (
                                            <div>
                                                <label className="text-[10px] text-gray-400 uppercase font-bold block mb-1">Window Size</label>
                                                <select 
                                                    value={section.arpeggioWindowVal || '1/2'} 
                                                    onChange={(e) => updateSection(section.id, 'arpeggioWindowVal', e.target.value)}
                                                    className="bg-gray-800 border border-gray-600 text-xs rounded px-2 py-1 text-gray-light"
                                                >
                                                    {MUSICAL_OPTIONS_SELECT.map(o => (
                                                        <option key={o.value} value={o.label}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        
                                        <div className="flex items-center ml-auto">
                                            <label className="flex items-center cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={section.ignorePassingMotion} 
                                                    onChange={(e) => updateSection(section.id, 'ignorePassingMotion', e.target.checked)} 
                                                    className="h-4 w-4 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-brand-primary"
                                                />
                                                <span className="ml-2 text-xs font-bold text-gray-300">Ignore Passing Motion</span>
                                            </label>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Row 3: Hybrid Specific Configuration */}
                            {section.harmonyMode === 'hybrid' && (
                                <div className="bg-brand-primary/10 p-3 rounded border border-brand-primary/30 animate-fade-in">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-xs font-bold text-brand-primary uppercase">Hybrid Voice Roles</h4>
                                        <span className="text-[10px] text-gray-400 italic">Configure how each voice contributes to chords.</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                        {Array.from({ length: displayVoiceCount }).map((_, vIdx) => {
                                            const role = section.hybridConfig?.voiceRoles?.[vIdx] || 'sustain';
                                            return (
                                                <div key={vIdx}>
                                                    <span className="block text-[10px] text-gray-400 mb-1">{voiceNames[vIdx] || `Voice ${vIdx + 1}`}</span>
                                                    <select 
                                                        value={role}
                                                        onChange={(e) => updateHybridRole(section.id, vIdx, e.target.value as HybridVoiceRole)}
                                                        className="w-full bg-gray-900 border border-gray-600 text-[10px] rounded px-1 py-1"
                                                    >
                                                        <option value="sustain">Sustain</option>
                                                        <option value="attack">Attack</option>
                                                        <option value="arpeggio">Arpeggio</option>
                                                        <option value="ignore">Ignore</option>
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    
                                    <div className="flex flex-wrap items-end gap-4 border-t border-brand-primary/20 pt-2">
                                        <div className="flex flex-col">
                                            <label className="text-[10px] font-bold text-gray-400 mb-1">Arpeggio Mode</label>
                                            <select 
                                                value={section.hybridConfig?.arpStrategy || 'note_based'}
                                                onChange={(e) => updateHybridConfig(section.id, 'arpStrategy', e.target.value)}
                                                className="bg-gray-900 border border-gray-600 text-xs rounded px-2 py-1 text-gray-light"
                                            >
                                                <option value="note_based">Note Count</option>
                                                <option value="time_based">Time Window</option>
                                            </select>
                                        </div>

                                        {section.hybridConfig?.arpStrategy === 'note_based' ? (
                                            <div className="flex flex-col flex-grow max-w-[150px]">
                                                <div className="flex justify-between">
                                                    <label className="text-[10px] font-bold text-gray-400 mb-1">Lookback Count</label>
                                                    <span className="text-[10px] text-brand-primary font-mono">{section.hybridConfig?.arpHistoryCount || 4} notes</span>
                                                </div>
                                                <input 
                                                    type="range" min="1" max="12" step="1"
                                                    value={section.hybridConfig?.arpHistoryCount || 4}
                                                    onChange={(e) => updateHybridConfig(section.id, 'arpHistoryCount', parseInt(e.target.value))}
                                                    className="h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                <label className="text-[10px] font-bold text-gray-400 mb-1">Lookback Time</label>
                                                <select 
                                                    value={section.hybridConfig?.arpHistoryTime || '1/2'}
                                                    onChange={(e) => updateHybridConfig(section.id, 'arpHistoryTime', e.target.value)}
                                                    className="bg-gray-900 border border-gray-600 text-xs rounded px-2 py-1 text-gray-light"
                                                >
                                                    {MUSICAL_OPTIONS_SELECT.map(o => (
                                                        <option key={o.value} value={o.label}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        
                                        <span className="text-[10px] text-gray-500 italic mt-auto pb-1 max-w-[200px]">
                                            Defines history for arpeggiating voices when finding chords.
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
