
import React, { useState, useMemo } from 'react';
import { predictKey } from '../services/analysis/keyPrediction';

const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface KeyPredictionPanelProps {
    histogram: Record<number, number>;
    totalNotes: number;
}

export default function KeyPredictionPanel({ histogram, totalNotes }: KeyPredictionPanelProps) {
    const [showExoticModes, setShowExoticModes] = useState(false);
    const [showAllPredictions, setShowAllPredictions] = useState(false);

    const topSuggestions = useMemo(() => {
        return predictKey(histogram, totalNotes, showExoticModes);
    }, [histogram, totalNotes, showExoticModes]);
  
    const displayedSuggestions = showAllPredictions ? topSuggestions : topSuggestions.slice(0, 3);

    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-light">Predicted Key & Mode</h3>
                 <button 
                     onClick={() => setShowExoticModes(!showExoticModes)}
                     className={`px-3 py-1 text-xs font-medium rounded-full transition-colors border ${showExoticModes ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-900 text-gray-400 border-gray-600 hover:border-gray-400'}`}
                 >
                     {showExoticModes ? "✓ Exotic Modes Included" : "+ Include Exotic Modes"}
                 </button>
            </div>

            <div className="space-y-3">
                {displayedSuggestions.length > 0 ? (
                    displayedSuggestions.map((group, i) => (
                        <div key={i} className="bg-gray-900 rounded border border-gray-700 p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-brand-primary">{KEYS[group.winner.root]} {group.winner.mode}</span>
                                    {i === 0 && <span className="text-[10px] bg-brand-secondary/50 text-brand-primary px-1.5 py-0.5 rounded border border-brand-secondary">Best Match</span>}
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-gray-300">{Math.round(group.winner.score * 100)}%</div>
                                </div>
                            </div>
                            
                            <div className="space-y-2 mb-2">
                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <span className="w-12">Diatonic</span>
                                    <div className="flex-grow bg-gray-700 h-1.5 rounded-full">
                                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${group.winner.diatonic * 100}%` }}></div>
                                    </div>
                                    <span className="w-8 text-right font-mono">{Math.round(group.winner.diatonic * 100)}%</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <span className="w-12">Triad</span>
                                    <div className="flex-grow bg-gray-700 h-1.5 rounded-full">
                                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${group.winner.triad * 100}%` }}></div>
                                    </div>
                                    <span className="w-8 text-right font-mono">{Math.round(group.winner.triad * 100)}%</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <span className="w-12">Tonic</span>
                                    <div className="flex-grow bg-gray-700 h-1.5 rounded-full">
                                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${group.winner.tonic * 100}%` }}></div>
                                    </div>
                                    <span className="w-8 text-right font-mono">{Math.round(group.winner.tonic * 100)}%</span>
                                </div>
                            </div>

                            {group.relatives.length > 0 && (
                                 <div className="text-xs text-gray-500 pt-2 border-t border-gray-800">
                                     <span className="font-semibold text-gray-600">Relatives: </span>
                                     {group.relatives.join(', ')}
                                 </div>
                            )}
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-gray-500 italic">Not enough data to predict key.</p>
                )}
                
                 {topSuggestions.length > 3 && (
                     <button 
                         onClick={() => setShowAllPredictions(!showAllPredictions)}
                         className="w-full text-center text-xs text-gray-500 hover:text-gray-300 mt-2"
                     >
                         {showAllPredictions ? "Show Less" : `Show ${topSuggestions.length - 3} More Candidates`}
                     </button>
                 )}
            </div>
        </div>
    );
}
