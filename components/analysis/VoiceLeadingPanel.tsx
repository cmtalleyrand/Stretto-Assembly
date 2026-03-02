
import React from 'react';

export default function VoiceLeadingPanel({ voiceIntervals }: { voiceIntervals: Record<number, number> }) {
    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 h-full">
            <h3 className="text-lg font-bold text-gray-light mb-4">Voice Leading Intervals</h3>
            
            <div className="h-48 flex items-end gap-1 pb-6 border-b border-gray-700 relative">
                 {/* Histogram Bars */}
                 {Array.from({length: 13}).map((_, i) => {
                     const count = voiceIntervals[i] || 0;
                     const maxCount = Math.max(...Object.values(voiceIntervals));
                     const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                     
                     return (
                         <div key={i} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                             <div 
                                className={`w-full bg-brand-primary/50 hover:bg-brand-primary transition-all rounded-t ${count === 0 ? 'opacity-20' : ''}`}
                                style={{ height: `${Math.max(4, height)}%` }}
                             ></div>
                             <span className="text-[10px] text-gray-400 mt-2 absolute -bottom-6">{i}</span>
                             {count > 0 && (
                                 <span className="absolute -top-8 bg-gray-900 text-white text-xs px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                     {count}
                                 </span>
                             )}
                         </div>
                     )
                 })}
                 <span className="absolute -bottom-6 left-0 text-[10px] text-gray-500">Semi<br/>tones</span>
            </div>
             <div className="mt-4 text-xs text-gray-400 text-center">
                Histogram of intervals (semitones) between consecutive notes in each voice.
            </div>
        </div>
    );
}
