
import React from 'react';
import { CanonSearchOptions, CanonTranspositionMode } from '../../types';
import { getStrictPitchName } from '../services/midiSpelling';

interface CanonSearchPanelProps {
    options: CanonSearchOptions;
    setOptions: (opt: CanonSearchOptions) => void;
    onSearch: () => void;
    isSearching: boolean;
    totalEvaluated?: number;
    timeMs?: number;
}

const SCALE_MODES = [
    'Major', 'Natural Minor', 'Harmonic Minor', 'Melodic Minor',
    'Dorian', 'Phrygian', 'Lydian', 'Mixolydian',
];

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export default function CanonSearchPanel({
    options,
    setOptions,
    onSearch,
    isSearching,
    totalEvaluated,
    timeMs,
}: CanonSearchPanelProps) {
    const set = <K extends keyof CanonSearchOptions>(field: K, value: CanonSearchOptions[K]) => {
        setOptions({ ...options, [field]: value });
    };

    const clampedChainMax = Math.max(options.chainLengthMin, options.chainLengthMax);
    const clampedDelayMax = Math.max(options.delayMinBeats, options.delayMaxBeats);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded p-4 mb-4 shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Canon Search</h3>
                <span className="text-[10px] text-gray-500 italic">All equal-delay combinations scored</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

                {/* Delay range */}
                <div className="bg-gray-900 p-3 rounded border border-gray-700 flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Delay Range (beats)</label>
                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                            <label className="text-[9px] text-gray-500 block mb-1">Min</label>
                            <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={options.delayMinBeats}
                                onChange={e => {
                                    const v = Math.max(0.5, parseFloat(e.target.value) || 0.5);
                                    setOptions({ ...options, delayMinBeats: v, delayMaxBeats: Math.max(v, options.delayMaxBeats) });
                                }}
                                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center"
                            />
                        </div>
                        <span className="text-gray-600 text-xs mt-4">–</span>
                        <div className="flex-1">
                            <label className="text-[9px] text-gray-500 block mb-1">Max</label>
                            <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={clampedDelayMax}
                                onChange={e => {
                                    const v = Math.max(options.delayMinBeats, parseFloat(e.target.value) || options.delayMinBeats);
                                    set('delayMaxBeats', v);
                                }}
                                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white text-center"
                            />
                        </div>
                    </div>
                    <p className="text-[9px] text-gray-500 leading-tight">
                        Searched at 0.5-beat resolution.
                    </p>
                </div>

                {/* Chain length + voices */}
                <div className="bg-gray-900 p-3 rounded border border-gray-700 flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Chain Setup</label>

                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[9px] text-gray-500 block mb-1">Voices</label>
                            <select
                                value={options.ensembleTotal}
                                onChange={e => set('ensembleTotal', parseInt(e.target.value))}
                                className="w-full bg-gray-800 border border-gray-600 rounded text-xs text-white px-1 py-1"
                            >
                                {Array.from({ length: 6 }, (_, i) => i + 2).map(n => (
                                    <option key={n} value={n}>{n} voices</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[9px] text-gray-500 block mb-1">Min entries</label>
                            <select
                                value={options.chainLengthMin}
                                onChange={e => {
                                    const v = parseInt(e.target.value);
                                    setOptions({ ...options, chainLengthMin: v, chainLengthMax: Math.max(v, options.chainLengthMax) });
                                }}
                                className="w-full bg-gray-800 border border-gray-600 rounded text-xs text-white px-1 py-1"
                            >
                                {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-[9px] text-gray-500 block mb-1">Max entries</label>
                            <select
                                value={clampedChainMax}
                                onChange={e => set('chainLengthMax', parseInt(e.target.value))}
                                className="w-full bg-gray-800 border border-gray-600 rounded text-xs text-white px-1 py-1"
                            >
                                {Array.from({ length: 11 }, (_, i) => i + 2)
                                    .filter(n => n >= options.chainLengthMin)
                                    .map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <p className="text-[9px] text-gray-500 leading-tight">
                        Truncation applied automatically when delay × voices &lt; subject length.
                    </p>
                </div>

                {/* Interval options */}
                <div className="bg-gray-900 p-3 rounded border border-gray-700 flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Intervals</label>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={options.allowThirdSixth}
                            onChange={e => set('allowThirdSixth', e.target.checked)}
                            className="h-3 w-3 rounded bg-gray-800 border-gray-600 text-brand-primary focus:ring-0"
                        />
                        <span className="text-[10px] text-gray-300">3rds &amp; 6ths</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={options.allowInversions}
                            onChange={e => set('allowInversions', e.target.checked)}
                            className="h-3 w-3 rounded bg-gray-800 border-gray-600 text-brand-primary focus:ring-0"
                        />
                        <span className="text-[10px] text-gray-300">Inversions</span>
                    </label>

                    {options.allowInversions && (
                        <div className="mt-1 pl-1 border-l border-gray-700 flex flex-col gap-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={options.useChromaticInversion}
                                    onChange={e => set('useChromaticInversion', e.target.checked)}
                                    className="h-3 w-3 rounded bg-gray-800 border-gray-600 text-brand-primary focus:ring-0"
                                />
                                <span className="text-[9px] text-gray-400">Chromatic (else diatonic)</span>
                            </label>

                            {!options.useChromaticInversion && (
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-gray-500 w-8">Scale</span>
                                        <select
                                            value={options.scaleRoot}
                                            onChange={e => set('scaleRoot', parseInt(e.target.value))}
                                            className="bg-gray-800 border border-gray-600 text-[9px] rounded px-1 py-0.5 text-gray-300 w-10"
                                        >
                                            {NOTE_NAMES.map((k, i) => (
                                                <option key={k} value={i}>{k}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={options.scaleMode}
                                            onChange={e => set('scaleMode', e.target.value)}
                                            className="bg-gray-800 border border-gray-600 text-[9px] rounded px-1 py-0.5 text-gray-300 flex-1"
                                        >
                                            {SCALE_MODES.map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-gray-500 w-8">Pivot</span>
                                        <select
                                            value={options.pivotMidi}
                                            onChange={e => set('pivotMidi', parseInt(e.target.value))}
                                            className="bg-gray-800 border border-gray-600 text-[9px] rounded px-1 py-0.5 text-gray-300 flex-1"
                                        >
                                            {Array.from({ length: 12 }).map((_, i) => {
                                                const midi = 60 + i;
                                                return <option key={midi} value={midi}>{getStrictPitchName(midi)}</option>;
                                            })}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Transposition mode + Info */}
                <div className="bg-gray-900 p-3 rounded border border-gray-700 flex flex-col gap-2 justify-between">
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Transposition model</label>
                        <div className="flex flex-col gap-1.5">
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="transpositionMode"
                                    value="independent"
                                    checked={(options.transpositionMode ?? 'independent') !== 'cumulative'}
                                    onChange={() => set('transpositionMode', 'independent' as CanonTranspositionMode)}
                                    className="mt-0.5 h-3 w-3"
                                />
                                <span className="text-[10px] text-gray-300">
                                    <span className="font-bold">Independent</span>
                                    <span className="text-gray-500 block">Each voice slot gets any valid interval; all combinations enumerated</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="transpositionMode"
                                    value="cumulative"
                                    checked={options.transpositionMode === 'cumulative'}
                                    onChange={() => set('transpositionMode', 'cumulative' as CanonTranspositionMode)}
                                    className="mt-0.5 h-3 w-3"
                                />
                                <span className="text-[10px] text-gray-300">
                                    <span className="font-bold">Cumulative</span>
                                    <span className="text-gray-500 block">Voice i at i×T for every T in the interval set</span>
                                </span>
                            </label>
                        </div>
                    </div>
                    <div className="border-t border-gray-700 pt-2 mt-1">
                        <div className="flex flex-col gap-1 text-[10px] text-gray-500">
                            <span>Traditional: P1/P4/P5/P8/P11/P12/P15/P18/P19/P22{options.allowThirdSixth ? ' + 3rds/6ths &amp; compounds' : ''}.</span>
                            <span>Inversion: {options.allowInversions ? 'none / alternating / all' : 'none'}.</span>
                            <span>Auto-truncation when required.</span>
                        </div>
                    </div>
                    {totalEvaluated !== undefined && timeMs !== undefined && (
                        <div className="border-t border-gray-700 pt-2 text-[9px] text-gray-500 font-mono">
                            {totalEvaluated.toLocaleString()} combinations in {timeMs}ms
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={onSearch}
                disabled={isSearching}
                className="w-full py-2 bg-brand-primary hover:bg-brand-secondary text-white font-bold rounded shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wide"
            >
                {isSearching ? 'Scoring combinations…' : 'Run Canon Search'}
            </button>
        </div>
    );
}
