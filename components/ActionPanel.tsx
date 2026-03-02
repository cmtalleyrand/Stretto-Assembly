import React from 'react';
import { Spinner, DocumentTextIcon, DownloadIcon } from './Icons';

interface ActionPanelProps {
    onGenerateScore: () => void;
    onDownloadScore?: () => void;
    onDownloadAudit?: () => void;
    isGenerating: boolean;
    canProcess: boolean;
    selectedCount: number;
    hasResult: boolean;
    hasAudit?: boolean; // New prop to control audit button visibility
}

export default function ActionPanel({ onGenerateScore, onDownloadScore, onDownloadAudit, isGenerating, canProcess, selectedCount, hasResult, hasAudit }: ActionPanelProps) {
    return (
        <div className="w-full bg-gray-dark p-6 rounded-2xl shadow-2xl border border-gray-medium mt-6 animate-slide-up">
            <div className="flex flex-col items-center justify-center gap-4">
                <div className="flex flex-wrap gap-4 w-full sm:w-2/3 justify-center">
                    <button 
                        onClick={onGenerateScore} 
                        disabled={!canProcess || isGenerating} 
                        className="flex-grow flex items-center justify-center gap-3 px-6 py-4 bg-brand-primary text-white font-bold rounded-lg shadow-lg transition-all duration-300 ease-in-out disabled:bg-gray-medium disabled:cursor-not-allowed hover:bg-brand-secondary focus:outline-none focus:ring-4 focus:ring-brand-primary/50 min-w-[200px]"
                    >
                        {isGenerating ? ( 
                            <><Spinner className="w-6 h-6" /><span>Analyzing...</span></> 
                        ) : ( 
                            <><DocumentTextIcon className="w-6 h-6" /><span>Generate Analysis Score ({selectedCount})</span></> 
                        )}
                    </button>
                    
                    {hasResult && onDownloadScore && (
                        <button
                            onClick={onDownloadScore}
                            className="flex items-center justify-center gap-2 px-6 py-4 bg-gray-700 text-gray-200 font-bold rounded-lg shadow-lg border border-gray-600 hover:bg-gray-600 hover:text-white transition-all"
                            title="Download Report as Text File"
                        >
                            <DownloadIcon className="w-6 h-6" />
                            <span>Download Score</span>
                        </button>
                    )}

                    {hasAudit && onDownloadAudit && (
                        <button
                            onClick={onDownloadAudit}
                            className="flex items-center justify-center gap-2 px-6 py-4 bg-amber-800 text-amber-100 font-bold rounded-lg shadow-lg border border-amber-600/50 hover:bg-amber-700 hover:text-white transition-all animate-fade-in"
                            title="Download Technical Audit Log"
                        >
                            <DownloadIcon className="w-6 h-6" />
                            <span>Download Audit Log</span>
                        </button>
                    )}
                </div>
                
                <p className="text-[10px] text-gray-400 text-center max-w-md">
                    Generates a comprehensive Markdown report including Key, Rhythm, Harmony, and a detailed chronological Score Table.
                </p>
            </div>
            {!canProcess && !isGenerating && ( 
                <p className="text-center text-xs text-gray-400 mt-2"> Select at least 1 track to proceed. </p> 
            )}
        </div>
    );
}