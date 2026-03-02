
import React from 'react';

export const ProgressBar: React.FC<{ value: number; label: string; colorClass: string }> = ({ value, label, colorClass }) => (
    <div className="mb-2">
        <div className="flex justify-between mb-1">
            <span className="text-xs font-medium text-gray-400">{label}</span>
            <span className="text-xs font-medium text-gray-400">{Math.round(value * 100)}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div 
                className={`h-1.5 rounded-full ${colorClass}`} 
                style={{ width: `${Math.max(5, value * 100)}%` }}
            ></div>
        </div>
    </div>
);

export const MetricBar: React.FC<{ label: string; value: number; description: string; tooltip: string }> = ({ label, value, description, tooltip }) => {
    let color = 'bg-red-500';
    let text = 'Errant';
    if (value > 0.95) { color = 'bg-brand-primary'; text = 'Robotic'; }
    else if (value > 0.8) { color = 'bg-green-500'; text = 'Precise'; }
    else if (value > 0.6) { color = 'bg-yellow-500'; text = 'Human'; }
    else if (value > 0.4) { color = 'bg-orange-500'; text = 'Loose'; }

    return (
        <div className="mb-4 group relative">
             <div className="flex justify-between items-end mb-1">
                 <div className="flex items-center gap-2">
                     <span className="text-sm font-bold text-gray-300">{label}</span>
                     <div className="relative">
                        <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 rounded-full cursor-help">?</span>
                        <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-black border border-gray-600 rounded shadow-xl text-xs text-gray-300 hidden group-hover:block z-50 whitespace-pre-line">
                            {tooltip}
                        </div>
                     </div>
                 </div>
                 <div className="text-right">
                    <span className={`text-xs font-bold mr-2 px-2 py-0.5 rounded bg-gray-800 ${color.replace('bg-', 'text-')}`}>{text}</span>
                    <span className="text-xs font-mono text-gray-500">{Math.round(value * 100)}%</span>
                 </div>
             </div>
             <div className="w-full bg-gray-800 rounded-full h-2 mb-1">
                <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${value * 100}%` }}></div>
             </div>
             <p className="text-[10px] text-gray-500">{description}</p>
        </div>
    );
};

export const StatItem: React.FC<{ label: string; value: string | number; subtext?: string; highlight?: boolean; onClick?: () => void; active?: boolean }> = ({ label, value, subtext, highlight, onClick, active }) => (
     <div 
        onClick={onClick}
        className={`flex flex-col p-2 rounded border transition-colors ${onClick ? 'cursor-pointer hover:bg-gray-700' : ''} ${
            active ? 'bg-gray-700 border-gray-500' : 
            highlight ? 'bg-brand-primary/10 border-brand-primary/30' : 
            'bg-gray-800 border-gray-700'
        }`}
     >
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</span>
        <span className={`text-lg font-bold ${highlight ? 'text-brand-primary' : 'text-gray-200'}`}>{value}</span>
        {subtext && <span className="text-[10px] text-gray-500">{subtext}</span>}
     </div>
);
