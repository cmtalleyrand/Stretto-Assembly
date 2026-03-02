
import React from 'react';
import { TrackInfo } from '../types';
import { CheckIcon, PlayIcon, StopIcon, EyeIcon, ChartBarIcon } from './Icons';

interface TrackItemProps {
  track: TrackInfo;
  isSelected: boolean;
  onSelect: () => void;
  isPlaying: boolean;
  onPreview: () => void;
  onShowPianoRoll: () => void;
  onAnalyze: () => void;
}

const TrackItem: React.FC<TrackItemProps> = ({ track, isSelected, onSelect, isPlaying, onPreview, onShowPianoRoll, onAnalyze }) => {
  
  const handlePreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPreview();
  };

  const handlePianoRollClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShowPianoRoll();
  }

  const handleAnalyzeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAnalyze();
  }

  const selectedClasses = isSelected 
    ? 'bg-brand-secondary/30 border-brand-primary ring-2 ring-brand-primary' 
    : 'bg-gray-dark border-gray-medium hover:border-brand-secondary/50 hover:bg-gray-dark/50';

  const playingClasses = isPlaying ? 'ring-2 ring-white/50 shadow-lg shadow-brand-primary/20' : '';

  return (
    <div
      onClick={onSelect}
      className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all duration-200 ${selectedClasses} ${playingClasses}`}
    >
      <div className="flex-shrink-0 flex items-center gap-2 mr-3">
        <button 
          onClick={handlePreviewClick}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-medium hover:bg-brand-primary transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary"
          aria-label={isPlaying ? `Stop preview of ${track.name}` : `Play preview of ${track.name}`}
          title={isPlaying ? "Stop" : "Preview Audio"}
        >
          {isPlaying ? <StopIcon className="w-5 h-5 text-white" /> : <PlayIcon className="w-5 h-5 text-white" />}
        </button>
        <button 
          onClick={handlePianoRollClick}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-medium hover:bg-brand-primary transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary"
          aria-label={`View piano roll for ${track.name}`}
          title="Piano Roll"
        >
          <EyeIcon className="w-5 h-5 text-white" />
        </button>
        <button 
          onClick={handleAnalyzeClick}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-medium hover:bg-brand-primary transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary"
          aria-label={`Analyze ${track.name}`}
          title="Analyze Track"
        >
          <ChartBarIcon className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="flex-grow grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
        <div className="md:col-span-1">
          <p className="font-bold text-gray-light truncate" title={track.name}>{track.name}</p>
          <p className="text-xs text-gray-400">Track Name</p>
        </div>
        <div className="md:col-span-2">
          <p className="font-semibold text-gray-light truncate" title={track.instrument.name}>
            {track.instrument.name}
          </p>
          <p className="text-xs text-gray-400">
            {track.instrument.family} (P{track.instrument.number + 1})
          </p>
        </div>
        <div className="md:col-span-1 text-right">
          <p className="font-mono text-lg text-brand-primary">{track.noteCount}</p>
          <p className="text-xs text-gray-400">Notes</p>
          {track.ornamentCount !== undefined && track.ornamentCount > 0 && (
             <p className="text-xs text-yellow-500 mt-1 font-semibold">{track.ornamentCount} Ornaments</p>
          )}
        </div>
      </div>
       <div className="ml-4 flex-shrink-0 w-6 h-6 flex items-center justify-center border-2 rounded-md transition-all duration-200"
        style={{
         borderColor: isSelected ? 'var(--color-brand-primary)' : 'var(--color-gray-medium)',
         backgroundColor: isSelected ? 'var(--color-brand-primary)' : 'transparent',
         '--color-brand-primary': '#14b8a6',
         '--color-gray-medium': '#4b5563',
       } as React.CSSProperties}>
        {isSelected && <CheckIcon className="w-4 h-4 text-white" />}
      </div>
    </div>
  );
};

export default TrackItem;
