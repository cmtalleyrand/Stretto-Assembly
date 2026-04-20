import { useCallback, type Dispatch } from 'react';
import { AppState, ConversionOptions, MidiEventType } from '../types';
import { parseMidiFromFile, generateGeminiScore, createPreviewMidi, getTransformedTrackDataForPianoRoll, analyzeTrack, playTrack, stopPlayback } from '../components/services/midiService';
import { Midi } from '@tonejs/midi';
import { resolveMidiTimeSignatureAtTick } from '../components/services/midiTimeSignature';
import { MidiSessionAction } from './state/midiSessionState';
import { ConversionSettingsAction } from './state/conversionSettingsState';
import { AnalysisUiAction } from './state/analysisUiState';

interface UseMidiActionsProps {
  midiData: Midi | null;
  selectedTracks: Set<number>;
  trackInfo: { id: number }[];
  playingTrackId: number | null;
  eventsToDelete: Set<MidiEventType>;
  dispatchMidiSession: Dispatch<MidiSessionAction>;
  dispatchConversionSettings: Dispatch<ConversionSettingsAction>;
  dispatchAnalysisUi: Dispatch<AnalysisUiAction>;
  dispatchReset: (type: 'FULL_RESET' | 'PARTIAL_RESET') => void;
  getConversionOptions: () => ConversionOptions | null;
}

export const useMidiActions = ({
  midiData,
  selectedTracks,
  trackInfo,
  playingTrackId,
  eventsToDelete,
  dispatchMidiSession,
  dispatchConversionSettings,
  dispatchAnalysisUi,
  dispatchReset,
  getConversionOptions,
}: UseMidiActionsProps) => {

  const handleFileUpload = useCallback(async (file: File) => {
    dispatchMidiSession({ type: 'SET_APP_STATE', payload: AppState.LOADING });
    dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: '' });
    dispatchMidiSession({ type: 'SET_SUCCESS_MESSAGE', payload: '' });
    dispatchMidiSession({ type: 'SET_SELECTED_TRACKS', payload: new Set<number>() });
    dispatchMidiSession({ type: 'SET_MIDI_DATA', payload: null });
    dispatchMidiSession({ type: 'SET_TRACK_INFO', payload: [] });
    dispatchMidiSession({ type: 'SET_FILE_NAME', payload: file.name });
    stopPlayback();
    dispatchMidiSession({ type: 'SET_PLAYING_TRACK_ID', payload: null });
    dispatchMidiSession({ type: 'SET_EVENT_COUNTS', payload: null });
    dispatchMidiSession({ type: 'SET_EVENTS_TO_DELETE', payload: new Set<MidiEventType>() });
    dispatchReset('PARTIAL_RESET');

    try {
      const { midi, tracks, eventCounts } = await parseMidiFromFile(file);
      dispatchMidiSession({ type: 'SET_MIDI_DATA', payload: midi });
      dispatchMidiSession({ type: 'SET_TRACK_INFO', payload: tracks });
      dispatchMidiSession({ type: 'SET_EVENT_COUNTS', payload: eventCounts });
      dispatchMidiSession({ type: 'SET_FILE_NAME', payload: file.name });

      const tempo = midi.header.tempos[0]?.bpm || 120;
      const tsData = resolveMidiTimeSignatureAtTick(midi.header.timeSignatures, 0);
      const ts = { numerator: tsData[0], denominator: tsData[1] };

      dispatchConversionSettings({ type: 'SET_ORIGINAL_TEMPO', payload: tempo });
      dispatchConversionSettings({ type: 'SET_NEW_TEMPO', payload: String(Math.round(tempo)) });
      dispatchConversionSettings({ type: 'SET_ORIGINAL_TIME_SIGNATURE', payload: ts });
      dispatchConversionSettings({ type: 'SET_NEW_TIME_SIGNATURE', payload: { numerator: String(ts.numerator), denominator: String(ts.denominator) } });
      dispatchConversionSettings({ type: 'SET_ORIGINAL_DURATION', payload: midi.duration });
      dispatchConversionSettings({ type: 'SET_NEW_DURATION', payload: midi.duration });

      dispatchMidiSession({ type: 'SET_APP_STATE', payload: AppState.LOADED });
    } catch (error) {
      console.error('MIDI Parsing Error:', error);
      dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: "Failed to parse MIDI file. Please ensure it's a valid .mid file." });
      dispatchMidiSession({ type: 'SET_APP_STATE', payload: AppState.ERROR });
    }
  }, [dispatchMidiSession, dispatchReset, dispatchConversionSettings]);

  const handleGenerateScore = useCallback(async (contextText: string) => {
    if (!midiData || selectedTracks.size < 1) return;
    stopPlayback();
    dispatchMidiSession({ type: 'SET_PLAYING_TRACK_ID', payload: null });
    dispatchMidiSession({ type: 'SET_APP_STATE', payload: AppState.GENERATING });
    dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: '' });
    dispatchMidiSession({ type: 'SET_SUCCESS_MESSAGE', payload: '' });
    dispatchAnalysisUi({ type: 'SET_GENERATED_SCORE', payload: '' });
    dispatchAnalysisUi({ type: 'SET_AUDIT_LOG', payload: '' });

    const conversionOptions = getConversionOptions();
    if (!conversionOptions) {
      dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: 'Invalid options.' });
      dispatchMidiSession({ type: 'SET_APP_STATE', payload: AppState.ERROR });
      return;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const sortedTracks = Array.from(selectedTracks).map((id) => Number(id)).sort((a, b) => a - b);

      const { report, auditLog } = generateGeminiScore(
        midiData,
        sortedTracks,
        conversionOptions,
        contextText,
      );

      dispatchAnalysisUi({ type: 'SET_GENERATED_SCORE', payload: report });
      dispatchAnalysisUi({ type: 'SET_AUDIT_LOG', payload: auditLog || '' });
      dispatchMidiSession({ type: 'SET_SUCCESS_MESSAGE', payload: 'Analysis Report & Score Generated!' });
      dispatchMidiSession({ type: 'SET_APP_STATE', payload: AppState.SUCCESS });
    } catch (e) {
      console.error('Error generating score:', e);
      dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: 'An unexpected error occurred while generating the score.' });
      dispatchMidiSession({ type: 'SET_APP_STATE', payload: AppState.ERROR });
    }
  }, [midiData, selectedTracks, getConversionOptions, dispatchMidiSession, dispatchAnalysisUi]);

  const handlePreviewTrack = useCallback(async (trackId: number) => {
    if (!midiData) return;
    if (playingTrackId === trackId) {
      stopPlayback();
      dispatchMidiSession({ type: 'SET_PLAYING_TRACK_ID', payload: null });
    } else {
      stopPlayback();
      dispatchMidiSession({ type: 'SET_PLAYING_TRACK_ID', payload: null });
      dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: '' });
      const conversionOptions = getConversionOptions();
      if (!conversionOptions) {
        dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: 'Cannot preview: Invalid conversion options.' });
        return;
      }
      try {
        const previewMidi = createPreviewMidi(midiData, trackId, eventsToDelete, conversionOptions);
        playTrack(previewMidi, () => dispatchMidiSession({ type: 'SET_PLAYING_TRACK_ID', payload: null }));
        dispatchMidiSession({ type: 'SET_PLAYING_TRACK_ID', payload: trackId });
      } catch (error) {
        console.error('Error creating preview MIDI:', error);
        dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: 'Could not generate track preview.' });
      }
    }
  }, [midiData, playingTrackId, getConversionOptions, eventsToDelete, dispatchMidiSession]);

  const handleShowPianoRoll = useCallback((trackId: number) => {
    if (!midiData) return;
    dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: '' });
    const conversionOptions = getConversionOptions();
    if (!conversionOptions) {
      dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: 'Cannot show piano roll: Invalid conversion options.' });
      return;
    }
    try {
      const trackData = getTransformedTrackDataForPianoRoll(midiData, trackId, conversionOptions);
      dispatchAnalysisUi({ type: 'SET_PIANO_ROLL_TRACK_DATA', payload: trackData });
      dispatchAnalysisUi({ type: 'SET_IS_PIANO_ROLL_VISIBLE', payload: true });
    } catch (error) {
      console.error('Error generating piano roll data:', error);
      dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: 'Could not generate data for the piano roll.' });
    }
  }, [midiData, getConversionOptions, dispatchAnalysisUi, dispatchMidiSession]);

  const handleAnalyzeTrack = useCallback((trackId: number) => {
    if (!midiData) return;
    dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: '' });
    const conversionOptions = getConversionOptions();
    if (!conversionOptions) {
      dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: 'Analysis failed: Invalid settings configuration. Check Tempo/Time Signature.' });
      return;
    }

    try {
      const data = analyzeTrack(midiData, trackId, conversionOptions);
      if (!data) throw new Error('Analysis returned no data.');
      dispatchAnalysisUi({ type: 'SET_ANALYZED_TRACK_DATA', payload: data });
      dispatchAnalysisUi({ type: 'SET_IS_ANALYSIS_MODAL_OPEN', payload: true });
    } catch (error) {
      console.error('Analysis Error:', error);
      dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: 'Failed to analyze track. Ensure the track contains note data.' });
    }
  }, [midiData, getConversionOptions, dispatchAnalysisUi, dispatchMidiSession]);

  const handleTrackSelect = useCallback((trackId: number) => {
    const next = new Set(selectedTracks);
    if (next.has(trackId)) next.delete(trackId);
    else next.add(trackId);
    dispatchMidiSession({ type: 'SET_SELECTED_TRACKS', payload: next });
  }, [selectedTracks, dispatchMidiSession]);

  const handleSelectAllTracks = useCallback(() => {
    if (trackInfo.length > 0 && selectedTracks.size === trackInfo.length) {
      dispatchMidiSession({ type: 'SET_SELECTED_TRACKS', payload: new Set<number>() });
    } else {
      const allTrackIds = trackInfo.map((track) => track.id);
      dispatchMidiSession({ type: 'SET_SELECTED_TRACKS', payload: new Set<number>(allTrackIds) });
    }
  }, [trackInfo, selectedTracks, dispatchMidiSession]);

  const handleEventFilterToggle = useCallback((eventType: MidiEventType) => {
    const next = new Set(eventsToDelete);
    if (next.has(eventType)) next.delete(eventType);
    else next.add(eventType);
    dispatchMidiSession({ type: 'SET_EVENTS_TO_DELETE', payload: next });
  }, [eventsToDelete, dispatchMidiSession]);

  const handleDownloadScore = useCallback((score: string, fileName: string) => {
    if (!score) return;
    const blob = new Blob([score], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Gemini_Analysis_${fileName.replace(/\.mid(i)?$/i, '')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadAuditLog = useCallback((log: string, fileName: string) => {
    if (!log) return;
    const blob = new Blob([log], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HIA_Audit_Log_${fileName.replace(/\.mid(i)?$/i, '')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return {
    handleFileUpload,
    handleGenerateScore,
    handlePreviewTrack,
    handleShowPianoRoll,
    handleAnalyzeTrack,
    handleTrackSelect,
    handleSelectAllTracks,
    handleEventFilterToggle,
    handleDownloadScore,
    handleDownloadAuditLog,
    handleReset: () => dispatchReset('FULL_RESET'),
  };
};
