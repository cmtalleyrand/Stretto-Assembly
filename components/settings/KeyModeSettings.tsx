
import React from 'react';

const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MODES = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Locrian': [0, 1, 3, 5, 6, 8, 10],
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

const getDegreeLabel = (interval: number, modeIntervals: number[]) => {
    const degreeIndex = modeIntervals.indexOf(interval);
    if (degreeIndex !== -1) return `Degree ${degreeIndex + 1}`;
    switch(interval) {
        case 0: return "Root (1)";
        case 1: return "Min 2nd (b2)";
        case 2: return "Maj 2nd (2)";
        case 3: return "Min 3rd (b3)";
        case 4: return "Maj 3rd (3)";
        case 5: return "Perfect 4th (4)";
        case 6: return "Aug 4 / Dim 5";
        case 7: return "Perfect 5th (5)";
        case 8: return "Min 6th (b6)";
        case 9: return "Maj 6th (6)";
        case 10: return "Min 7th (b7)";
        case 11: return "Maj 7th (7)";
        default: return "";
    }
};

const getNoteName = (root: number, interval: number) => KEYS[(root + interval) % 12];

interface KeyModeSettingsProps {
    modalRoot: number;
    setModalRoot: (val: number) => void;
    modalModeName: string;
    setModalModeName: (val: string) => void;
    isModalConversionEnabled: boolean;
    setIsModalConversionEnabled: (val: boolean) => void;
    modalMappings: Record<number, number>;
    setModalMappings: (val: Record<number, number>) => void;
}

export default function KeyModeSettings({
    modalRoot, setModalRoot,
    modalModeName, setModalModeName,
    isModalConversionEnabled, setIsModalConversionEnabled,
    modalMappings, setModalMappings
}: KeyModeSettingsProps) {

    const modeIntervals = MODES[modalModeName as keyof typeof MODES] || MODES['Major'];

    return (
        <div className="border-t border-gray-medium pt-4">
            <h3 className="text-lg font-semibold text-gray-light mb-4">Key & Mode</h3>
            <div className="bg-gray-darker p-4 rounded-lg border border-gray-medium">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Key Root</label>
                        <select value={modalRoot} onChange={(e) => setModalRoot(Number(e.target.value))} className="block w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light">
                            {KEYS.map((k, i) => <option key={k} value={i}>{k}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Mode</label>
                        <select value={modalModeName} onChange={(e) => setModalModeName(e.target.value)} className="block w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light">
                            {Object.keys(MODES).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
                    <div>
                        <span className="text-sm font-medium text-gray-300">Enable Note Remapping</span>
                        <p className="text-xs text-gray-500 mt-1">Allows you to remap notes from the source key to a target scale (e.g. Major to Minor conversion).</p>
                    </div>
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={isModalConversionEnabled} onChange={(e) => setIsModalConversionEnabled(e.target.checked)} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${isModalConversionEnabled ? 'bg-brand-primary' : 'bg-gray-700'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isModalConversionEnabled ? 'transform translate-x-4' : ''}`}></div>
                        </div>
                    </label>
                </div>
                {isModalConversionEnabled && (
                    <div className="mt-4 overflow-x-auto animate-fade-in">
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead>
                                <tr><th className="px-4 py-2">Source</th><th></th><th className="px-4 py-2">Target</th></tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <tr key={i} className={`border-b border-gray-700 ${modeIntervals.includes(i) ? 'bg-gray-800/50' : ''}`}>
                                        <td className="px-4 py-2 font-medium">{getNoteName(modalRoot, i)} <span className="text-xs text-gray-500">({getDegreeLabel(i, modeIntervals)})</span></td>
                                        <td className="text-center">→</td>
                                        <td className="px-4 py-2">
                                            <select
                                                value={modalMappings[i] ?? i}
                                                onChange={(e) => setModalMappings({ ...modalMappings, [i]: Number(e.target.value) })}
                                                className="bg-gray-900 border border-gray-700 rounded py-1 px-2 text-gray-light w-full"
                                            >
                                                {Array.from({ length: 12 }).map((_, tIdx) => (
                                                    <option key={tIdx} value={tIdx}>{getNoteName(modalRoot, tIdx)} - {getDegreeLabel(tIdx, modeIntervals)}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
