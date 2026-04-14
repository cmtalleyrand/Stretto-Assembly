
import React, { useMemo, useState } from 'react';
import { CanonChainResult, ScoreLog, CanonInversionPattern } from '../../types';
import { getIntervalLabel } from '../services/midiSpelling';
import { getVoiceLabel } from '../services/midiVoices';

interface CanonResultsListProps {
    results: CanonChainResult[];
    selectedId: string | null;
    onSelect: (res: CanonChainResult) => void;
}

type FilterMode = 'delay' | 'length';

const STEP_LABELS: Array<[number, string]> = [
    [0, 'Unison'],
    [5, 'P4↑'], [-5, 'P4↓'],
    [7, 'P5↑'], [-7, 'P5↓'],
    [12, 'Oct↑'], [-12, 'Oct↓'],
    [24, '2Oct↑'], [-24, '2Oct↓'],
    [3, 'm3↑'], [-3, 'm3↓'],
    [4, 'M3↑'], [-4, 'M3↓'],
    [8, 'm6↑'], [-8, 'm6↓'],
    [9, 'M6↑'], [-9, 'M6↓'],
];

function labelStep(t: number): string {
    const found = STEP_LABELS.find(([v]) => v === t);
    if (found) return found[1];
    return t > 0 ? `+${t}st` : `${t}st`;
}

function labelPattern(p: CanonInversionPattern): string {
    switch (p) {
        case 'none': return 'Normal';
        case 'alternating': return 'Alt.Inv';
        case 'all-inverted': return 'All Inv';
    }
}

function renderScoreTooltip(log: ScoreLog) {
    const totalBonus = log.bonuses.reduce((s, b) => s + b.points, 0);
    const totalPenalty = log.penalties.reduce((s, p) => s + p.points, 0);
    return (
        <div className="absolute right-0 top-full mt-1 z-50 w-[26rem] bg-black border border-gray-600 rounded p-3 shadow-xl text-xs text-gray-300">
            <div className="font-bold text-gray-200 border-b border-gray-600 pb-1 mb-2">
                Score Breakdown ({log.total.toFixed(0)})
            </div>
            {log.bonuses.length > 0 && (
                <>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-green-400 mb-1">
                        Rewards (+{totalBonus})
                    </div>
                    {log.bonuses.map((b, i) => (
                        <div key={i} className="flex justify-between text-green-400 text-[10px]">
                            <span>+ {b.reason}</span>
                            <span className="ml-2 shrink-0">{b.points}</span>
                        </div>
                    ))}
                </>
            )}
            {log.penalties.length > 0 && (
                <>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-red-400 mt-2 mb-1">
                        Penalties (−{totalPenalty})
                    </div>
                    {log.penalties.map((p, i) => (
                        <div key={i} className="flex justify-between text-red-400 text-[10px]">
                            <span>− {p.reason}</span>
                            <span className="ml-2 shrink-0">{p.points}</span>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

export default function CanonResultsList({ results, selectedId, onSelect }: CanonResultsListProps) {
    const [filterMode, setFilterMode] = useState<FilterMode>('delay');
    const [filterValue, setFilterValue] = useState<number | null>(null);
    const [tooltipId, setTooltipId] = useState<string | null>(null);

    // Collect unique delays and chain lengths for filter controls
    const uniqueDelays = useMemo(
        () => Array.from(new Set(results.map(r => r.delayBeats))).sort((a, b) => a - b),
        [results]
    );
    const uniqueLengths = useMemo(
        () => Array.from(new Set(results.map(r => r.chainLength))).sort((a, b) => a - b),
        [results]
    );

    // Active filter value defaults to first option
    const activeFilter = filterValue ?? (filterMode === 'delay' ? uniqueDelays[0] : uniqueLengths[0]);

    const filtered = useMemo(() => {
        if (results.length === 0) return [];
        const base = filterMode === 'delay'
            ? results.filter(r => r.delayBeats === activeFilter)
            : results.filter(r => r.chainLength === activeFilter);
        return [...base].sort((a, b) => b.score - a.score);
    }, [results, filterMode, activeFilter]);

    if (results.length === 0) {
        return (
            <div className="text-center text-gray-500 py-10 text-sm">
                No results yet. Run Canon Search to begin.
            </div>
        );
    }

    const filterOptions = filterMode === 'delay' ? uniqueDelays : uniqueLengths;

    return (
        <div className="flex flex-col gap-2">
            {/* Filter controls */}
            <div className="flex items-center gap-3 flex-wrap bg-gray-900 p-2 rounded border border-gray-700">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">View by</span>
                <div className="flex gap-1">
                    <button
                        onClick={() => { setFilterMode('delay'); setFilterValue(null); }}
                        className={`px-3 py-1 text-xs rounded border font-bold transition-colors ${filterMode === 'delay' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                    >
                        Delay
                    </button>
                    <button
                        onClick={() => { setFilterMode('length'); setFilterValue(null); }}
                        className={`px-3 py-1 text-xs rounded border font-bold transition-colors ${filterMode === 'length' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                    >
                        Chain Length
                    </button>
                </div>

                <div className="flex gap-1 flex-wrap">
                    {filterOptions.map(v => (
                        <button
                            key={v}
                            onClick={() => setFilterValue(v)}
                            className={`px-2 py-0.5 text-[10px] rounded border font-mono transition-colors ${activeFilter === v ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                        >
                            {filterMode === 'delay' ? `${v}b` : `${v}`}
                        </button>
                    ))}
                </div>

                <span className="ml-auto text-[9px] text-gray-600 font-mono">
                    {filtered.length} / {results.length} shown
                </span>
            </div>

            {/* Results */}
            <div className="overflow-y-auto max-h-[480px]">
                {filtered.map((res, i) => {
                    const isSelected = selectedId === res.id;
                    const showTooltip = tooltipId === res.id;

                    return (
                        <div
                            key={res.id}
                            onClick={() => onSelect(res)}
                            className={`
                                border-b border-gray-700 p-2 cursor-pointer hover:bg-gray-800 transition-colors
                                ${isSelected ? 'bg-gray-800 border-l-4 border-l-brand-primary' : ''}
                            `}
                        >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                {/* Rank + key params */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-500">#{i + 1}</span>
                                    <span className="text-xs font-bold text-gray-200">
                                        {res.delayBeats}b delay
                                    </span>
                                    <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                                        {res.chainLength} entries
                                    </span>
                                    <span className="text-[10px] bg-gray-700 text-brand-primary px-1.5 py-0.5 rounded font-mono">
                                        {labelStep(res.transpositionStep)}
                                    </span>
                                    <span className="text-[10px] text-gray-500">
                                        {labelPattern(res.inversionPattern)}
                                    </span>
                                    {res.autoTruncatedBeats > 0 && (
                                        <span className="text-[9px] bg-orange-900/40 text-orange-300 px-1 rounded">
                                            trunc {res.autoTruncatedBeats.toFixed(1)}b
                                        </span>
                                    )}
                                </div>

                                {/* Score */}
                                <div className="relative flex items-center gap-2">
                                    {res.detectedChords && res.detectedChords.length > 0 && (
                                        <div className="hidden md:flex gap-1 overflow-hidden max-w-[160px]">
                                            {res.detectedChords.slice(0, 3).map((c, ci) => (
                                                <span key={ci} className="text-[8px] text-gray-500 bg-black/30 px-1 rounded whitespace-nowrap">{c}</span>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        onMouseEnter={() => setTooltipId(res.id)}
                                        onMouseLeave={() => setTooltipId(null)}
                                        onClick={e => e.stopPropagation()}
                                        className="text-[10px] bg-black/30 px-2 py-0.5 rounded text-gray-400 hover:text-white cursor-help font-mono"
                                    >
                                        {res.score.toFixed(0)}
                                    </button>
                                    {showTooltip && res.scoreLog && (
                                        <div className="relative">
                                            {renderScoreTooltip(res.scoreLog)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Entry badges */}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {res.entries.map((e, ei) => {
                                    const delay = ei === 0 ? 0 : e.startBeat - res.entries[ei - 1].startBeat;
                                    return (
                                        <div
                                            key={ei}
                                            className={`flex flex-col items-center bg-gray-800 px-1.5 py-0.5 rounded border text-[9px] min-w-[44px] ${e.type === 'I' ? 'border-brand-primary' : 'border-gray-600'}`}
                                        >
                                            <span className="font-bold text-gray-300">{getVoiceLabel(e.voiceIndex, Math.max(...res.entries.map(en => en.voiceIndex + 1)))}</span>
                                            {ei > 0 && (
                                                <span className="text-gray-500 font-mono">+{delay.toFixed(1)}b</span>
                                            )}
                                            <span className="text-brand-primary font-mono">{getIntervalLabel(e.transposition)}</span>
                                            {e.type === 'I' && <span className="text-blue-400">INV</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <div className="text-center text-gray-600 py-6 text-sm">
                        No results for this filter.
                    </div>
                )}
            </div>
        </div>
    );
}
