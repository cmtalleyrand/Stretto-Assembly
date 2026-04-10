
import React, { useRef, useEffect, useState } from 'react';
import { PianoRollTrackData, HarmonicRegion } from '../types';
import { getVoiceLabel } from './services/midiVoices';

interface PianoRollProps {
  trackData: PianoRollTrackData;
  onRegionClick?: (region: HarmonicRegion) => void;
}

const NOTE_HEIGHT = 14;
const MIN_MIDI = 21; 
const MAX_MIDI = 108; 
const NUM_NOTES = MAX_MIDI - MIN_MIDI + 1;
const KEY_WIDTH = 60;
const RULER_HEIGHT = 32;

const VOICE_COLORS = [
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#10b981', // Green
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#6366f1', // Indigo
    '#14b8a6', // Teal
];

const isBlackKey = (midi: number) => {
  const note = midi % 12;
  return note === 1 || note === 3 || note === 6 || note === 8 || note === 10;
};

const getRegionColor = (type: HarmonicRegion['type']): string => {
    switch (type) {
        case 'consonant_stable': return '#10b981'; // Green
        case 'dissonant_primary': return '#a855f7'; // Purple
        case 'dissonant_secondary': return '#f59e0b'; // Amber
        case 'dissonant_tertiary': return '#ea580c'; // Orange
        case 'dissonant_severe': return '#ef4444'; // Red
        default: return 'transparent';
    }
};

const PianoRoll: React.FC<PianoRollProps> = ({ trackData, onRegionClick }) => {
  const { notes, ppq, timeSignature, harmonicRegions } = trackData;
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const keysContainerRef = useRef<HTMLDivElement>(null);
  const rulerContainerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1.0);
  const [hoveredRegion, setHoveredRegion] = useState<HarmonicRegion | null>(null);
  
  const maxVoiceIdx = notes.reduce((max, n) => Math.max(max, n.voiceIndex ?? -1), -1);
  const [showVoices, setShowVoices] = useState(maxVoiceIdx > 0);
  const totalVoices = maxVoiceIdx + 1;

  useEffect(() => {
    if (gridContainerRef.current && notes.length > 0) {
      const sumMidi = notes.reduce((sum, n) => sum + n.midi, 0);
      const avgMidi = sumMidi / notes.length;
      const targetMidi = Math.min(Math.max(avgMidi, MIN_MIDI), MAX_MIDI);
      const y = (MAX_MIDI - targetMidi) * NOTE_HEIGHT;
      const containerHeight = gridContainerRef.current.clientHeight;
      gridContainerRef.current.scrollTop = y - containerHeight / 2;
    }
  }, [notes]); 

  const handleGridScroll = () => {
    if (gridContainerRef.current) {
        if (keysContainerRef.current) keysContainerRef.current.scrollTop = gridContainerRef.current.scrollTop;
        if (rulerContainerRef.current) rulerContainerRef.current.scrollLeft = gridContainerRef.current.scrollLeft;
    }
  };

  const totalTicks = Math.max(...notes.map(n => n.ticks + n.durationTicks), ppq * 4 * timeSignature.numerator);
  const ticksPerMeasure = ppq * timeSignature.numerator * (4 / timeSignature.denominator);
  const totalMeasures = Math.ceil(totalTicks / ticksPerMeasure) + 1; 
  
  const BASE_TICK_WIDTH = 0.15; 
  const TICK_WIDTH = BASE_TICK_WIDTH * zoom;
  const SVG_WIDTH = Math.max(totalTicks * TICK_WIDTH + 100, 100); 
  const SVG_HEIGHT = NUM_NOTES * NOTE_HEIGHT;

  const tickToX = (tick: number) => tick * TICK_WIDTH;
  const midiToY = (midi: number) => (MAX_MIDI - midi) * NOTE_HEIGHT;

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.25, 4));
  const handleZoomOut = () => setZoom(prev => Math.max(prev * 0.8, 0.1));

  const patternId = `beatPattern-${zoom}`;
  const parallelPatternId = `parallelPattern`;

  if (!notes || notes.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-400">No notes to display.</div>;
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded-lg overflow-hidden select-none relative">
       
       {/* Harmonic Inspector Overlay - UPDATED */}
       {hoveredRegion && (
           <div className="absolute top-10 left-1/2 transform -translate-x-1/2 z-50 bg-black/90 backdrop-blur-md border border-brand-primary rounded-lg p-3 shadow-xl animate-fade-in pointer-events-none min-w-[200px]">
               <div className="text-center">
                   <span className="text-white font-bold text-base block mb-1">{hoveredRegion.detailedInfo?.chordName || hoveredRegion.intervalLabel}</span>
                   
                   <div className="text-[10px] text-gray-300 border-t border-gray-700 pt-1 mt-1">
                       <div className="flex justify-between gap-4">
                           <span>Notes:</span>
                           <span className="text-brand-primary font-mono">{hoveredRegion.detailedInfo?.allNotes.join(', ')}</span>
                       </div>
                       {hoveredRegion.detailedInfo?.ncts.length > 0 && (
                           <div className="flex justify-between gap-4 mt-1">
                               <span className="text-red-300 font-bold">NCTs:</span>
                               <span className="text-red-300 font-mono">{hoveredRegion.detailedInfo?.ncts.join(', ')}</span>
                           </div>
                       )}
                   </div>

                   {hoveredRegion.errorType && <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider block mt-2 pt-1 border-t border-red-900/50">{hoveredRegion.errorType} Motion</span>}
                   <span className="text-[9px] text-gray-500 mt-2 block italic">Click to audition</span>
               </div>
           </div>
       )}

       <div className="flex items-center justify-between px-3 py-1 bg-gray-800 border-b border-gray-700 z-20">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">Zoom</span>
                    <div className="flex items-center bg-gray-700 rounded-md overflow-hidden">
                        <button onClick={handleZoomOut} className="p-1 px-2 text-gray-300 hover:text-white hover:bg-gray-600 transition-colors">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                        </button>
                        <span className="text-[10px] text-gray-300 w-10 text-center border-l border-r border-gray-600 px-1">{Math.round(zoom * 100)}%</span>
                        <button onClick={handleZoomIn} className="p-1 px-2 text-gray-300 hover:text-white hover:bg-gray-600 transition-colors">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </button>
                    </div>
                </div>

                <label className="flex items-center cursor-pointer gap-2">
                    <div className="relative">
                        <input type="checkbox" className="sr-only" checked={showVoices} onChange={(e) => setShowVoices(e.target.checked)} />
                        <div className={`block w-7 h-3.5 rounded-full transition-colors ${showVoices ? 'bg-brand-primary' : 'bg-gray-600'}`}></div>
                        <div className={`absolute left-0.5 top-0.5 bg-white w-2.5 h-2.5 rounded-full transition-transform ${showVoices ? 'transform translate-x-3.5' : ''}`}></div>
                    </div>
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Show Voices</span>
                </label>
            </div>
            <div className="text-[10px] text-gray-500 font-mono">
                {timeSignature.numerator}/{timeSignature.denominator} • {ppq} PPQ
            </div>
       </div>

       <div className="flex flex-shrink-0 h-[32px] bg-gray-800 border-b border-gray-700 z-10">
          <div className="w-[60px] flex-shrink-0 border-r border-gray-700 bg-gray-800 flex items-center justify-center">
            <span className="text-[10px] text-gray-500 font-mono">Key</span>
          </div>
          <div ref={rulerContainerRef} className="flex-grow overflow-hidden relative bg-gray-800">
             <svg width={SVG_WIDTH} height={RULER_HEIGHT}>
                {Array.from({ length: totalMeasures }).map((_, i) => {
                    const x = tickToX(i * ticksPerMeasure);
                    return (
                        <g key={i} transform={`translate(${x}, 0)`}>
                            <line x1={0} y1={15} x2={0} y2={32} stroke="#4b5563" strokeWidth={1} />
                            <text x={4} y={24} fill="#6b7280" fontSize="10" fontFamily="monospace" fontWeight="bold">{i + 1}</text>
                        </g>
                    );
                })}
             </svg>
          </div>
       </div>

       <div className="flex flex-grow overflow-hidden relative">
          <div ref={keysContainerRef} className="w-[60px] flex-shrink-0 overflow-hidden border-r border-gray-700 bg-gray-800">
            <svg width={KEY_WIDTH} height={SVG_HEIGHT}>
                {Array.from({ length: NUM_NOTES }, (_, i) => {
                    const midi = MAX_MIDI - i;
                    const y = i * NOTE_HEIGHT;
                    const black = isBlackKey(midi);
                    const isC = midi % 12 === 0;
                    return (
                        <g key={midi}>
                           <rect x={0} y={y} width={KEY_WIDTH} height={NOTE_HEIGHT} fill={black ? '#111827' : '#f9fafb'} stroke="#1f2937" strokeWidth={0.5} />
                            {(isC || midi % 12 === 5) && (
                                <text x={KEY_WIDTH - 4} y={y + NOTE_HEIGHT - 3} textAnchor="end" fontSize="9" fill={black ? '#4b5563' : '#9ca3af'} fontWeight={isC ? "bold" : "normal"}>{isC ? `C${Math.floor(midi/12)-1}` : 'F'}</text>
                            )}
                        </g>
                    )
                })}
            </svg>
          </div>

          <div ref={gridContainerRef} onScroll={handleGridScroll} className="flex-grow overflow-auto bg-gray-900 relative cursor-default">
            <svg width={SVG_WIDTH} height={SVG_HEIGHT}>
                <defs>
                    <pattern id={patternId} x="0" y="0" width={tickToX(ppq)} height={SVG_HEIGHT} patternUnits="userSpaceOnUse">
                         <line x1={tickToX(ppq)} y1={0} x2={tickToX(ppq)} y2={SVG_HEIGHT} stroke="#1f2937" strokeWidth={0.5} strokeDasharray="2,2" />
                    </pattern>
                    <pattern id={parallelPatternId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line stroke="#ffffff" strokeWidth="1" x1="0" y1="0" x2="0" y2="4" opacity="0.3" />
                    </pattern>
                </defs>
                
                {/* Background Grid */}
                {Array.from({ length: NUM_NOTES }, (_, i) => {
                     const midi = MAX_MIDI - i;
                     const y = i * NOTE_HEIGHT;
                     const black = isBlackKey(midi);
                     return <rect key={`bg-${midi}`} x={0} y={y} width={SVG_WIDTH} height={NOTE_HEIGHT} fill={black ? '#111827' : '#1f2937'} fillOpacity={black ? 1 : 0.2} />;
                })}
                {Array.from({ length: NUM_NOTES }, (_, i) => {
                    const midi = MAX_MIDI - i;
                    if (midi % 12 === 0 && midi !== MAX_MIDI) return <line key={`oct-${midi}`} x1={0} y1={i * NOTE_HEIGHT} x2={SVG_WIDTH} y2={i * NOTE_HEIGHT} stroke="#374151" strokeWidth={0.5} />;
                    return null;
                })}
                <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} fill={`url(#${patternId})`} />
                
                {/* Harmonic Regions Shading (Clickable) */}
                {harmonicRegions && harmonicRegions.map((region, i) => {
                    const x = tickToX(region.startTick);
                    const width = tickToX(region.endTick - region.startTick);
                    const color = getRegionColor(region.type);
                    const isHovered = hoveredRegion === region;
                    
                    return (
                        <g 
                            key={`region-${i}`} 
                            onMouseEnter={() => setHoveredRegion(region)} 
                            onMouseLeave={() => setHoveredRegion(null)}
                            onClick={(e) => {
                                e.stopPropagation();
                                if(onRegionClick) onRegionClick(region);
                            }}
                            className="cursor-pointer transition-opacity"
                            style={{ opacity: isHovered ? 1 : 0.7 }}
                        >
                            {/* Color Block */}
                            <rect 
                                x={x} 
                                y={0} 
                                width={Math.max(width, 1)} 
                                height={SVG_HEIGHT} 
                                fill={color} 
                                fillOpacity={isHovered ? 0.4 : 0.25} 
                                stroke={isHovered ? color : 'none'}
                                strokeWidth={isHovered ? 1 : 0}
                            />
                            {/* Error Overlays */}
                            {region.errorType === 'parallel' && (
                                <rect x={x} y={0} width={Math.max(width, 1)} height={SVG_HEIGHT} fill={`url(#${parallelPatternId})`} fillOpacity={0.5} stroke="red" strokeWidth={1} strokeOpacity={0.5} />
                            )}
                            {region.errorType === 'direct' && (
                                <rect x={x} y={0} width={Math.max(width, 1)} height={SVG_HEIGHT} fill="none" stroke="orange" strokeWidth={2} strokeDasharray="4,2" />
                            )}
                            {/* Short Interval Label at top */}
                            <text x={x + 2} y={12} fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="monospace" fontWeight={isHovered ? 'bold' : 'normal'}>
                                {region.intervalLabel}
                            </text>
                        </g>
                    );
                })}

                {/* Measure Lines */}
                {Array.from({ length: totalMeasures }).map((_, i) => (
                     <line key={`meas-${i}`} x1={tickToX(i * ticksPerMeasure)} y1={0} x2={tickToX(i * ticksPerMeasure)} y2={SVG_HEIGHT} stroke="#4b5563" strokeWidth={0.5} />
                ))}

                {/* Notes */}
                {notes.map((note, idx) => {
                    let noteColor = '#14b8a6';
                    let strokeColor = '#0f766e';
                    let opacity = 1;
                    if (note.isOrnament) { opacity = 0.5; strokeColor = 'rgba(255,255,255,0.2)'; }
                    if (showVoices && note.voiceIndex !== undefined) {
                        noteColor = VOICE_COLORS[note.voiceIndex % VOICE_COLORS.length];
                        strokeColor = 'rgba(0,0,0,0.2)';
                    }
                    const voiceName = note.voiceIndex !== undefined ? getVoiceLabel(note.voiceIndex, totalVoices) : 'N/A';
                    return (
                        <rect 
                            key={idx}
                            x={tickToX(note.ticks)}
                            y={midiToY(note.midi) + 1}
                            width={Math.max(tickToX(note.durationTicks), 2)}
                            height={NOTE_HEIGHT - 2}
                            fill={noteColor}
                            fillOpacity={opacity}
                            rx={1}
                            stroke={strokeColor}
                            strokeWidth={0.5}
                            className="pointer-events-none" // Notes aren't clicked, regions are
                        >
                            <title>{`${note.name} | ${voiceName}`}</title>
                        </rect>
                    );
                })}
            </svg>
          </div>
       </div>
    </div>
  );
};

export default PianoRoll;
