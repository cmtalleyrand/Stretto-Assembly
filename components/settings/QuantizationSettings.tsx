
import React, { useState } from 'react';
import { MUSICAL_TIME_OPTIONS, RHYTHM_FAMILIES } from '../../constants';
import { RhythmRule, RhythmFamily } from '../../types';

interface QuantizationSettingsProps {
    primaryRhythm: RhythmRule;
    setPrimaryRhythm: (val: RhythmRule) => void;
    secondaryRhythm: RhythmRule;
    setSecondaryRhythm: (val: RhythmRule) => void;

    quantizeDurationMin: string;
    setQuantizeDurationMin: (val: string) => void;
    shiftToMeasure: boolean;
    setShiftToMeasure: (val: boolean) => void;
    
    quantizationWarning?: { message: string, details: string[] } | null;
}

export default function QuantizationSettings({
    primaryRhythm, setPrimaryRhythm,
    secondaryRhythm, setSecondaryRhythm,
    quantizeDurationMin, setQuantizeDurationMin,
    shiftToMeasure, setShiftToMeasure,
    quantizationWarning
}: QuantizationSettingsProps) {

    const [showWarningDetails, setShowWarningDetails] = useState(false);

    const handlePrimaryChange = (field: keyof RhythmRule, value: any) => {
        if (field === 'enabled' && value === false) {
             setPrimaryRhythm({ ...primaryRhythm, enabled: false });
        } else {
             setPrimaryRhythm({ ...primaryRhythm, enabled: true, [field]: value });
        }
    };

    const handleSecondaryChange = (field: keyof RhythmRule, value: any) => {
         setSecondaryRhythm({ ...secondaryRhythm, [field]: value });
    };

    const families = Object.keys(RHYTHM_FAMILIES) as RhythmFamily[];

    return (
        <div className="border-t border-gray-medium pt-4">
            <h3 className="text-lg font-semibold text-gray-light mb-4">Analysis Grid</h3>
            
            <div className="space-y-6">
                {/* Primary Rhythm */}
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={primaryRhythm.enabled} 
                                onChange={(e) => handlePrimaryChange('enabled', e.target.checked)} 
                                className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-brand-primary"
                            />
                            <span className="ml-3 font-bold text-gray-200">Primary Rhythm</span>
                        </label>
                        {primaryRhythm.enabled && <span className="text-xs text-brand-primary font-mono uppercase">Active</span>}
                    </div>
                    
                    {primaryRhythm.enabled && (
                        <div className="grid grid-cols-2 gap-4 animate-fade-in">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Family</label>
                                <select 
                                    value={primaryRhythm.family} 
                                    onChange={(e) => handlePrimaryChange('family', e.target.value)}
                                    className="block w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-sm text-gray-light"
                                >
                                    {families.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Min Resolution</label>
                                <select 
                                    value={primaryRhythm.minNoteValue} 
                                    onChange={(e) => handlePrimaryChange('minNoteValue', e.target.value)}
                                    className="block w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-sm text-gray-light"
                                >
                                    {RHYTHM_FAMILIES[primaryRhythm.family].map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Secondary Rhythm */}
                <div className={`bg-gray-800 p-4 rounded-lg border border-gray-700 transition-opacity ${!primaryRhythm.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={secondaryRhythm.enabled} 
                                onChange={(e) => handleSecondaryChange('enabled', e.target.checked)} 
                                className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-brand-secondary focus:ring-brand-secondary"
                            />
                            <span className="ml-3 font-bold text-gray-200">Secondary Rhythm (Optional)</span>
                        </label>
                    </div>

                    {secondaryRhythm.enabled && (
                         <div className="grid grid-cols-2 gap-4 animate-fade-in">
                             <div>
                                 <label className="block text-xs font-medium text-gray-400 mb-1">Family</label>
                                 <select 
                                     value={secondaryRhythm.family} 
                                     onChange={(e) => handleSecondaryChange('family', e.target.value)}
                                     className="block w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-sm text-gray-light"
                                 >
                                     {families.map(f => <option key={f} value={f}>{f}</option>)}
                                 </select>
                             </div>
                             <div>
                                 <label className="block text-xs font-medium text-gray-400 mb-1">Min Resolution</label>
                                 <select 
                                     value={secondaryRhythm.minNoteValue} 
                                     onChange={(e) => handleSecondaryChange('minNoteValue', e.target.value)}
                                     className="block w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-sm text-gray-light"
                                 >
                                     {RHYTHM_FAMILIES[secondaryRhythm.family].map(opt => (
                                         <option key={opt.value} value={opt.value}>{opt.label}</option>
                                     ))}
                                 </select>
                             </div>
                         </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">Allows notes to snap to this grid if they don't fit the Primary grid.</p>
                </div>

                {/* Advanced / Shared Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Minimum Note Value (Output)</label>
                        <select id="quantizeDurationMin" value={quantizeDurationMin} onChange={(e) => setQuantizeDurationMin(e.target.value)} className="block w-full bg-gray-darker border border-gray-medium rounded-md shadow-sm py-2 px-3 sm:text-sm text-gray-light">
                            <option value="off">Same as Grid (Auto)</option>
                            {MUSICAL_TIME_OPTIONS.filter(o => o.value > 0).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Staccato notes shorter than this will be extended.</p>
                    </div>
                    
                    <div className="flex items-end">
                         <label className="flex items-center p-3 bg-gray-darker rounded-lg border border-gray-medium hover:border-brand-secondary/50 transition-colors cursor-pointer h-full w-full">
                             <input type="checkbox" checked={shiftToMeasure} onChange={(e) => setShiftToMeasure(e.target.checked)} className="h-5 w-5 rounded bg-gray-dark border-gray-medium text-brand-primary focus:ring-brand-primary focus:ring-2" />
                             <div className="ml-3">
                                 <span className="font-semibold text-gray-light">Shift to Measure</span>
                                 <p className="text-xs text-gray-400">Align start to measure 1.</p>
                             </div>
                         </label>
                    </div>
                </div>

                {quantizationWarning && (
                    <div className="mt-2 p-3 bg-yellow-900/50 border border-yellow-700 text-yellow-200 rounded-lg text-sm flex flex-col gap-2">
                        <span className="font-semibold">{quantizationWarning.message}</span>
                        {quantizationWarning.details.length > 0 && (
                            <button onClick={(e) => { e.preventDefault(); setShowWarningDetails(!showWarningDetails); }} className="text-xs text-yellow-500 hover:text-white underline font-bold">
                                {showWarningDetails ? 'Hide' : 'Show Details'}
                            </button>
                        )}
                        {showWarningDetails && (
                            <div className="max-h-32 overflow-y-auto bg-black/30 p-2 rounded border border-yellow-700/50 font-mono text-[10px]">
                                {quantizationWarning.details.map((d, idx) => <div key={idx} className="text-yellow-400 opacity-80">{d}</div>)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
