
import React from 'react';
import { StrettoCandidate } from '../../types';
import { Spinner, DownloadIcon } from '../Icons';

interface StrettoFooterProps {
    selectedCandidates: StrettoCandidate[];
    onDownloadMidi: () => void;
    onAssemble: () => void;
    isAssembling: boolean;
    onRemoveCandidate: (id: string) => void;
}

export default function StrettoFooter({ selectedCandidates, onDownloadMidi, onAssemble, isAssembling, onRemoveCandidate }: StrettoFooterProps) {
    const hasSelection = selectedCandidates.length > 0;

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-gray-800 border-t border-brand-primary p-4 rounded-b-2xl shadow-2xl z-20">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex-grow w-full md:w-auto overflow-hidden">
                    <div className="flex justify-between items-center mb-2">
                        <div className="text-xs text-brand-primary font-bold">SELECTED FOR ASSEMBLY ({selectedCandidates.length}):</div>
                        <div className="flex gap-2">
                            {hasSelection && (
                                <button 
                                    onClick={onDownloadMidi}
                                    className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 bg-gray-700 px-2 py-1 rounded"
                                >
                                    <DownloadIcon className="w-3 h-3" /> Selected Tracks
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-16 overflow-y-auto">
                        {hasSelection ? (
                            selectedCandidates.map(c => (
                                <div key={c.id} className="inline-flex items-center gap-1 bg-brand-primary/20 border border-brand-primary/50 rounded-full px-2 py-1">
                                    <span className="text-xs font-bold text-brand-primary">{c.intervalLabel}</span>
                                    <span className="text-[10px] text-brand-secondary bg-black/20 px-1 rounded">@{c.delayBeats}B</span>
                                    <button onClick={() => onRemoveCandidate(c.id)} className="ml-1 text-brand-primary hover:text-white">×</button>
                                </div>
                            ))
                        ) : (
                            <span className="text-xs text-gray-500 italic">No candidates selected. Check box to add.</span>
                        )}
                    </div>
                </div>
                
                <div className="flex gap-2 flex-shrink-0">
                    <button 
                        onClick={onAssemble} 
                        disabled={isAssembling || !hasSelection}
                        className="flex items-center gap-2 px-6 py-3 bg-brand-primary hover:bg-brand-secondary disabled:opacity-50 disabled:bg-gray-600 text-white font-bold rounded shadow-lg transition-all"
                    >
                        {isAssembling ? (
                            <><Spinner className="w-5 h-5" /> Assembling...</>
                        ) : (
                            <>Assemble Chain &rarr;</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
