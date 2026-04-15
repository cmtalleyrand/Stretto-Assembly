import React from 'react';
import { getStrictPitchName } from '../services/midiSpelling';
import { PivotSearchMetric, PIVOT_OBJECTIVE_WEIGHTS } from '../services/pairwisePivotSearch';

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
type PivotMetricKey = 'viable' | 'avgDiss' | 'delay' | 'vwDiss' | 'objective';

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
    pivotOptions: number[];
    constrainedPivotCount: number;
    onFindOptimalPivot: () => void;
    pivotSearchResults: PivotSearchMetric[];
}

function toPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function renderMetricBar(value: number, invert = false): React.ReactElement {
    const bounded = Math.min(1, Math.max(0, value));
    const normalized = invert ? 1 - bounded : bounded;
    return (
        <div className="h-1.5 w-full bg-gray-800 rounded">
            <div className="h-1.5 rounded bg-brand-primary" style={{ width: `${Math.round(normalized * 100)}%` }} />
        </div>
    );
}

function metricLabel(key: PivotMetricKey): string {
    switch (key) {
        case 'viable': return 'Viable pair %';
        case 'avgDiss': return 'Avg viable dissonance %';
        case 'delay': return 'Delay coverage %';
        case 'vwDiss': return 'Variety-weighted delay dissonance %';
        case 'objective': return 'Objective score';
    }
}

function metricCalculation(row: PivotSearchMetric, key: PivotMetricKey): string {
    switch (key) {
        case 'viable':
            return `viablePairRate = viablePairs / totalPairs = ${row.viablePairs} / ${row.totalPairs} = ${toPercent(row.viablePairRate)}`;
        case 'avgDiss':
            return `averageViableDissonance = mean(dissonanceRatio | viable pair). Displayed value = ${toPercent(row.averageViableDissonance)}.`;
        case 'delay':
            return `delayCoverageRate = delaysWithViablePairs / totalDelays = ${row.delaysWithViablePairs} / ${row.totalDelays} = ${toPercent(row.delayCoverageRate)}`;
        case 'vwDiss':
            return `Per delay: sort viable dissonance ascending, apply weights 1,1/2,1/4,...; then mean across all delays. Result = ${toPercent(row.varietyWeightedDelayDissonance)}.`;
        case 'objective':
            return `objectiveScore = ${PIVOT_OBJECTIVE_WEIGHTS.viablePairRate.toFixed(1)}·viablePairRate + ${PIVOT_OBJECTIVE_WEIGHTS.delayCoverageRate.toFixed(1)}·delayCoverageRate + ${PIVOT_OBJECTIVE_WEIGHTS.inverseVarietyWeightedDelayDissonance.toFixed(1)}·(1−varietyWeightedDelayDissonance) = ${(row.objectiveScore * 100).toFixed(2)}%.`;
    }
}

export default function StrettoConfig({
    selectedIntervals, setSelectedIntervals,
    searchRes, setSearchRes,
    includeInversions, setIncludeInversions,
    includeExtensions, setIncludeExtensions,
    pivotMidi, setPivotMidi,
    pivotOptions,
    constrainedPivotCount,
    onFindOptimalPivot,
    pivotSearchResults
}: StrettoConfigProps) {

    const [activeMetric, setActiveMetric] = React.useState<PivotMetricKey>('objective');

    const toggleInterval = (val: number, checked: boolean) => {
        if (checked) {
            if (!selectedIntervals.includes(val)) setSelectedIntervals([...selectedIntervals, val]);
        } else {
            setSelectedIntervals(selectedIntervals.filter(c => c !== val));
        }
    };

    const best = pivotSearchResults[0] ?? null;
    const activeRow = pivotSearchResults.find((r) => r.pivotMidi === pivotMidi) ?? null;
    const metricRow = activeRow ?? best;

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
                                {pivotOptions.map((m) => (
                                    <option key={m} value={m} className="bg-gray-800">{getStrictPitchName(m)}</option>
                                ))}
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

                <div className="mt-3 border-t border-gray-700 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase">Optimal Pivot Search</div>
                            <div className="text-[10px] text-gray-500">Subject-note constrained candidates: <span className="font-mono text-gray-300">{constrainedPivotCount}</span></div>
                        </div>
                        <button
                            type="button"
                            onClick={onFindOptimalPivot}
                            disabled={!includeInversions}
                            className="px-3 py-1.5 text-[11px] rounded bg-brand-primary text-white font-bold shadow transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-brand-secondary"
                            title={includeInversions ? 'Evaluate every candidate pivot and rank by objective score.' : 'Enable + Inversions to activate optimal pivot search.'}
                        >
                            Find Best Pivot
                        </button>
                    </div>
                    {!includeInversions && (
                        <p className="text-[10px] text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1">
                            Enable <span className="font-semibold">+ Inversions</span> to activate pivot optimization.
                        </p>
                    )}

                    {includeInversions && (
                        <>

                        <details className="bg-gray-900/50 border border-gray-700 rounded p-2 group">
                            <summary className="text-[10px] text-gray-300 font-semibold cursor-pointer list-none flex items-center justify-between">
                                <span>Metric definitions & calculation breakdown</span>
                                <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
                            </summary>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px] text-gray-400">
                                {(['viable', 'avgDiss', 'delay', 'vwDiss', 'objective'] as PivotMetricKey[]).map((key) => (
                                    <button type="button"
                                        key={key}
                                        onClick={() => setActiveMetric(key)}
                                        className={`text-left bg-gray-900 border rounded p-2 transition-colors ${activeMetric === key ? 'border-brand-primary text-gray-200' : 'border-gray-700 hover:border-gray-500'}`}
                                    >
                                        <span className="font-semibold">{metricLabel(key)}</span>
                                        <span className="block mt-1 text-[9px] text-gray-500">Tap to inspect formula on selected row.</span>
                                    </button>
                                ))}
                            </div>
                        </details>

                        {metricRow && (
                            <div className="text-[10px] text-gray-300 bg-gray-900/60 border border-gray-700 rounded px-2 py-1.5">
                                <span className="text-gray-400">Search pivot:</span> <span className="font-semibold text-brand-primary">{getStrictPitchName(pivotMidi)}</span>
                                <span className="text-gray-500"> · Metric row:</span> <span className="font-semibold text-gray-200">{getStrictPitchName(metricRow.pivotMidi)}</span>
                                <span className="text-gray-500"> · {metricLabel(activeMetric)}</span>
                                <div className="mt-1 font-mono text-[10px] text-gray-200">{metricCalculation(metricRow, activeMetric)}</div>
                            </div>
                        )}

                        {best && (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                <button type="button" onClick={() => { setPivotMidi(best.pivotMidi); setActiveMetric('objective'); }} className="bg-gray-900 border border-gray-700 rounded p-2 text-left hover:border-brand-primary transition-colors">
                                    <div className="text-[9px] text-gray-400">Best Pivot</div>
                                    <div className="text-sm font-bold text-brand-primary">{getStrictPitchName(best.pivotMidi)}</div>
                                    <div className="text-[9px] text-gray-500">rank #1</div>
                                </button>
                                <button type="button" onClick={() => { setPivotMidi(best.pivotMidi); setActiveMetric('viable'); }} className="bg-gray-900 border border-gray-700 rounded p-2 text-left hover:border-brand-primary transition-colors">
                                    <div className="text-[9px] text-gray-400">Viable Pairs</div>
                                    <div className="text-sm font-mono text-gray-100">{toPercent(best.viablePairRate)}</div>
                                    <div className="text-[9px] text-gray-500">{best.viablePairs}/{best.totalPairs}</div>
                                    {renderMetricBar(best.viablePairRate)}
                                </button>
                                <button type="button" onClick={() => { setPivotMidi(best.pivotMidi); setActiveMetric('delay'); }} className="bg-gray-900 border border-gray-700 rounded p-2 text-left hover:border-brand-primary transition-colors">
                                    <div className="text-[9px] text-gray-400">Delay Coverage</div>
                                    <div className="text-sm font-mono text-gray-100">{toPercent(best.delayCoverageRate)}</div>
                                    <div className="text-[9px] text-gray-500">{best.delaysWithViablePairs}/{best.totalDelays}</div>
                                    {renderMetricBar(best.delayCoverageRate)}
                                </button>
                                <button type="button" onClick={() => { setPivotMidi(best.pivotMidi); setActiveMetric('vwDiss'); }} className="bg-gray-900 border border-gray-700 rounded p-2 text-left hover:border-brand-primary transition-colors">
                                    <div className="text-[9px] text-gray-400">Vw Delay Diss.</div>
                                    <div className="text-sm font-mono text-gray-100">{toPercent(best.varietyWeightedDelayDissonance)}</div>
                                    <div className="text-[9px] text-gray-500">lower is better</div>
                                    {renderMetricBar(best.varietyWeightedDelayDissonance, true)}
                                </button>
                            </div>
                        )}

                        {pivotSearchResults.length > 0 && (
                            <div className="border border-gray-700 rounded overflow-hidden">
                                <div className="grid grid-cols-6 bg-gray-900/80 text-[9px] text-gray-400 uppercase tracking-wide px-2 py-1.5">
                                    <div>Pivot</div>
                                    <button type="button" onClick={() => setActiveMetric('viable')} className="text-right hover:text-gray-200">Viable</button>
                                    <button type="button" onClick={() => setActiveMetric('avgDiss')} className="text-right hover:text-gray-200">Avg Diss</button>
                                    <button type="button" onClick={() => setActiveMetric('delay')} className="text-right hover:text-gray-200">Delay</button>
                                    <button type="button" onClick={() => setActiveMetric('vwDiss')} className="text-right hover:text-gray-200">Vw Diss</button>
                                    <button type="button" onClick={() => setActiveMetric('objective')} className="text-right hover:text-gray-200">Score</button>
                                </div>
                                <div className="max-h-40 overflow-y-auto">
                                    {pivotSearchResults.slice(0, 12).map((row, idx) => (
                                        <button type="button"
                                            key={row.pivotMidi}
                                            onClick={() => { setPivotMidi(row.pivotMidi); }}
                                            className={`w-full grid grid-cols-6 text-[10px] px-2 py-2 border-t border-gray-800 transition-colors text-left ${row.pivotMidi === pivotMidi ? 'bg-brand-primary/15' : idx === 0 ? 'bg-brand-primary/12' : 'bg-gray-900/40 text-gray-300 hover:bg-gray-900/70'}`}
                                        >
                                            <div className={`${idx === 0 ? 'text-brand-primary font-bold' : 'text-gray-200'}`}>{getStrictPitchName(row.pivotMidi)}</div>
                                            <div className="text-right font-mono">{toPercent(row.viablePairRate)}</div>
                                            <div className="text-right font-mono">{toPercent(row.averageViableDissonance)}</div>
                                            <div className="text-right font-mono">{toPercent(row.delayCoverageRate)}</div>
                                            <div className="text-right font-mono">{toPercent(row.varietyWeightedDelayDissonance)}</div>
                                            <div className="text-right font-mono text-gray-500">{(row.objectiveScore * 100).toFixed(1)}%</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>

            <div className="p-4 bg-gray-800 rounded border border-gray-700 shadow-sm">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest">Entry Resolution</h3>
                <div className="grid grid-cols-3 gap-2">
                    {(['half', 'full', 'double'] as SearchResolution[]).map(res => (
                        <button type="button"
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
