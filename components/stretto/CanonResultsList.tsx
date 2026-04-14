
import React, { useMemo, useState } from 'react';
import { CanonChainResult, ScoreLog, CanonInversionPattern } from '../../types';
import { getIntervalLabel } from '../services/midiSpelling';

interface CanonResultsListProps {
    results: CanonChainResult[];
    selectedId: string | null;
    onSelect: (res: CanonChainResult) => void;
    onPlay?: (res: CanonChainResult) => void;
    onDownload?: (res: CanonChainResult) => void;
    isPlaying?: boolean;
}

const STEP_LABELS: Array<[number, string]> = [
    [0, 'Unison'],
    [5, 'P4↑'],   [-5, 'P4↓'],
    [7, 'P5↑'],   [-7, 'P5↓'],
    [12, 'P8↑'],  [-12, 'P8↓'],
    [15, 'm10↑'], [-15, 'm10↓'],
    [16, 'M10↑'], [-16, 'M10↓'],
    [17, 'P11↑'], [-17, 'P11↓'],
    [19, 'P12↑'], [-19, 'P12↓'],
    [24, 'P15↑'], [-24, 'P15↓'],
    [3, 'm3↑'],   [-3, 'm3↓'],
    [4, 'M3↑'],   [-4, 'M3↓'],
    [8, 'm6↑'],   [-8, 'm6↓'],
    [9, 'M6↑'],   [-9, 'M6↓'],
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

// ---------------------------------------------------------------------------
// Condensed score tooltip
// ---------------------------------------------------------------------------

interface ScoreGroup {
    label: string;
    net: number;
    color: string;
}

function buildScoreGroups(log: ScoreLog): ScoreGroup[] {
    const sum = (items: { reason: string; points: number }[], ...keywords: string[]) =>
        items
            .filter(it => keywords.some(k => it.reason.toLowerCase().includes(k.toLowerCase())))
            .reduce((s, it) => s + it.points, 0);

    const harmonyBonus =
        sum(log.bonuses, 'triad', '7th', '6th', 'chord', 'harmony');
    const dissonanceNet =
        sum(log.bonuses, 'resolv', 'dissonance resolv') -
        sum(log.penalties, 'dissonance');
    const voiceLeadingPenalty =
        sum(log.penalties, 'parallel', 'unison');
    const nctPenalty =
        sum(log.penalties, 'nct', 'non-chord');
    const structureNet =
        sum(log.bonuses, 'step', 'chain step') -
        sum(log.penalties, 'truncat');

    const groups: ScoreGroup[] = [
        { label: 'Harmony', net: harmonyBonus, color: harmonyBonus >= 0 ? 'text-green-400' : 'text-red-400' },
        { label: 'Dissonance', net: dissonanceNet, color: dissonanceNet >= 0 ? 'text-green-400' : 'text-orange-400' },
        { label: 'Voice Leading', net: -voiceLeadingPenalty, color: voiceLeadingPenalty === 0 ? 'text-green-400' : 'text-red-400' },
        { label: 'NCT', net: -nctPenalty, color: nctPenalty === 0 ? 'text-green-400' : 'text-yellow-400' },
        { label: 'Structure', net: structureNet, color: structureNet >= 0 ? 'text-green-400' : 'text-red-400' },
    ];

    return groups.filter(g => g.net !== 0);
}

function renderScoreTooltip(log: ScoreLog) {
    const groups = buildScoreGroups(log);
    return (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-black border border-gray-600 rounded p-2.5 shadow-xl text-xs text-gray-300">
            <div className="font-bold text-gray-200 border-b border-gray-600 pb-1 mb-2 text-[11px]">
                Score: {log.total.toFixed(0)}
            </div>
            {groups.map((g, i) => (
                <div key={i} className="flex justify-between items-center text-[10px] py-0.5">
                    <span className="text-gray-400">{g.label}</span>
                    <span className={`font-mono font-bold ${g.color}`}>
                        {g.net > 0 ? '+' : ''}{g.net.toFixed(0)}
                    </span>
                </div>
            ))}
            {groups.length === 0 && (
                <div className="text-gray-600 text-[10px]">No scored events</div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------

interface DelayStat { delay: number; count: number; best: number; }
interface LengthStat { length: number; count: number; best: number; }

function buildSummaryStats(results: CanonChainResult[]): { byDelay: DelayStat[]; byLength: LengthStat[] } {
    const delayMap = new Map<number, { count: number; best: number }>();
    const lengthMap = new Map<number, { count: number; best: number }>();

    for (const r of results) {
        const d = delayMap.get(r.delayBeats) ?? { count: 0, best: -Infinity };
        delayMap.set(r.delayBeats, { count: d.count + 1, best: Math.max(d.best, r.score) });

        const l = lengthMap.get(r.chainLength) ?? { count: 0, best: -Infinity };
        lengthMap.set(r.chainLength, { count: l.count + 1, best: Math.max(l.best, r.score) });
    }

    return {
        byDelay: Array.from(delayMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([delay, v]) => ({ delay, ...v })),
        byLength: Array.from(lengthMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([length, v]) => ({ length, ...v })),
    };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CanonResultsList({
    results,
    selectedId,
    onSelect,
    onPlay,
    onDownload,
    isPlaying,
}: CanonResultsListProps) {
    const [delayFilter, setDelayFilter] = useState<number | null>(null);
    const [lengthFilter, setLengthFilter] = useState<number | null>(null);
    const [tooltipId, setTooltipId] = useState<string | null>(null);
    const [showStats, setShowStats] = useState(false);

    const uniqueDelays = useMemo(
        () => Array.from(new Set(results.map(r => r.delayBeats))).sort((a, b) => a - b),
        [results]
    );
    const uniqueLengths = useMemo(
        () => Array.from(new Set(results.map(r => r.chainLength))).sort((a, b) => a - b),
        [results]
    );

    const filtered = useMemo(() => {
        if (results.length === 0) return [];
        let base = results;
        if (delayFilter !== null) base = base.filter(r => r.delayBeats === delayFilter);
        if (lengthFilter !== null) base = base.filter(r => r.chainLength === lengthFilter);
        return [...base].sort((a, b) => b.score - a.score);
    }, [results, delayFilter, lengthFilter]);

    const stats = useMemo(() => buildSummaryStats(results), [results]);

    const selectedResult = results.find(r => r.id === selectedId) ?? null;

    if (results.length === 0) {
        return (
            <div className="text-center text-gray-500 py-10 text-sm">
                No results yet. Run Canon Search to begin.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {/* Play / Download bar for selected result */}
            {selectedResult && (onPlay || onDownload) && (
                <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded px-3 py-1.5">
                    <span className="text-[10px] text-gray-500 mr-1">Selected:</span>
                    <span className="text-xs font-bold text-gray-200 mr-auto">
                        {selectedResult.delayBeats}b · {selectedResult.chainLength} entries · {labelStep(selectedResult.transpositionStep)}
                    </span>
                    {onPlay && (
                        <button
                            onClick={() => onPlay(selectedResult)}
                            className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded bg-brand-primary hover:bg-brand-secondary text-white transition-colors"
                        >
                            {isPlaying ? '■ Stop' : '▶ Play'}
                        </button>
                    )}
                    {onDownload && (
                        <button
                            onClick={() => onDownload(selectedResult)}
                            className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                        >
                            ↓ MIDI
                        </button>
                    )}
                </div>
            )}

            {/* Filter controls */}
            <div className="flex flex-col gap-2 bg-gray-900 p-2 rounded border border-gray-700">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest w-12">Delay</span>
                    <button
                        onClick={() => setDelayFilter(null)}
                        className={`px-2 py-0.5 text-[10px] rounded border font-mono transition-colors ${delayFilter === null ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                    >
                        All
                    </button>
                    {uniqueDelays.map(v => (
                        <button
                            key={v}
                            onClick={() => setDelayFilter(delayFilter === v ? null : v)}
                            className={`px-2 py-0.5 text-[10px] rounded border font-mono transition-colors ${delayFilter === v ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                        >
                            {v}b
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest w-12">Length</span>
                    <button
                        onClick={() => setLengthFilter(null)}
                        className={`px-2 py-0.5 text-[10px] rounded border font-mono transition-colors ${lengthFilter === null ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                    >
                        All
                    </button>
                    {uniqueLengths.map(v => (
                        <button
                            key={v}
                            onClick={() => setLengthFilter(lengthFilter === v ? null : v)}
                            className={`px-2 py-0.5 text-[10px] rounded border font-mono transition-colors ${lengthFilter === v ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                        >
                            {v}
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[9px] text-gray-600 font-mono">
                        {filtered.length} / {results.length} shown
                    </span>
                    <button
                        onClick={() => setShowStats(s => !s)}
                        className="text-[9px] text-gray-500 hover:text-gray-300 underline"
                    >
                        {showStats ? 'Hide stats' : 'Show stats'}
                    </button>
                </div>
            </div>

            {/* Summary statistics */}
            {showStats && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-900 border border-gray-700 rounded p-2">
                        <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Best by Delay</div>
                        {stats.byDelay.map(({ delay, count, best }) => (
                            <div key={delay} className="flex justify-between text-[9px] py-0.5">
                                <span className="text-gray-400 font-mono">{delay}b</span>
                                <span className="text-gray-500">{count}</span>
                                <span className={`font-mono font-bold ${best >= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                    {best.toFixed(0)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="bg-gray-900 border border-gray-700 rounded p-2">
                        <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Best by Length</div>
                        {stats.byLength.map(({ length, count, best }) => (
                            <div key={length} className="flex justify-between text-[9px] py-0.5">
                                <span className="text-gray-400 font-mono">{length} entries</span>
                                <span className="text-gray-500">{count}</span>
                                <span className={`font-mono font-bold ${best >= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                    {best.toFixed(0)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Results list */}
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

                                {/* Score — larger and color-coded, condensed tooltip on hover */}
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
                                        className={`text-sm font-bold px-2.5 py-0.5 rounded cursor-help font-mono border transition-colors
                                            ${res.score >= 0
                                                ? 'bg-green-900/30 text-green-300 border-green-700/40 hover:border-green-500'
                                                : 'bg-red-900/20 text-red-300 border-red-700/40 hover:border-red-500'}`}
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
                                            <span className="font-bold text-gray-300">V{e.voiceIndex}</span>
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
