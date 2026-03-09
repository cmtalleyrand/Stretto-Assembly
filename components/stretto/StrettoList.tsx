
import React, { useState, useMemo, useEffect } from 'react';
import { StrettoCandidate, StrettoGrade, StrettoListFilterContext, StrettoListSortKey } from '../../types';
import { getStrictPitchName } from '../services/midiSpelling';
import { DocumentTextIcon } from '../Icons';

interface StrettoListProps {
    candidates: StrettoCandidate[];
    processedResults: StrettoCandidate[]; 
    gradeFilter: Record<StrettoGrade, boolean>;
    setGradeFilter: (val: Record<StrettoGrade, boolean>) => void;
    selectedId: string | null;
    onSelect: (candidate: StrettoCandidate) => void;
    checkedIds: Set<string>;
    onToggleCheck: (id: string) => void;
    onFilterContextChange?: (context: StrettoListFilterContext) => void;
}


type SortKey = StrettoListSortKey;

export default function StrettoList({ 
    candidates, processedResults, gradeFilter, setGradeFilter, 
    selectedId, onSelect, checkedIds, onToggleCheck, onFilterContextChange
}: StrettoListProps) {
    const [sortKey, setSortKey] = useState<SortKey>('grade');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    
    // Multi-select Filters
    const [selectedPitches, setSelectedPitches] = useState<Set<string>>(new Set());
    const [selectedIntervals, setSelectedIntervals] = useState<Set<string>>(new Set());
    const [selectedDelays, setSelectedDelays] = useState<Set<string>>(new Set());
    
    // Logic Filters
    const [maxDissonance, setMaxDissonance] = useState<number>(100);
    const [onlyResolved, setOnlyResolved] = useState<boolean>(false);

    // Extract unique values for filter toggles
    const { availablePitches, availableIntervals, availableDelays } = useMemo(() => {
        const pitches = new Set<string>();
        const intervals = new Set<string>();
        const delays = new Set<string>();

        candidates.forEach(c => {
            delays.add(c.delayBeats.toString());
            intervals.add(c.intervalLabel);
            const firstAnswerNote = c.notes.find(n => n.voiceIndex === 1);
            if (firstAnswerNote) {
                pitches.add(getStrictPitchName(firstAnswerNote.midi).replace(/\d/g, ''));
            }
        });

        return {
            availablePitches: Array.from(pitches).sort(),
            availableIntervals: Array.from(intervals).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})),
            availableDelays: Array.from(delays).sort((a,b) => parseFloat(a) - parseFloat(b))
        };
    }, [candidates]);

    // Combined Advanced Filtering
    const finalFilteredResults = useMemo(() => {
        return processedResults.filter(r => {
            if (!gradeFilter[r.grade]) return false;

            if (selectedPitches.size > 0) {
                const firstAnswerNote = r.notes.find(n => n.voiceIndex === 1);
                if (!firstAnswerNote) return false;
                const pName = getStrictPitchName(firstAnswerNote.midi).replace(/\d/g, '');
                if (!selectedPitches.has(pName)) return false;
            }

            if (selectedIntervals.size > 0 && !selectedIntervals.has(r.intervalLabel)) return false;

            if (selectedDelays.size > 0 && !selectedDelays.has(r.delayBeats.toString())) return false;

            if (Math.round(r.dissonanceRatio * 100) > maxDissonance) return false;

            if (onlyResolved && r.endsOnDissonance) return false;

            return true;
        });
    }, [processedResults, gradeFilter, selectedPitches, selectedIntervals, selectedDelays, maxDissonance, onlyResolved]);

    // Sorting Logic
    const sortedResults = useMemo(() => {
        const res = [...finalFilteredResults];
        res.sort((a, b) => {
            let diff = 0;
            const firstA = a.notes.find(n => n.voiceIndex === 1);
            const firstB = b.notes.find(n => n.voiceIndex === 1);

            switch (sortKey) {
                case 'grade':
                    const score = { 'STRONG': 3, 'VIABLE': 2, 'INVALID': 1 };
                    diff = score[a.grade] - score[b.grade];
                    break;
                case 'delay':
                    diff = a.delayTicks - b.delayTicks;
                    break;
                case 'interval':
                    diff = Math.abs(a.intervalSemis) - Math.abs(b.intervalSemis);
                    break;
                case 'dissonance':
                    diff = a.dissonanceRatio - b.dissonanceRatio;
                    break;
                case 'nct':
                    diff = (a.nctRatio || 0) - (b.nctRatio || 0);
                    break;
                case 'intensity':
                    diff = a.pairDissonanceScore - b.pairDissonanceScore;
                    break;
                case 'entry':
                    diff = (firstA?.midi || 0) - (firstB?.midi || 0);
                    break;
                case 'errors':
                    diff = a.errors.length - b.errors.length;
                    break;
            }
            return sortDir === 'asc' ? diff : -diff;
        });
        return res;
    }, [finalFilteredResults, sortKey, sortDir]);

    useEffect(() => {
        if (!onFilterContextChange) return;
        onFilterContextChange({
            selectedPitches: Array.from(selectedPitches.values()) as string[],
            selectedIntervals: (Array.from(selectedIntervals.values()) as string[]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
            selectedDelays: (Array.from(selectedDelays.values()) as string[]).sort((a, b) => parseFloat(a) - parseFloat(b)),
            maxDissonance,
            onlyResolved,
            visibleCount: sortedResults.length,
            totalCount: processedResults.length,
            sortKey,
            sortDir,
        });
    }, [
        onFilterContextChange,
        selectedPitches,
        selectedIntervals,
        selectedDelays,
        maxDissonance,
        onlyResolved,
        sortedResults.length,
        processedResults.length,
        sortKey,
        sortDir,
    ]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir(key === 'grade' || key === 'dissonance' || key === 'nct' || key === 'intensity' ? 'desc' : 'asc'); }
    };

    const handleExport = () => {
        if (sortedResults.length === 0) return;

        let md = `| Interval | Delay | Entry | Diss Time | NCT % | Intensity | Errors |\n`;
        md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

        sortedResults.forEach(r => {
            const firstAnswerNote = r.notes.find(n => n.voiceIndex === 1);
            const entryNote = firstAnswerNote ? getStrictPitchName(firstAnswerNote.midi) : '?';
            const diss = `${Math.round(r.dissonanceRatio * 100)}%`;
            const nct = `${Math.round((r.nctRatio || 0) * 100)}%`;
            const intent = r.pairDissonanceScore.toFixed(1);
            const errs = r.errors.length > 0 ? r.errors.map(e => e.type).join(', ') : '-';
            
            md += `| ${r.intervalLabel} | ${r.delayBeats}B | ${entryNote} | ${diss} | ${nct} | ${intent} | ${errs} |\n`;
        });

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Stretto_Lab_Export_${Date.now()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const toggleFilterSet = (set: Set<string>, val: string) => {
        const next = new Set(set);
        if (next.has(val)) next.delete(val);
        else next.add(val);
        return next;
    };

    const renderToggleGroup = (label: string, items: string[], current: Set<string>, update: (s: Set<string>) => void) => (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{label}</label>
                <button onClick={() => update(new Set())} className="text-[8px] text-brand-primary hover:underline">{current.size === 0 ? 'All' : 'Clear'}</button>
            </div>
            <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto bg-black/20 p-1 rounded border border-gray-700 shadow-inner">
                {items.map(item => (
                    <button
                        key={item}
                        onClick={() => update(toggleFilterSet(current, item))}
                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all border ${current.has(item) ? 'bg-brand-primary border-brand-primary text-white shadow-sm' : 'bg-gray-800 border-gray-600 text-gray-500 hover:border-gray-400'}`}
                    >
                        {item}
                    </button>
                ))}
            </div>
        </div>
    );

    const getMetricColor = (val: number) => {
        if (val > 0.4) return 'text-red-400';
        if (val > 0.2) return 'text-yellow-400';
        return 'text-green-400';
    };

    return (
        <div className="bg-gray-900 border border-gray-700 rounded h-[600px] flex flex-col shadow-inner relative">
            <div className="p-3 border-b border-gray-700 bg-gray-800 flex flex-col gap-4">
                <div className="flex justify-between items-center -mb-2">
                    <h3 className="text-[10px] font-bold text-brand-primary uppercase tracking-tighter">Power Filter</h3>
                    <button 
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-[9px] text-gray-300 rounded border border-gray-600 transition-colors"
                    >
                        <DocumentTextIcon className="w-3.5 h-3.5" /> Export Grid
                    </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {renderToggleGroup("Intervals", availableIntervals, selectedIntervals, setSelectedIntervals)}
                    {renderToggleGroup("Delays", availableDelays, selectedDelays, setSelectedDelays)}
                    {renderToggleGroup("Entry Pitches", availablePitches, selectedPitches, setSelectedPitches)}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-700 pt-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Verdict</label>
                        <div className="flex gap-1">
                            {(['STRONG', 'VIABLE', 'INVALID'] as StrettoGrade[]).map(g => (
                                <button 
                                    key={g}
                                    onClick={() => setGradeFilter({ ...gradeFilter, [g]: !gradeFilter[g] })} 
                                    className={`flex-1 py-1 text-[9px] rounded font-bold border transition-all ${gradeFilter[g] ? 'bg-brand-primary/20 border-brand-primary text-brand-primary' : 'bg-gray-900 border-gray-700 text-gray-600'}`}
                                >
                                    {g.charAt(0)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 bg-gray-900/50 p-2 rounded border border-gray-700">
                        <div className="flex justify-between">
                            <label className="text-[9px] font-bold text-red-300 uppercase tracking-widest">Dissonance Cap</label>
                            <span className="text-[10px] font-bold text-white bg-red-900/50 px-1 rounded">{maxDissonance}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="100" step="1" 
                            value={maxDissonance} 
                            onChange={(e) => setMaxDissonance(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                    </div>

                    <div className="flex flex-col justify-end">
                        <label className={`flex items-center gap-2 p-2 bg-gray-900/50 rounded border cursor-pointer transition-all ${onlyResolved ? 'border-green-500/50 bg-green-900/10' : 'border-gray-700'}`}>
                            <input 
                                type="checkbox" 
                                checked={onlyResolved} 
                                onChange={(e) => setOnlyResolved(e.target.checked)}
                                className="w-3 h-3 rounded bg-gray-800 border-gray-600 text-brand-primary"
                            />
                            <span className={`text-[10px] font-bold uppercase tracking-tight ${onlyResolved ? 'text-green-400' : 'text-gray-500'}`}>Resolved End Only</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="overflow-y-auto flex-grow p-1">
                <div className="sticky top-0 bg-gray-900 z-10 grid grid-cols-12 gap-1 px-2 py-2 text-[9px] font-bold text-gray-500 uppercase border-b border-gray-800 items-center">
                    <div className="col-span-1"></div>
                    <button onClick={() => handleSort('interval')} className={`col-span-2 text-left hover:text-white transition-colors ${sortKey === 'interval' ? 'text-brand-primary' : ''}`}>
                        Int {sortKey === 'interval' && (sortDir === 'asc' ? '↑' : '↓')}
                    </button>
                    <button onClick={() => handleSort('delay')} className={`col-span-1 text-left hover:text-white transition-colors ${sortKey === 'delay' ? 'text-brand-primary' : ''}`}>
                        Del
                    </button>
                    <button onClick={() => handleSort('entry')} className={`col-span-1 text-left hover:text-white transition-colors ${sortKey === 'entry' ? 'text-brand-primary' : ''}`}>
                        Ent
                    </button>
                    
                    {/* Updated Prominent Metrics Headers */}
                    <button onClick={() => handleSort('dissonance')} className={`col-span-2 text-center hover:text-white transition-colors ${sortKey === 'dissonance' ? 'text-brand-primary' : ''}`}>
                        Diss %
                    </button>
                    <button onClick={() => handleSort('nct')} className={`col-span-2 text-center hover:text-white transition-colors ${sortKey === 'nct' ? 'text-brand-primary' : ''}`}>
                        NCT %
                    </button>
                    
                    <button onClick={() => handleSort('intensity')} className={`col-span-2 text-right hover:text-white transition-colors ${sortKey === 'intensity' ? 'text-brand-primary' : ''}`}>
                        Intens
                    </button>
                    <button onClick={() => handleSort('errors')} className={`col-span-1 text-right hover:text-white transition-colors ${sortKey === 'errors' ? 'text-brand-primary' : ''}`}>
                        Err
                    </button>
                </div>

                {sortedResults.length === 0 ? (
                    <div className="py-20 text-center text-gray-600 text-sm italic">No matching strettos. Try widening filters.</div>
                ) : (
                    sortedResults.map((r) => {
                        const firstAnswerNote = r.notes.find(n => n.voiceIndex === 1);
                        const entryNote = firstAnswerNote ? getStrictPitchName(firstAnswerNote.midi) : '?';
                        return (
                            <div 
                                key={r.id} 
                                onClick={() => onSelect(r)} 
                                className={`grid grid-cols-12 gap-1 p-2 rounded cursor-pointer border-b border-gray-800 items-center transition-all ${selectedId === r.id ? 'bg-gray-800 ring-1 ring-brand-primary/50' : 'hover:bg-gray-800/50'}`}
                            >
                                <div className="col-span-1 flex justify-center" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                        type="checkbox" 
                                        checked={checkedIds.has(r.id)} 
                                        onChange={() => onToggleCheck(r.id)} 
                                        className="rounded bg-gray-700 border-gray-600 text-brand-primary w-3 h-3" 
                                    />
                                </div>
                                <span className={`col-span-2 font-bold text-[10px] truncate ${r.intervalLabel.includes('Inv') ? 'text-blue-400' : 'text-brand-primary'}`}>
                                    {r.intervalLabel}
                                </span>
                                <span className="col-span-1 text-gray-300 text-[10px]">{r.delayBeats}B</span>
                                <span className="col-span-1 text-gray-500 text-[10px] font-mono">{entryNote}</span>
                                
                                {/* Prominent Dissonance Metric */}
                                <span className={`col-span-2 text-xs font-mono font-bold text-center ${getMetricColor(r.dissonanceRatio)}`}>
                                    {Math.round(r.dissonanceRatio * 100)}%
                                </span>
                                
                                {/* Prominent NCT Metric */}
                                <span className={`col-span-2 text-xs font-mono font-bold text-center ${getMetricColor(r.nctRatio || 0)}`}>
                                    {Math.round((r.nctRatio || 0) * 100)}%
                                </span>

                                <span className="col-span-2 text-[10px] text-gray-400 font-mono text-right">
                                    {r.pairDissonanceScore.toFixed(1)}
                                </span>
                                <span className="col-span-1 text-[9px] text-gray-500 text-right">
                                    {r.errors.length > 0 ? (
                                        <span className="bg-red-900/30 text-red-400 px-1 rounded border border-red-900/50">{r.errors.length}</span>
                                    ) : '-'}
                                </span>
                            </div>
                        );
                    })
                )}
            </div>
            
            <div className="p-2 border-t border-gray-800 bg-gray-800/50 flex justify-between items-center px-4">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-500 italic">{sortedResults.length} Visible</span>
                    <span className="text-[10px] text-gray-700">|</span>
                    <span className="text-[10px] text-gray-500">{checkedIds.size} Selected</span>
                </div>
                <button 
                    onClick={() => { 
                        setSelectedIntervals(new Set()); 
                        setSelectedDelays(new Set()); 
                        setSelectedPitches(new Set()); 
                        setMaxDissonance(100); 
                        setOnlyResolved(false);
                        setGradeFilter({STRONG: true, VIABLE: true, INVALID: true}) 
                    }}
                    className="text-[9px] text-brand-primary hover:text-white uppercase font-bold tracking-wider"
                >
                    Reset Power Filter
                </button>
            </div>
        </div>
    );
}
