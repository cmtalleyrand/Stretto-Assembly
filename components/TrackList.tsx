
import React from 'react';
import { TrackInfo } from '../types';
import TrackItem from './TrackItem';
import { RestartIcon, CheckIcon } from './Icons';

interface TrackListProps {
  tracks: TrackInfo[];
  selectedTracks: Set<number>;
  onTrackSelect: (trackId: number) => void;
  onSelectAll: () => void;
  onReset: () => void;
  fileName: string;
  playingTrackId: number | null;
  onPreviewTrack: (trackId: number) => void;
  onShowPianoRoll: (trackId: number) => void;
  onAnalyzeTrack: (trackId: number) => void;
}

export default function TrackList({
  tracks, selectedTracks, onTrackSelect, onSelectAll, onReset, fileName,
  playingTrackId, onPreviewTrack, onShowPianoRoll, onAnalyzeTrack
}: TrackListProps) {
  const areAllSelected = tracks.length > 0 && selectedTracks.size === tracks.length;

  return (
    <div className="w-full bg-gray-dark p-6 rounded-2xl shadow-2xl border border-gray-medium animate-slide-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-gray-medium pb-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-light">MIDI Tracks</h2>
           <p className="text-gray-400 truncate max-w-xs sm:max-w-md">File: <span className="font-mono text-brand-primary">{fileName}</span></p>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <button onClick={onSelectAll} className="flex items-center gap-2 px-4 py-2 bg-gray-medium/50 text-gray-300 rounded-lg hover:bg-gray-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={tracks.length === 0}>
              <CheckIcon className="w-5 h-5" />
              {areAllSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button onClick={onReset} className="flex items-center gap-2 px-4 py-2 bg-gray-medium/50 text-gray-300 rounded-lg hover:bg-gray-medium transition-colors">
              <RestartIcon className="w-5 h-5" /> Start Over
            </button>
        </div>
      </div>

      <div className="space-y-3 mb-6 max-h-[35vh] overflow-y-auto pr-2">
        {tracks.length > 0 ? (
          tracks.map(track => (
            <TrackItem 
                key={track.id} 
                track={track} 
                isSelected={selectedTracks.has(track.id)} 
                onSelect={() => onTrackSelect(track.id)}
                isPlaying={playingTrackId === track.id} 
                onPreview={() => onPreviewTrack(track.id)} 
                onShowPianoRoll={() => onShowPianoRoll(track.id)} 
                onAnalyze={() => onAnalyzeTrack(track.id)}
            />
          ))
        ) : ( <p className="text-center text-gray-400 py-8">No tracks found in this MIDI file.</p> )}
      </div>
    </div>
  );
}
