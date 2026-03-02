
import React, { useState } from 'react';
import { TrackAnalysisData } from '../../types';
import { MetricBar, ProgressBar, StatItem } from './AnalysisShared';

export default function RhythmicIntegrityReport({ data }: { data: TrackAnalysisData }) {
    const { detectedGridType, gridAlignmentScore, durationConsistencyScore, transformationStats: stats, topNoteValues, outputNoteValues } = data;
    const [showDurationDetails, setShowDurationDetails] = useState(false);
    
    const alignmentDelta = stats ? stats.outputGridAlignment - stats.inputGridAlignment : 0;
    const deltaSign = alignmentDelta >= 0 ? '+' : '';
    const notesRemoved = stats ? (stats.notesRemovedDuration + stats.notesRemovedOverlap) : 0;

    // LaTeX style formula text for tooltip
    const formulaText = "Score = 1 - ( ∑|d| / (N * G/2) ) \n\nWhere:\n|d| = distance to nearest grid line\nN = total notes\nG = grid interval ticks";

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-800/50 p-5 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-light flex items-center gap-2">
                        <span>Rhythmic Integrity</span>
                        <span className="text-xs font-normal text-gray-400 px-2 py-0.5 border border-gray-600 rounded-full">{detectedGridType}</span>
                    </h3>
                </div>

                <MetricBar 
                    label="Grid Alignment" 
                    value={gridAlignmentScore} 
                    description="How closely note onsets match the detected grid."
                    tooltip={formulaText}
                />

                <MetricBar 
                    label="Duration Consistency" 
                    value={durationConsistencyScore} 
                    description="How standard the note lengths are (e.g. holding exactly for a quarter note)."
                    tooltip="High scores mean notes are held for precise musical durations. Low scores indicate staccato or inconsistent lengths."
                />

                {stats && (
                    <div className="mt-6 pt-4 border-t border-gray-700">
                         <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold text-gray-300">Quantization Impact</span>
                            <span className={`text-xs font-mono ${alignmentDelta > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                                {Math.round(stats.inputGridAlignment*100)}% &rarr; {Math.round(stats.outputGridAlignment*100)}% ({deltaSign}{Math.round(alignmentDelta*100)}%)
                            </span>
                         </div>
                         <div className="w-full bg-gray-800 rounded-full h-1.5 flex overflow-hidden">
                             <div className="bg-gray-500 h-full opacity-50" style={{ width: `${stats.inputGridAlignment * 100}%` }}></div>
                             {alignmentDelta > 0 && <div className="bg-brand-primary h-full" style={{ width: `${alignmentDelta * 100}%` }}></div>}
                         </div>
                    </div>
                )}
            </div>

            <div className="bg-gray-800/30 p-5 rounded-lg border border-gray-700 flex flex-col">
                <h3 className="text-lg font-bold text-gray-light mb-4">Processing Report</h3>
                
                {stats ? (
                    <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                         <StatItem 
                            label="Timing Corrected" 
                            value={stats.notesQuantized} 
                            subtext={`Avg Shift: ${Math.round(stats.avgShiftTicks)} ticks`} 
                            highlight
                        />
                        <StatItem 
                            label="Durations Adjusted" 
                            value={stats.notesDurationChanged} 
                            subtext={showDurationDetails ? "Click to hide" : "Click for details"}
                            onClick={() => setShowDurationDetails(!showDurationDetails)}
                            active={showDurationDetails}
                        />
                         <StatItem 
                            label="Notes Removed" 
                            value={notesRemoved} 
                            subtext="Too Short / Overlap" 
                        />
                        <StatItem 
                            label="Truncated" 
                            value={stats.notesTruncatedOverlap} 
                            subtext="Overlap Pruning" 
                        />
                    </div>
                    {showDurationDetails && (
                        <div className="mb-4 p-3 bg-gray-700/50 rounded border border-gray-600 text-xs animate-fade-in">
                            <h4 className="font-bold text-gray-300 mb-2">Duration Adjustment Breakdown</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="block text-gray-400">Extended</span>
                                    <span className="text-[10px] text-gray-500">(Min Duration / Legato)</span>
                                    <span className="text-lg font-mono text-green-400">+{stats.notesExtended}</span>
                                </div>
                                <div>
                                    <span className="block text-gray-400">Shortened</span>
                                    <span className="text-[10px] text-gray-500">(Quantization / Pruning)</span>
                                    <span className="text-lg font-mono text-red-400">-{stats.notesShortened}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    </>
                ) : (
                    <div className="flex-grow flex items-center justify-center text-gray-500 text-sm italic mb-4">
                        Enable transformation options to see impact report.
                    </div>
                )}

                <div className="mt-auto grid grid-cols-2 gap-4">
                    <div>
                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2 border-b border-gray-700 pb-1">Input Rhythm</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                            {topNoteValues.slice(0, 4).map((stat, idx) => (
                                 <ProgressBar 
                                    key={idx} 
                                    value={stat.percentage / 100} 
                                    label={`${stat.name}`} 
                                    colorClass="bg-gray-600" 
                                 />
                            ))}
                        </div>
                    </div>
                    <div>
                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-2 border-b border-gray-700 pb-1">Output Rhythm</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                            {outputNoteValues && outputNoteValues.length > 0 ? (
                                outputNoteValues.slice(0, 4).map((stat, idx) => (
                                    <ProgressBar 
                                        key={idx} 
                                        value={stat.percentage / 100} 
                                        label={`${stat.name}`} 
                                        colorClass="bg-brand-primary" 
                                    />
                                ))
                            ) : (
                                <p className="text-[10px] text-gray-600 italic py-2">Same as input</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
