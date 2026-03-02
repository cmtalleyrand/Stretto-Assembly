
import React from 'react';
import { MusicNoteIcon } from './Icons';

interface HeaderProps {
    currentView?: 'analysis' | 'stretto';
    onViewChange?: (view: 'analysis' | 'stretto') => void;
}

export default function Header({ currentView, onViewChange }: HeaderProps) {
  return (
    <header className="w-full max-w-4xl mx-auto text-center mb-8">
      <div className="flex items-center justify-center gap-4">
        <div className="bg-brand-primary p-3 rounded-full shadow-lg">
           <MusicNoteIcon className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-light to-brand-primary">
          Gemini Music Analyst
        </h1>
      </div>
      <p className="mt-4 text-lg text-gray-400 mb-6">
        Prepare MIDI data for LLM analysis. Generate score tables, harmonic analysis, and voice-separated contexts.
      </p>
      
      {onViewChange && (
        <div className="flex justify-center gap-4">
            <button 
                onClick={() => onViewChange('analysis')}
                className={`px-4 py-2 rounded-full font-bold transition-all ${currentView === 'analysis' ? 'bg-brand-primary text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
                Track Analysis
            </button>
            <button 
                onClick={() => onViewChange('stretto')}
                className={`px-4 py-2 rounded-full font-bold transition-all ${currentView === 'stretto' ? 'bg-brand-primary text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
                Stretto Lab
            </button>
        </div>
      )}
    </header>
  );
}
