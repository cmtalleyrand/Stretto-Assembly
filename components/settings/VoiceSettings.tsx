
import React from 'react';
import { MUSICAL_TIME_OPTIONS } from '../../constants';
import { VoiceAssignmentMode } from '../../types';

interface VoiceSettingsProps {
    softOverlapToleranceIndex: number;
    setSoftOverlapToleranceIndex: (val: number) => void;
    pitchBias: number;
    setPitchBias: (val: number) => void;
    maxVoices: number;
    setMaxVoices: (val: number) => void;
    disableChords: boolean;
    setDisableChords: (val: boolean) => void;
    voiceAssignmentMode: VoiceAssignmentMode;
    setVoiceAssignmentMode: (val: VoiceAssignmentMode) => void;
}

export default function VoiceSettings({
    softOverlapToleranceIndex, setSoftOverlapToleranceIndex,
    pitchBias, setPitchBias,
    maxVoices, setMaxVoices,
    disableChords, setDisableChords,
    voiceAssignmentMode, setVoiceAssignmentMode
}: VoiceSettingsProps) {

    return (
        <div className="border-t border-gray-medium pt-4">
            <h3 className="text-lg font-semibold text-gray-light mb-4">Voice Definition</h3>
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                
                <div className="mb-6 border-b border-gray-700 pb-4">
                    <label className="block text-sm font-bold text-gray-300 mb-3">Voice Assignment Strategy</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${voiceAssignmentMode === 'auto' ? 'bg-brand-primary/20 border-brand-primary ring-1 ring-brand-primary' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                            <div className="flex items-center">
                                <input type="radio" name="voiceMode" value="auto" checked={voiceAssignmentMode === 'auto'} onChange={() => setVoiceAssignmentMode('auto')} className="sr-only" />
                                <span className="font-bold text-sm text-gray-200">Automatic Separation</span>
                            </div>
                            <span className="text-[10px] text-gray-400 mt-2 leading-tight">
                                Merge selected tracks and then algorithmically separate them into SATB voices based on pitch and density.
                            </span>
                        </label>

                        <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${voiceAssignmentMode === 'manual' ? 'bg-brand-primary/20 border-brand-primary ring-1 ring-brand-primary' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                            <div className="flex items-center">
                                <input type="radio" name="voiceMode" value="manual" checked={voiceAssignmentMode === 'manual'} onChange={() => setVoiceAssignmentMode('manual')} className="sr-only" />
                                <span className="font-bold text-sm text-gray-200">1 Track = 1 Voice</span>
                            </div>
                            <span className="text-[10px] text-gray-400 mt-2 leading-tight">
                                Treat each selected track as a distinct voice (e.g. Track 1 is Soprano, Track 2 is Alto). Do not re-separate.
                            </span>
                        </label>
                    </div>
                </div>

                <div className={`transition-opacity duration-300 ${voiceAssignmentMode === 'manual' ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Soft Overlap Tolerance</label>
                        <div className="flex items-center gap-4 bg-gray-900 p-3 rounded-lg border border-gray-700">
                            <input
                                type="range"
                                min="0" max={MUSICAL_TIME_OPTIONS.length - 1} step="1"
                                value={softOverlapToleranceIndex}
                                onChange={(e) => setSoftOverlapToleranceIndex(Number(e.target.value))}
                                className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                            />
                            <span className="text-xs font-mono text-brand-primary w-16 text-right">{MUSICAL_TIME_OPTIONS[softOverlapToleranceIndex].label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Defines how much two notes can overlap in time before they are considered a chord.</p>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Vertical Pitch Bias</label>
                        <div className="flex items-center gap-4 bg-gray-900 p-3 rounded-lg border border-gray-700">
                            <span className="text-xs font-bold text-gray-500">Smooth</span>
                            <input
                                type="range"
                                min="0" max="100" step="5"
                                value={pitchBias}
                                onChange={(e) => setPitchBias(Number(e.target.value))}
                                className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                            />
                            <span className="text-xs font-bold text-brand-primary w-10 text-right">{pitchBias}%</span>
                            <span className="text-xs font-bold text-gray-500">Strict</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Higher values prefer vertical (chord) grouping over horizontal (melodic) smoothness.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 mb-2">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-300 mb-2">Max Voices</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number" min="0" max="16" value={maxVoices}
                                    onChange={(e) => setMaxVoices(Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-24 bg-gray-900 border border-gray-700 rounded-md py-2 px-3 text-center focus:ring-brand-primary focus:border-brand-primary text-gray-light"
                                />
                                <span className="text-xs font-mono text-gray-400">{maxVoices === 0 ? "(Auto)" : `Force ${maxVoices}`}</span>
                            </div>
                        </div>
                        <div className="flex-1 flex items-end">
                            <label className="flex items-center p-2 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer w-full">
                                <input type="checkbox" checked={disableChords} onChange={(e) => setDisableChords(e.target.checked)} className="h-5 w-5 rounded bg-gray-dark border-gray-medium text-brand-primary focus:ring-brand-primary focus:ring-2" />
                                <div className="ml-3">
                                    <span className="font-semibold text-gray-light">Disable Chords</span>
                                    <p className="text-xs text-gray-500">Force single-note voices.</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
