import { useCallback, Dispatch } from 'react';
import { AppState, ConversionOptions, MidiEventType, TrackInfo } from '../types';
import { parseMidiFromFile, generateGeminiScore, createPreviewMidi, getTransformedTrackDataForPianoRoll, analyzeTrack, playTrack, stopPlayback } from '../components/services/midiService';
import { Midi } from '@tonejs/midi';
import { resolveMidiTimeSignatureAtTick } from '../components/services/midiTimeSignature';
import { MidiControllerAction } from './midiControllerState';

interface UseMidiActionsProps {
    midiData: Midi | null;
    selectedTracks: Set<number>;
    trackInfo: TrackInfo[];
    playingTrackId: number | null;
    eventsToDelete: Set<MidiEventType>;
    dispatch: Dispatch<MidiControllerAction>;
    getConversionOptions: () => ConversionOptions | null;
}

export const useMidiActions = ({
    midiData, selectedTracks, trackInfo, playingTrackId, eventsToDelete, dispatch, getConversionOptions
}: UseMidiActionsProps) => {

    const handleFileUpload = useCallback(async (file: File) => {
        dispatch({ type: 'MIDI_SESSION_PATCH', payload: { appState: AppState.LOADING, fileName: file.name, selectedTracks: new Set(), midiData: null, trackInfo: [], playingTrackId: null, eventCounts: null, eventsToDelete: new Set() } });
        dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: '', successMessage: '' } });
        stopPlayback();
        dispatch({ type: 'PARTIAL_RESET' });

        try {
            const { midi, tracks, eventCounts } = await parseMidiFromFile(file);
            const tempo = midi.header.tempos[0]?.bpm || 120;
            const tsData = resolveMidiTimeSignatureAtTick(midi.header.timeSignatures, 0);
            const ts = { numerator: tsData[0], denominator: tsData[1] };

            dispatch({
                type: 'MIDI_SESSION_PATCH',
                payload: {
                    midiData: midi,
                    trackInfo: tracks,
                    eventCounts,
                    fileName: file.name,
                    appState: AppState.LOADED
                }
            });
            dispatch({
                type: 'CONVERSION_SETTINGS_PATCH',
                payload: {
                    originalTempo: tempo,
                    newTempo: String(Math.round(tempo)),
                    originalTimeSignature: ts,
                    newTimeSignature: { numerator: String(ts.numerator), denominator: String(ts.denominator) },
                    originalDuration: midi.duration,
                    newDuration: midi.duration
                }
            });
        } catch (error) {
            console.error('MIDI Parsing Error:', error);
            dispatch({
                type: 'ANALYSIS_UI_PATCH',
                payload: { errorMessage: "Failed to parse MIDI file. Please ensure it's a valid .mid file." }
            });
            dispatch({ type: 'MIDI_SESSION_PATCH', payload: { appState: AppState.ERROR } });
        }
    }, [dispatch]);

    const handleGenerateScore = useCallback(async (contextText: string) => {
        if (!midiData || selectedTracks.size < 1) return;
        stopPlayback();
        dispatch({ type: 'MIDI_SESSION_PATCH', payload: { playingTrackId: null, appState: AppState.GENERATING } });
        dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: '', successMessage: '', generatedScore: '', auditLog: '' } });

        const conversionOptions = getConversionOptions();
        if (!conversionOptions) {
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: 'Invalid options.' } });
            dispatch({ type: 'MIDI_SESSION_PATCH', payload: { appState: AppState.ERROR } });
            return;
        }
        
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            const sortedTracks = Array.from(selectedTracks).map(id => Number(id)).sort((a, b) => a - b);
            const { report, auditLog } = generateGeminiScore(midiData, sortedTracks, conversionOptions, contextText);
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { generatedScore: report, auditLog: auditLog || '', successMessage: 'Analysis Report & Score Generated!' } });
            dispatch({ type: 'MIDI_SESSION_PATCH', payload: { appState: AppState.SUCCESS } });
        } catch (e) {
            console.error('Error generating score:', e);
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: 'An unexpected error occurred while generating the score.' } });
            dispatch({ type: 'MIDI_SESSION_PATCH', payload: { appState: AppState.ERROR } });
        }
    }, [midiData, selectedTracks, getConversionOptions, dispatch]);

    const handlePreviewTrack = useCallback(async (trackId: number) => {
        if (!midiData) return;
        if (playingTrackId === trackId) {
            stopPlayback();
            dispatch({ type: 'MIDI_SESSION_PATCH', payload: { playingTrackId: null } });
        } else {
            stopPlayback();
            dispatch({ type: 'MIDI_SESSION_PATCH', payload: { playingTrackId: null } });
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: '' } });
            const conversionOptions = getConversionOptions();
            if (!conversionOptions) {
                dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: 'Cannot preview: Invalid conversion options.' } });
                return;
            }
            try {
                const previewMidi = createPreviewMidi(midiData, trackId, eventsToDelete, conversionOptions);
                playTrack(previewMidi, () => dispatch({ type: 'MIDI_SESSION_PATCH', payload: { playingTrackId: null } }));
                dispatch({ type: 'MIDI_SESSION_PATCH', payload: { playingTrackId: trackId } });
            } catch (error) {
                console.error('Error creating preview MIDI:', error);
                dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: 'Could not generate track preview.' } });
            }
        }
    }, [midiData, playingTrackId, getConversionOptions, eventsToDelete, dispatch]);

    const handleShowPianoRoll = useCallback((trackId: number) => {
        if (!midiData) return;
        dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: '' } });
        const conversionOptions = getConversionOptions();
        if (!conversionOptions) {
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: 'Cannot show piano roll: Invalid conversion options.' } });
            return;
        }
        try {
            const trackData = getTransformedTrackDataForPianoRoll(midiData, trackId, conversionOptions);
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { pianoRollTrackData: trackData, isPianoRollVisible: true } });
        } catch (error) {
            console.error('Error generating piano roll data:', error);
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: 'Could not generate data for the piano roll.' } });
        }
    }, [midiData, getConversionOptions, dispatch]);

    const handleAnalyzeTrack = useCallback((trackId: number) => {
        if (!midiData) return;
        dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: '' } });
        const conversionOptions = getConversionOptions();
        if (!conversionOptions) {
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: 'Analysis failed: Invalid settings configuration. Check Tempo/Time Signature.' } });
            return;
        }
        
        try {
            console.log(`Analyzing Track ID: ${trackId}`);
            const data = analyzeTrack(midiData, trackId, conversionOptions);
            if (!data) throw new Error('Analysis returned no data.');
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { analyzedTrackData: data, isAnalysisModalOpen: true } });
        } catch (error) {
            console.error('Analysis Error:', error);
            dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: 'Failed to analyze track. Ensure the track contains note data.' } });
        }
    }, [midiData, getConversionOptions, dispatch]);

    const handleTrackSelect = useCallback((trackId: number) => {
        const newSelected = new Set(selectedTracks);
        if (newSelected.has(trackId)) newSelected.delete(trackId);
        else newSelected.add(trackId);
        dispatch({ type: 'MIDI_SESSION_PATCH', payload: { selectedTracks: newSelected } });
    }, [selectedTracks, dispatch]);
      
    const handleSelectAllTracks = useCallback(() => {
        if (trackInfo.length > 0 && selectedTracks.size === trackInfo.length) {
            dispatch({ type: 'MIDI_SESSION_PATCH', payload: { selectedTracks: new Set() } });
        } else {
            const allTrackIds = trackInfo.map(track => track.id);
            dispatch({ type: 'MIDI_SESSION_PATCH', payload: { selectedTracks: new Set(allTrackIds) } });
        }
    }, [trackInfo, selectedTracks, dispatch]);

    const handleEventFilterToggle = useCallback((eventType: MidiEventType) => {
        const newSet = new Set(eventsToDelete);
        if (newSet.has(eventType)) newSet.delete(eventType);
        else newSet.add(eventType);
        dispatch({ type: 'MIDI_SESSION_PATCH', payload: { eventsToDelete: newSet } });
    }, [eventsToDelete, dispatch]);

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

    const handleReset = useCallback((full = true) => {
      dispatch({ type: full ? 'FULL_RESET' : 'PARTIAL_RESET' });
    }, [dispatch]);

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
        handleReset
    };
};
