
import React, { useMemo } from 'react';
import { StrettoCandidate, PianoRollTrackData, HarmonicRegion, RawNote } from '../../types';
import { PlayIcon, StopIcon, DocumentTextIcon, DownloadIcon } from '../Icons';
import PianoRoll from '../PianoRoll';
import { playSpecificNotes } from '../midiPlaybackService';
import { getFormattedTime } from '../services/midiHarmony';

interface StrettoInspectorProps {
    candidate: StrettoCandidate | null;
    ppq: number;
    ts: { num: number, den: number };
    isPlaying: boolean;
    onPlay: (notes: RawNote[]) => void;
    assemblyResult: string;
    assemblyLog: string[];
    onClearAssembly: () => void;
    onDownloadChain: () => void;
}

export default function StrettoInspector({ 
    candidate, ppq, ts, isPlaying, onPlay, 
    assemblyResult, assemblyLog, onClearAssembly, onDownloadChain 
}: StrettoInspectorProps) {

    const pianoRollData: PianoRollTrackData | null = useMemo(() => {
        if (!candidate) return null;
        return {
            name: `Stretto ${candidate.intervalLabel}`,
            ppq,
            timeSignature: { numerator: ts.num, denominator: ts.den },
            notes: candidate.notes.map(n => ({
                midi: n.midi,
                ticks: n.ticks,
                durationTicks: n.durationTicks,
                velocity: n.velocity,
                name: n.name,
                voiceIndex: n.voiceIndex ?? 0, 
                isOrnament: false
            })),
            harmonicRegions: candidate.regions 
        };
    }, [candidate, ppq, ts]);

    const handleRegionClick = (region: HarmonicRegion) => {
        if (!candidate) return;
        const activeNotes = candidate.notes.filter(n => 
            n.ticks < region.endTick && (n.ticks + n.durationTicks) > region.startTick
        );
        if (activeNotes.length > 0) {
            const notesToPlay = activeNotes.map(n => ({
                midi: n.midi, 
                duration: n.durationTicks * (0.5 / ppq), 
                velocity: n.velocity
            }));
            playSpecificNotes(notesToPlay);
        }
    };

    const handleExportAnalysis = () => {
        if (!candidate) return;
        let text = `STRETTO ANALYSIS REPORT\nCandidate ID: ${candidate.id}\nInterval: ${candidate.intervalLabel}\nDelay: ${candidate.delayBeats} Beats\n`;
        text += `\nMETRICS\n`;
        text += `Dissonant Time: ${Math.round(candidate.dissonanceRatio * 100)}%\n`;
        text += `NCT Ratio: ${Math.round((candidate.nctRatio || 0) * 100)}%\n`;
        text += `Grade: ${candidate.grade}\n`;
        text += `Errors: ${candidate.errors.length}\n`;
        
        text += `\nHARMONIC SEGMENTS\n`;
        text += `Time | Chord/Interval | Notes | NCTs\n`;
        text += `---|---|---|---\n`;
        
        candidate.regions?.forEach(r => {
            const time = getFormattedTime(r.startTick, ppq, ts.num, ts.den);
            const notes = r.detailedInfo?.allNotes.join(', ') || '';
            const ncts = r.detailedInfo?.ncts.join(', ') || '-';
            text += `${time} | ${r.detailedInfo?.chordName || ''} | ${notes} | ${ncts}\n`;
        });

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Analysis_${candidate.id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const getStatusColor = (type: HarmonicRegion['type']) => {
        switch(type) {
            case 'consonant_stable': return 'text-green-400';
            case 'dissonant_primary': return 'text-purple-400';
            case 'dissonant_secondary': return 'text-amber-400';
            case 'dissonant_tertiary': return 'text-orange-500';
            case 'dissonant_severe': return 'text-red-500';
            default: return 'text-gray-400';
        }
    };

    const getRoleColor = (role: string) => {
        switch(role) {
            case 'Root': return 'text-blue-400';
            case '3rd': return 'text-lime-400';
            case '5th': return 'text-teal-400';
            case 'Ext': return 'text-purple-400';
            case 'NCT': return 'text-orange-400';
            default: return 'text-gray-300';
        }
    };

    const renderVital = (label: string, value: string, color: string) => (
        <div className="flex flex-col items-center bg-black/20 px-3 py-1 rounded">
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">{label}</span>
            <span className={`text-sm font-mono font-bold ${color}`}>{value}</span>
        </div>
    );

    const getMetricColor = (val: number) => {
        if (val > 0.4) return 'text-red-400';
        if (val > 0.2) return 'text-yellow-400';
        return 'text-green-400';
    };

    return (
        <div className="bg-gray-800 border border-gray-700 rounded p-4 flex flex-col h-[700px] shadow-lg relative overflow-hidden">
            {/* Gemini Assembly Overlay */}
            {assemblyResult && (
                <div className="absolute inset-0 bg-gray-800 z-30 p-4 flex flex-col animate-fade-in">
                    <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                        <h3 className="font-bold text-brand-primary">Gemini Stretto Chain</h3>
                        <button onClick={onClearAssembly} className="text-gray-500 hover:text-white">✕ Close</button>
                    </div>
                    <div className="flex-grow flex flex-col gap-4 overflow-hidden">
                        <div className="flex-1 bg-black rounded p-3 font-mono text-xs text-gray-300 overflow-auto border border-gray-700 whitespace-pre-wrap">
                            {assemblyResult}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={onDownloadChain} className="w-full py-2 bg-brand-secondary text-white font-bold rounded flex items-center justify-center gap-2 hover:bg-brand-primary transition-colors">
                                <DownloadIcon className="w-4 h-4"/> Download Chain MIDI
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(assemblyResult); alert("ABC Chain copied to clipboard!"); }} className="w-full py-2 bg-gray-700 text-white font-bold rounded hover:bg-gray-600 transition-colors">
                                Copy ABC Text
                            </button>
                        </div>
                        <div className="h-24 bg-gray-900 rounded p-2 border border-gray-700 overflow-auto text-[10px]">
                            <h4 className="font-bold text-gray-500 uppercase mb-1">Verification History</h4>
                            {assemblyLog.map((log, i) => (
                                <div key={i} className="border-l border-gray-700 pl-2 mb-1 text-gray-400">{log}</div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {candidate && pianoRollData ? (
                <>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-white">
                                Stretto: {candidate.intervalLabel} @ {candidate.delayBeats}B
                            </h3>
                            
                            {/* HARMONIC VITALS BAR */}
                            <div className="flex items-center gap-2 mt-2">
                                {renderVital("Dissonance", `${Math.round(candidate.dissonanceRatio * 100)}%`, getMetricColor(candidate.dissonanceRatio))}
                                {renderVital("NCT Ratio", `${Math.round((candidate.nctRatio || 0) * 100)}%`, getMetricColor(candidate.nctRatio || 0))}
                                {renderVital("Intensity", candidate.pairDissonanceScore.toFixed(1), "text-brand-primary")}
                                <span className={`ml-2 text-xs font-bold border px-2 py-1 rounded ${candidate.grade === 'STRONG' ? 'text-green-400 border-green-500/50' : candidate.grade === 'VIABLE' ? 'text-yellow-400 border-yellow-500/50' : 'text-red-400 border-red-500/50'}`}>
                                    {candidate.grade}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleExportAnalysis} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors text-white" title="Export Analysis Report">
                                <DocumentTextIcon className="w-5 h-5"/>
                            </button>
                            <button onClick={onDownloadChain} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors text-white" title="Download MIDI">
                                <DownloadIcon className="w-5 h-5"/>
                            </button>
                            <button onClick={() => onPlay(candidate.notes)} className="bg-brand-primary p-2 rounded-full hover:bg-brand-secondary transition-transform active:scale-95 shadow-md" title={isPlaying ? "Stop" : "Play"}>
                                {isPlaying ? <StopIcon className="w-5 h-5 text-white"/> : <PlayIcon className="w-5 h-5 text-white"/>}
                            </button>
                        </div>
                    </div>

                    <div className="h-64 flex-shrink-0 bg-gray-900 rounded border border-gray-700 mb-2 overflow-hidden shadow-inner relative">
                        <PianoRoll trackData={pianoRollData} onRegionClick={handleRegionClick} />
                    </div>

                    {/* Detailed Analysis Table */}
                    <div className="flex-grow bg-gray-900/50 rounded p-2 border border-gray-700 flex flex-col overflow-hidden relative">
                        <div className="flex justify-between items-center mb-2 px-1">
                            <h4 className="text-xs font-bold text-gray-400 uppercase">Harmonic Breakdown</h4>
                            <span className="text-[10px] text-gray-500">Tap row to audition</span>
                        </div>
                        
                        <div className="flex-grow overflow-auto rounded border border-gray-800 pb-8">
                            <table className="w-full text-left text-[10px] text-gray-300">
                                <thead className="bg-gray-800 text-gray-500 uppercase sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-1.5 w-16">Time</th>
                                        <th className="px-2 py-1.5 w-24">Chord / Int</th>
                                        <th className="px-2 py-1.5">Active Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {candidate.regions?.map((r, i) => (
                                        <tr 
                                            key={i} 
                                            onClick={() => handleRegionClick(r)}
                                            className="hover:bg-gray-700/50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-2 py-1.5 font-mono text-gray-500">
                                                {getFormattedTime(r.startTick, ppq, ts.num, ts.den)}
                                            </td>
                                            <td className={`px-2 py-1.5 font-bold ${getStatusColor(r.type)}`}>
                                                {r.detailedInfo?.chordName}
                                            </td>
                                            <td className="px-2 py-1.5 flex flex-wrap gap-1">
                                                {r.detailedInfo?.noteDetails.map((n, idx) => (
                                                    <span key={idx} className={`${getRoleColor(n.role)} font-bold`}>
                                                        {n.name}
                                                    </span>
                                                ))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* LEGEND */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-2 flex justify-between text-[9px] font-bold">
                            <span className="text-blue-400">Root</span>
                            <span className="text-lime-400">3rd</span>
                            <span className="text-teal-400">5th</span>
                            <span className="text-purple-400">6th/7th/Dim5</span>
                            <span className="text-orange-400">NCT</span>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <span className="text-4xl mb-4 opacity-50">🎹</span>
                    <p className="font-bold text-gray-400">Select a candidate to visualize.</p>
                </div>
            )}
        </div>
    );
}
