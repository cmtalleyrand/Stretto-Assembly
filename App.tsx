
import React, { useState } from 'react';
import { AppState } from './types';
import { useMidiController } from './hooks/useMidiController';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import TrackList from './components/TrackList';
import Modal from './components/Modal';
import PianoRoll from './components/PianoRoll';
import TrackAnalysis from './components/TrackAnalysis';
import Notification from './components/Notification';
import ConversionSettings from './components/ConversionSettings';
import AnalysisSettings from './components/AnalysisSettings'; 
import ActionPanel from './components/ActionPanel';
import StrettoView from './components/StrettoView'; // Import Stretto View
import { DownloadIcon } from './components/Icons';

export default function App() {
  const { state, settings, setters, actions } = useMidiController();
  const { 
    appState, errorMessage, successMessage, fileName, trackInfo, selectedTracks, 
    playingTrackId, eventCounts, quantizationWarning, midiData,
    isPianoRollVisible, pianoRollTrackData, generatedScore, auditLog, isLoadedState,
    analyzedTrackData, isAnalysisModalOpen
  } = state;

  const [currentView, setCurrentView] = useState<'analysis' | 'stretto'>('analysis');

  // Helper to get notes for Stretto View (using first selected track or empty)
  const getStrettoNotes = () => {
      if (!midiData) return [];
      // Prefer selected track
      if (selectedTracks.size > 0) {
          const id = Array.from(selectedTracks)[0];
          return midiData.tracks[id]?.notes.map(n => ({...n} as any)) || [];
      }
      // Fallback to first track with notes
      const t = midiData.tracks.find(t => t.notes.length > 0);
      return t ? t.notes.map(n => ({...n} as any)) : [];
  };

  const ppq = midiData?.header.ppq || 480;
  const ts = midiData?.header.timeSignatures[0]?.timeSignature || [4, 4];

  // Logic to determine what to render in the main area
  const renderMainContent = () => {
      if (currentView === 'stretto') {
          return (
              <StrettoView 
                  notes={getStrettoNotes()} 
                  ppq={ppq} 
                  ts={{ num: ts[0], den: ts[1] }} 
              />
          );
      }

      // Analysis View Logic
      if (!isLoadedState) {
          return (
              <div className="w-full max-w-lg text-center">
                  <FileUpload onFileUpload={actions.handleFileUpload} isLoading={appState === AppState.LOADING} />
                  {appState === AppState.ERROR && (
                      <div className="mt-4 p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg animate-fade-in">
                          <p className="font-bold">An Error Occurred</p>
                          <p>{errorMessage}</p>
                      </div>
                  )}
              </div>
          );
      }

      return (
          <>
              <TrackList
                tracks={trackInfo}
                selectedTracks={selectedTracks}
                onTrackSelect={actions.handleTrackSelect}
                onSelectAll={actions.handleSelectAllTracks}
                onReset={actions.handleReset}
                fileName={fileName}
                playingTrackId={playingTrackId}
                onPreviewTrack={actions.handlePreviewTrack}
                onShowPianoRoll={actions.handleShowPianoRoll}
                onAnalyzeTrack={actions.handleAnalyzeTrack}
              />
              
              {/* Data Preparation Settings */}
              <ConversionSettings 
                settings={settings}
                setters={setters}
                eventCounts={eventCounts}
                onEventFilterToggle={actions.handleEventFilterToggle}
                quantizationWarning={quantizationWarning}
              />

              {/* Analysis Context & Range */}
              <AnalysisSettings 
                sections={settings.analysisSections}
                setSections={setters.setAnalysisSections}
                contextText={settings.contextText}
                setContextText={setters.setContextText}
                voiceNames={settings.voiceNames}
                setVoiceNames={setters.setVoiceNames}
                voiceCountEstimate={settings.maxVoices || 4}
                midiData={midiData}
                trackInfo={trackInfo}
                selectedTracks={selectedTracks}
                voiceAssignmentMode={settings.voiceAssignmentMode}
              />

              {(successMessage || errorMessage) && (
                  <div className="my-4">
                    <Notification 
                        message={successMessage || errorMessage || ''} 
                        type={successMessage ? 'success' : 'error'} 
                        onDismiss={actions.clearMessages} 
                    />
                  </div>
              )}

              <ActionPanel 
                 onGenerateScore={actions.handleGenerateScore}
                 onDownloadScore={actions.handleDownloadScore}
                 onDownloadAudit={actions.handleDownloadAuditLog}
                 isGenerating={appState === AppState.GENERATING}
                 canProcess={selectedTracks.size >= 1}
                 selectedCount={selectedTracks.size}
                 hasResult={!!generatedScore}
                 hasAudit={!!auditLog}
              />

              {/* Score Output */}
              {generatedScore && (
                  <div className="w-full bg-gray-dark p-6 rounded-2xl shadow-2xl border border-gray-medium mt-6 animate-slide-up">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xl font-bold text-gray-light">Generated Analysis & Score</h3>
                          <div className="flex gap-2">
                              <button 
                                onClick={actions.handleDownloadScore}
                                className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded transition-colors"
                              >
                                  <DownloadIcon className="w-4 h-4" /> Download
                              </button>
                              <button 
                                onClick={() => navigator.clipboard.writeText(generatedScore)}
                                className="text-sm bg-brand-primary hover:bg-brand-secondary text-white px-3 py-1 rounded transition-colors"
                              >
                                  Copy to Clipboard
                              </button>
                          </div>
                      </div>
                      <textarea 
                        readOnly 
                        value={generatedScore} 
                        className="w-full h-96 bg-black border border-gray-700 text-gray-300 font-mono text-xs p-4 rounded-lg focus:outline-none"
                      />
                  </div>
              )}

              {/* Separate Audit Log Panel */}
              {auditLog && (
                  <div className="w-full bg-gray-900/80 p-6 rounded-2xl shadow-2xl border-2 border-amber-600/50 mt-6 animate-slide-up">
                      <div className="flex justify-between items-center mb-4">
                          <div className="flex flex-col">
                              <h3 className="text-xl font-bold text-amber-500">HIA v2.2 Deep Audit Log</h3>
                              <p className="text-xs text-gray-400">Technical decision trace for Harmonic Implication Algorithm.</p>
                          </div>
                          <div className="flex gap-2">
                              <button 
                                onClick={actions.handleDownloadAuditLog}
                                className="flex items-center gap-2 text-sm bg-amber-800 hover:bg-amber-700 text-white px-3 py-1 rounded transition-colors"
                              >
                                  <DownloadIcon className="w-4 h-4" /> Download Audit
                              </button>
                              <button 
                                onClick={() => navigator.clipboard.writeText(auditLog)}
                                className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded transition-colors"
                              >
                                  Copy Log
                              </button>
                          </div>
                      </div>
                      <textarea 
                        readOnly 
                        value={auditLog} 
                        className="w-full h-64 bg-black border border-amber-900/50 text-amber-200/80 font-mono text-xs p-4 rounded-lg focus:outline-none"
                      />
                  </div>
              )}
          </>
      );
  };

  return (
    <>
      <div className="min-h-screen bg-gray-darker flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
        <Header currentView={currentView} onViewChange={setCurrentView} />
        
        <main className="w-full max-w-4xl mx-auto flex-grow flex flex-col items-center justify-center">
            <div className="w-full animate-fade-in pb-12">
                {renderMainContent()}
            </div>
        </main>
        <footer className="w-full max-w-4xl mx-auto text-center py-4 mt-8 border-t border-gray-medium text-gray-medium">
          <p>Built with React, Tailwind CSS, and @tonejs/midi</p>
        </footer>
      </div>

      {isPianoRollVisible && pianoRollTrackData && (
        <Modal
          isOpen={isPianoRollVisible}
          onClose={() => setters.setIsPianoRollVisible(false)}
          title={`Piano Roll: ${pianoRollTrackData.name}`}
        >
          <PianoRoll trackData={pianoRollTrackData} />
        </Modal>
      )}

      {isAnalysisModalOpen && analyzedTrackData && (
        <Modal
          isOpen={isAnalysisModalOpen}
          onClose={() => setters.setIsAnalysisModalOpen(false)}
          title={`Track Analysis: ${analyzedTrackData.trackName}`}
        >
          <TrackAnalysis data={analyzedTrackData} />
        </Modal>
      )}
    </>
  );
}
