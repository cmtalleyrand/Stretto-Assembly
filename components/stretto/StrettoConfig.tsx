
import React from 'react';
import { getStrictPitchName } from '../services/midiSpelling';

const INTERVAL_OPTIONS = [
    { label: 'Unison (P1)', val: 0 },
    { label: '+ Perf 5th', val: 7 },
    { label: '- Perf 5th', val: -7 },
    { label: '+ Perf 4th', val: 5 },
    { label: '- Perf 4th', val: -5 },
    { label: '+1 Octave (P8)', val: 12 },
    { label: '-1 Octave (P8)', val: -12 },
    { label: '+2 Octaves (P15)', val: 24 },
    { label: '-2 Octaves (P15)', val: -24 },
];

export type SearchResolution = 'half' | 'full' | 'double';

interface StrettoConfigProps {
    selectedIntervals: number[];
    setSelectedIntervals: (vals: number[]) => void;
    searchRes: SearchResolution;
    setSearchRes: (res: SearchResolution) => void;
    includeInversions: boolean;
    setIncludeInversions: (val: boolean) => void;
    includeExtensions: boolean;
    setIncludeExtensions: (val: boolean) => void;
    pivotMidi: number;
    setPivotMidi: (val: number) => void;
}

export default function StrettoConfig({ 
    selectedIntervals, setSelectedIntervals, 
    searchRes, setSearchRes,
    includeInversions, setIncludeInversions,
    includeExtensions, setIncludeExtensions,
    pivotMidi, setPivotMidi
}: StrettoConfigProps) {
    
    const toggleInterval = (val: number, checked: boolean) => {
        if (checked) {
            if (!selectedIntervals.includes(val)) setSelectedIntervals([...selectedIntervals, val]);
        } else {
            setSelectedIntervals(selectedIntervals.filter(c => c !== val));
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-gray-800 rounded border border-gray-700 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-brand-primary">Functional Discovery Intervals</h3>
                    {includeInversions && (
                        <div className="flex items-center gap-2 bg-gray-900 px-2 py-1 rounded border border-gray-700 animate-fade-in">
                            <span className="text-[9px] text-gray-500 font-bold uppercase">Pivot:</span>
                            <select 
                                value={pivotMidi}
                                onChange={(e) => setPivotMidi(parseInt(e.target.value))}
                                className="bg-transparent text-[10px] text-brand-primary font-bold focus:outline-none"
                            >
                                {Array.from({length: 24}).map((_, i) => {
                                    const m = 48 + i; 
                                    return <option key={m} value={m} className="bg-gray-800">{getStrictPitchName(m)}</option>
                                })}
                            </select>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                    {INTERVAL_OPTIONS.map(opt => (
                        <label key={opt.val} className={`flex items-center justify-center px-2 py-1.5 rounded cursor-pointer border transition-all ${selectedIntervals.includes(opt.val) ? 'bg-brand-primary/20 border-brand-primary text-brand-primary' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                            <input 
                                type="checkbox" 
                                checked={selectedIntervals.includes(opt.val)}
                                onChange={e => toggleInterval(opt.val, e.target.checked)}
                                className="sr-only"
                            />
                            <span className="text-[10px] font-bold text-center">{opt.label}</span>
                        </label>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-700 pt-3">
                     <label className={`flex items-center px-3 py-1.5 rounded cursor-pointer border transition-all ${includeExtensions ? 'bg-brand-secondary/20 border-brand-secondary text-brand-secondary' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        <input 
                            type="checkbox" 
                            checked={includeExtensions}
                            onChange={e => setIncludeExtensions(e.target.checked)}
                            className="sr-only"
                        />
                        <span className="text-xs font-bold">+ 3rds & 6ths</span>
                    </label>
                    <label className={`flex items-center px-3 py-1.5 rounded cursor-pointer border transition-all ${includeInversions ? 'bg-blue-900/30 border-blue-500 text-blue-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        <input 
                            type="checkbox" 
                            checked={includeInversions}
                            onChange={e => setIncludeInversions(e.target.checked)}
                            className="sr-only"
                        />
                        <span className="text-xs font-bold">+ Inversions</span>
                    </label>
                </div>
            </div>

            <div className="p-4 bg-gray-800 rounded border border-gray-700 shadow-sm">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest">Entry Resolution</h3>
                <div className="grid grid-cols-3 gap-2">
                    {(['half', 'full', 'double'] as SearchResolution[]).map(res => (
                        <button 
                            key={res}
                            onClick={() => setSearchRes(res)}
                            className={`px-2 py-2 rounded text-xs font-bold border transition-all ${searchRes === res ? 'bg-brand-primary text-white border-brand-primary shadow-lg' : 'bg-gray-900 border-gray-700 text-gray-500 hover:bg-gray-800'}`}
                        >
                            {res === 'half' ? '1/2 Beat' : res === 'full' ? 'Beat' : '2 Beats'}
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                    Defines how frequently the algorithm checks for entry points.
                </p>
            </div>
        </div>
    );
}
