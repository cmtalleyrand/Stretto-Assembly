
import React from 'react';
import { TempoChangeMode } from '../../types';

interface TempoTimeSettingsProps {
    originalTempo: number | null;
    newTempo: string;
    setNewTempo: (val: string) => void;
    originalTimeSignature: { numerator: number, denominator: number } | null;
    newTimeSignature: { numerator: string, denominator: string };
    setNewTimeSignature: (val: { numerator: string, denominator: string }) => void;
    tempoChangeMode: TempoChangeMode;
    setTempoChangeMode: (val: TempoChangeMode) => void;
    originalDuration: number | null;
    newDuration: number | null;
}

const formatDuration = (seconds: number | null): string => {
    if (seconds === null || isNaN(seconds) || seconds < 0) return '--:--';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function TempoTimeSettings({
    originalTempo, newTempo, setNewTempo,
    originalTimeSignature, newTimeSignature, setNewTimeSignature,
    tempoChangeMode, setTempoChangeMode,
    originalDuration, newDuration
}: TempoTimeSettingsProps) {

    const handleTimeSigChange = (part: 'numerator' | 'denominator', val: string) => {
        setNewTimeSignature({ ...newTimeSignature, [part]: val });
    };

    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-light mb-4">Tempo & Time</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                    <label htmlFor="tempo" className="block text-sm font-medium text-gray-400 mb-1">Tempo (BPM)</label>
                    <input type="number" id="tempo" value={newTempo} onChange={(e) => setNewTempo(e.target.value)} min="1" className="block w-full bg-gray-darker border border-gray-medium rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-gray-light" />
                    {originalTempo && (<p className="text-xs text-gray-500 mt-1">Original: {Math.round(originalTempo)} BPM</p>)}
                    <p className="text-xs text-gray-500 mt-2">Sets the playback speed or grid reference tempo.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Time Signature</label>
                    <div className="flex items-center gap-2">
                        <input type="number" value={newTimeSignature.numerator} onChange={(e) => handleTimeSigChange('numerator', e.target.value)} min="1" className="w-20 bg-gray-darker border border-gray-medium rounded-md shadow-sm py-2 px-3 text-center focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-gray-light" />
                        <span className="text-gray-400 text-lg font-bold">/</span>
                        <input type="number" value={newTimeSignature.denominator} onChange={(e) => handleTimeSigChange('denominator', e.target.value)} min="1" className="w-20 bg-gray-darker border border-gray-medium rounded-md shadow-sm py-2 px-3 text-center focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-gray-light" />
                    </div>
                    {originalTimeSignature && (<p className="text-xs text-gray-500 mt-1"> Original: {originalTimeSignature.numerator} / {originalTimeSignature.denominator} </p>)}
                    <p className="text-xs text-gray-500 mt-2">Defines measure boundaries for quantization.</p>
                </div>
            </div>
            {(originalDuration !== null && newDuration !== null) && (
                <div className="mt-4 text-center text-sm text-gray-400 p-3 bg-gray-darker rounded-md border border-gray-medium">
                    <p> Original Duration: <span className="font-mono text-gray-light">{formatDuration(originalDuration)}</span>
                        <span className="mx-2 text-gray-600">|</span> New Duration: <span className="font-mono text-gray-light">{formatDuration(newDuration)}</span>
                    </p>
                </div>
            )}
            <div className="mt-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">Tempo Change Mode</label>
                <div className="flex flex-col sm:flex-row gap-3">
                    <label className={`flex-1 p-3 rounded-lg border cursor-pointer transition-colors ${tempoChangeMode === 'speed' ? 'bg-brand-secondary/30 border-brand-primary ring-2 ring-brand-primary' : 'border-gray-medium hover:border-brand-secondary/50'}`}>
                        <input type="radio" name="tempo-mode" value="speed" checked={tempoChangeMode === 'speed'} onChange={() => setTempoChangeMode('speed')} className="sr-only" />
                        <span className="font-semibold text-gray-light block">Change Playback Speed</span>
                        <span className="text-xs text-gray-400 mt-1 block">The song plays faster or slower (duration changes).</span>
                    </label>
                    <label className={`flex-1 p-3 rounded-lg border cursor-pointer transition-colors ${tempoChangeMode === 'time' ? 'bg-brand-secondary/30 border-brand-primary ring-2 ring-brand-primary' : 'border-gray-medium hover:border-brand-secondary/50'}`}>
                        <input type="radio" name="tempo-mode" value="time" checked={tempoChangeMode === 'time'} onChange={() => setTempoChangeMode('time')} className="sr-only" />
                        <span className="font-semibold text-gray-light block">Preserve Real Time</span>
                        <span className="text-xs text-gray-400 mt-1 block">Adjusts positions so the song lasts the same amount of time (duration constant).</span>
                    </label>
                </div>
            </div>
        </div>
    );
}
