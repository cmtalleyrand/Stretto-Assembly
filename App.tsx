import React, { useEffect, useMemo, useState } from 'react';
import { AppState } from './types';
import { useMidiController } from './hooks/useMidiController';
import Header from './components/Header';
import Notification from './components/Notification';
import StrettoView from './components/StrettoView';
import { resolveMidiTimeSignatureAtTick } from './components/services/midiTimeSignature';
import {
  defaultAssemblyGateway,
  defaultOrchestrationGateway,
  defaultPlaybackGateway,
  defaultSearchGateway,
  defaultSubjectRepository,
} from './components/services/gateways/defaultGateways';

export default function App() {
  const { state, settings, setters, actions } = useMidiController();
  const {
    appState,
    errorMessage,
    successMessage,
    midiData,
  } = state;

  const [selectedMidiTrackId, setSelectedMidiTrackId] = useState<number | null>(null);

  const midiTrackOptions = useMemo(() => {
    if (!midiData) return [];
    return midiData.tracks
      .map((track, id) => ({
        id,
        name: track.name?.trim() || `Track ${id + 1}`,
        noteCount: track.notes.length,
      }))
      .filter((track) => track.noteCount > 0);
  }, [midiData]);

  useEffect(() => {
    if (midiTrackOptions.length === 0) {
      setSelectedMidiTrackId(null);
      return;
    }

    const hasCurrent = selectedMidiTrackId !== null
      && midiTrackOptions.some((track) => track.id === selectedMidiTrackId);
    if (!hasCurrent) {
      setSelectedMidiTrackId(midiTrackOptions[0].id);
    }
  }, [midiTrackOptions, selectedMidiTrackId]);

  const getStrettoNotes = () => {
    if (!midiData || selectedMidiTrackId === null) return [];
    return midiData.tracks[selectedMidiTrackId]?.notes.map((n) => ({ ...n } as any)) || [];
  };

  const ppq = midiData?.header.ppq || 480;
  const selectedTrackFirstTick = useMemo(() => {
    if (!midiData || selectedMidiTrackId === null) return 0;
    const trackNotes = midiData.tracks[selectedMidiTrackId]?.notes || [];
    if (trackNotes.length === 0) return 0;
    return Math.min(...trackNotes.map((note) => note.ticks));
  }, [midiData, selectedMidiTrackId]);

  const ts = useMemo(
    () => resolveMidiTimeSignatureAtTick(midiData?.header.timeSignatures, selectedTrackFirstTick),
    [midiData?.header.timeSignatures, selectedTrackFirstTick]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-darker via-[#111a2d] to-[#0c1424] text-gray-light flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
      <Header />

      <main className="w-full max-w-5xl mx-auto flex-grow flex flex-col items-center">
        {(successMessage || errorMessage) && (
          <div className="w-full mb-4">
            <Notification
              message={successMessage || errorMessage || ''}
              type={successMessage ? 'success' : 'error'}
              onDismiss={actions.clearMessages}
            />
          </div>
        )}

        <div className="w-full animate-fade-in pb-12">
          <StrettoView
            gateways={{
              search: defaultSearchGateway,
              playback: defaultPlaybackGateway,
              subjects: defaultSubjectRepository,
              assembly: defaultAssemblyGateway,
              orchestration: defaultOrchestrationGateway,
            }}
            notes={getStrettoNotes()}
            ppq={ppq}
            ts={{ num: ts[0], den: ts[1] }}
            voiceNames={settings.voiceNames}
            setVoiceNames={setters.setVoiceNames}
            onMidiUpload={actions.handleFileUpload}
            isMidiLoading={appState === AppState.LOADING}
            midiTracks={midiTrackOptions}
            selectedMidiTrackId={selectedMidiTrackId}
            onSelectMidiTrack={setSelectedMidiTrackId}
          />
        </div>
      </main>

      <footer className="w-full max-w-5xl mx-auto text-center py-4 mt-8 border-t border-brand-primary/30 text-gray-400 font-mono text-xs tracking-wide">
        <p>Stretto Assembly · React · Tailwind · @tonejs/midi</p>
      </footer>
    </div>
  );
}
