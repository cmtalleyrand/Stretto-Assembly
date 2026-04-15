
import React, { useState } from 'react';
import { StrettoChainResult, StrettoChainOption, ScoreLog } from '../../types';
import { getIntervalLabel } from '../services/midiSpelling';
import { getVoiceCode } from '../services/midiVoices';
import { formatQuarterNoteUnits } from './quarterNoteUnits';

interface StrettoResultsListProps {
    results: StrettoChainResult[];
    selectedId: string | null;
    onSelect: (res: StrettoChainResult) => void;
    voiceNames?: Record<number, string>;
}

export default function StrettoResultsList({ results, selectedId, onSelect, voiceNames }: StrettoResultsListProps) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [scoreTooltipId, setScoreTooltipId] = useState<string | null>(null);

    if (results.length === 0) {
        return <div className="text-center text-gray-500 py-10">No chains found yet. Run the search to begin.</div>;
    }

    const sortedResults = [...results].sort((a, b) => b.score - a.score);

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const formatInterval = (semis: number) => {
        return getIntervalLabel(semis);
    };

    const renderScoreTooltip = (log?: ScoreLog) => {
        if (!log) return null;

        const group = (items: ScoreLog['bonuses'] | ScoreLog['penalties'], predicates: Array<{ title: string; test: (reason: string) => boolean }>) => {
            const grouped = predicates.map((predicate) => ({
                title: predicate.title,
                items: items.filter((item) => predicate.test(item.reason))
            })).filter((bucket) => bucket.items.length > 0);

            const groupedItems = new Set(grouped.flatMap((bucket) => bucket.items));
            const remaining = items.filter((item) => !groupedItems.has(item));
            if (remaining.length > 0) grouped.push({ title: 'Other', items: remaining });
            return grouped;
        };

        const bonusGroups = group(log.bonuses, [
            { title: 'Compactness', test: (reason) => reason.startsWith('B_compactness:') },
            { title: 'Polyphony / Harmony Rewards', test: (reason) => reason.startsWith('Polyphony density') || reason.startsWith('Harmony:') }
        ]);
        const penaltyGroups = group(log.penalties, [
            { title: 'Quality Metrics (S1/S2/S3)', test: (reason) => reason.startsWith('S1:') || reason.startsWith('S2:') || reason.startsWith('S3:') },
            { title: 'Distance Constraints', test: (reason) => reason.startsWith('P_distance:') },
            { title: 'Structure Constraints', test: (reason) => reason.startsWith('P_truncation:') || reason.startsWith('P_missing_steps:') || reason.startsWith('P_monotony') }
        ]);

        return (
            <div className="absolute right-0 top-full mt-2 z-50 w-[28rem] bg-black border border-gray-600 rounded p-3 shadow-xl text-xs text-gray-300">
                <div className="font-bold text-gray-200 border-b border-gray-600 pb-1 mb-2">Score Breakdown ({log.total.toFixed(0)})</div>
                <div className="flex justify-between mb-2 text-gray-400"><span>Base</span><span>{log.base}</span></div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-primary mb-1">Rewards</div>
                {bonusGroups.map((grouping, gi) => (
                    <div key={`bg-${gi}`} className="mb-1">
                        <div className="text-[10px] text-green-300/80">{grouping.title}</div>
                        {grouping.items.map((b, i) => (
                            <div key={`b-${gi}-${i}`} className="flex justify-between text-green-400"><span>+ {b.reason}</span><span>{b.points}</span></div>
                        ))}
                    </div>
                ))}
                <div className="text-[10px] font-semibold uppercase tracking-wide text-red-300 mt-2 mb-1">Penalties</div>
                {penaltyGroups.map((grouping, gi) => (
                    <div key={`pg-${gi}`} className="mb-1">
                        <div className="text-[10px] text-red-300/80">{grouping.title}</div>
                        {grouping.items.map((p, i) => (
                            <div key={`p-${gi}-${i}`} className="flex justify-between text-red-400"><span>- {p.reason}</span><span>{p.points}</span></div>
                        ))}
                    </div>
                ))}
            </div>
        );
    };

    const renderMetricBadge = (label: string, value: number, tooltip: string) => {
        let color = 'text-green-400 border-green-900/50 bg-green-900/20';
        if (value > 0.4) color = 'text-red-400 border-red-900/50 bg-red-900/20';
        else if (value > 0.2) color = 'text-yellow-400 border-yellow-900/50 bg-yellow-900/20';
        
        return (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${color}`} title={tooltip}>
                <span className="text-[9px] uppercase font-bold opacity-70">{label}</span>
                <span className="text-[10px] font-mono font-bold">{Math.round(value * 100)}%</span>
            </div>
        );
    };

    const renderChainBadges = (entries: StrettoChainOption[], isSub: boolean = false) => {
        const maxV = Math.max(...entries.map(e => e.voiceIndex)) + 1;
        const totalEstimate = Math.max(4, maxV); 

        return entries.map((e, idx) => {
            const vCode = getVoiceCode(e.voiceIndex, totalEstimate, voiceNames);
            
            if (idx === 0) {
                return (
                    <div key={idx} className={`flex flex-col items-center bg-gray-800 p-1 rounded border border-gray-700 ${isSub ? 'min-w-[40px] scale-90 origin-left' : 'min-w-[50px]'}`}>
                        <span className="text-[10px] font-bold text-brand-primary truncate max-w-[50px]" title={vCode}>{vCode}</span>
                        <span className="text-xs text-white font-mono">Subj</span>
                    </div>
                );
            }

            const absInt = e.transposition; 
            const prev = entries[idx-1];
            const relDist = e.startBeat - prev.startBeat;
            const absDist = e.startBeat;

            let typeLabel = e.type === 'I' ? 'INV' : 'NOR';
            let lenLabel = e.length < entries[0].length ? 'TRC' : 'FUL';
            
            const borderClass = (e.type === 'I' || lenLabel === 'TRC') ? 'border-brand-primary' : 'border-gray-600';

            return (
                <div key={idx} className={`flex flex-col bg-gray-800 p-1 rounded border ${borderClass} ${isSub ? 'min-w-[50px] scale-90 origin-left' : 'min-w-[60px]'}`}>
                    <div className="flex justify-between border-b border-gray-700 pb-0.5 mb-0.5">
                        <span className="text-[9px] font-bold text-gray-300 truncate max-w-[40px]" title={vCode}>{vCode}</span>
                        <span className={`text-[8px] font-bold ${lenLabel === 'TRC' ? 'text-orange-300' : 'text-gray-500'}`}>{lenLabel}</span>
                    </div>
                    
                    <div className="flex flex-col items-center mb-0.5">
                        <span className="text-[10px] text-brand-primary font-bold">{formatInterval(absInt)}</span>
                        {e.type === 'I' && <span className="text-[8px] text-blue-300">INVERT</span>}
                    </div>

                    <div className="flex gap-1 text-[9px] font-mono" title={`Delay: +${formatQuarterNoteUnits(relDist)} / Start: @${formatQuarterNoteUnits(absDist)}`}>
                        <span className="text-gray-400 w-1/2 text-center border-r border-gray-700">+{formatQuarterNoteUnits(relDist)}</span>
                        <span className="text-white w-1/2 text-center">@{formatQuarterNoteUnits(absDist)}</span>
                    </div>
                </div>
            );
        });
    };

    return (
        <div className="overflow-y-auto max-h-[500px] pb-20">
            {sortedResults.map((res, i) => {
                const hasVariations = res.variations && res.variations.length > 0;
                const isExpanded = expandedIds.has(res.id);
                const isSelected = selectedId === res.id;
                const showTooltip = scoreTooltipId === res.id;

                return (
                    <div key={res.id} className="border-b border-gray-700 bg-gray-900/50 relative">
                        {/* Leader Row */}
                        <div 
                            onClick={() => onSelect(res)}
                            className={`p-2 cursor-pointer hover:bg-gray-800 transition-colors flex flex-col gap-2 ${isSelected ? 'bg-gray-800 border-l-4 border-l-brand-primary' : ''}`}
                        >
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                    {hasVariations && (
                                        <button 
                                            onClick={(e) => toggleExpand(e, res.id)}
                                            className="text-gray-400 hover:text-white text-xs bg-gray-700 px-1.5 rounded"
                                        >
                                            {isExpanded ? '▼' : '▶'}
                                        </button>
                                    )}
                                    <span className="font-bold text-gray-300 text-xs">Chain #{i + 1}</span>
                                    {hasVariations && (
                                        <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-1.5 rounded">
                                            +{res.variations?.length} Vars
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                    {renderMetricBadge("DISS", res.dissonanceRatio || 0, "Dissonance Ratio (S1/S2)")}
                                    {renderMetricBadge("NCT", res.nctRatio || 0, "Non-Chord Tone Ratio (S3)")}
                                    
                                    <div className="relative">
                                        <button 
                                            onMouseEnter={() => setScoreTooltipId(res.id)}
                                            onMouseLeave={() => setScoreTooltipId(null)}
                                            className="text-[9px] bg-black/30 px-1.5 rounded text-gray-500 hover:text-white cursor-help"
                                        >
                                            Score: {res.score.toFixed(0)}
                                        </button>
                                        {showTooltip && renderScoreTooltip(res.scoreLog)}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Detected Chords Summary */}
                            {res.detectedChords && res.detectedChords.length > 0 && (
                                <div className="flex gap-1 overflow-hidden">
                                    {res.detectedChords.map((c, idx) => (
                                        <span key={idx} className="text-[9px] text-gray-400 bg-black/20 px-1 rounded whitespace-nowrap">{c}</span>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {renderChainBadges(res.entries)}
                            </div>
                        </div>

                        {/* Variations Sub-list */}
                        {hasVariations && isExpanded && (
                            <div className="bg-black/30 border-t border-gray-800 pl-4 py-1">
                                {[...res.variations!].sort((a, b) => b.score - a.score).map((v, vIdx) => {
                                    const isVarSelected = selectedId === v.id;
                                    return (
                                        <div 
                                            key={v.id} 
                                            onClick={() => onSelect(v)}
                                            className={`p-2 border-l border-gray-700 hover:bg-gray-800/50 cursor-pointer transition-colors ${isVarSelected ? 'bg-gray-800/80 border-l-2 border-l-brand-secondary' : ''}`}
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                                    <span className="text-[10px] font-bold text-gray-500">Variation {vIdx + 1}</span>
                                                    {renderMetricBadge("DISS", v.dissonanceRatio || 0, "Dissonance Ratio (S1/S2)")}
                                                    {renderMetricBadge("NCT", v.nctRatio || 0, "NCT Ratio")}
                                                </div>
                                                <span className="text-[9px] text-gray-600">Score: {v.score.toFixed(0)}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1 opacity-90">
                                                {renderChainBadges(v.entries, true)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
