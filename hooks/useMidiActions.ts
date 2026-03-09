import { useCallback, Dispatch, SetStateAction } from 'react';
import { AppState, ConversionOptions, TrackInfo, MidiEventCounts, MidiEventType, TrackAnalysisData } from '../types';
import { parseMidiFromFile, generateGeminiScore, createPreviewMidi, getTransformedTrackDataForPianoRoll, analyzeTrack, playTrack, stopPlayback } from '../components/services/midiService';
import { Midi } from '@tonejs/midi';

interface UseMidiActionsProps {
    midiData: Midi | null;
    selectedTracks: Set<number>;
    trackInfo: TrackInfo[];
    playingTrackId: number | null;
    eventsToDelete: Set<MidiEventType>;
    setAppState: (state: AppState) => void;
    setErrorMessage: (msg: string) => void;
    setSuccessMessage: (msg: string) => void;
    setMidiData: (midi: Midi | null) => void;
    setTrackInfo: (tracks: TrackInfo[]) => void;
    setEventCounts: (counts: MidiEventCounts | null) => void;
    setFileName: (name: string) => void;
    setSelectedTracks: Dispatch<SetStateAction<Set<number>>>;
    setPlayingTrackId: (id: number | null) => void;
    setEventsToDelete: Dispatch<SetStateAction<Set<MidiEventType>>>;
    setGeneratedScore: (score: string) => void;
    setAuditLog: (log: string) => void;
    setAnalyzedTrackData: (data: TrackAnalysisData | null) => void;
    setIsAnalysisModalOpen: (val: boolean) => void;
    setPianoRollTrackData: (data: any | null) => void;
    setIsPianoRollVisible: (val: boolean) => void;
    setOriginalTempo: (val: number | null) => void;
    setNewTempo: (val: string) => void;
    setOriginalTimeSignature: (val: any) => void;
    setNewTimeSignature: (val: any) => void;
    setOriginalDuration: (val: number | null) => void;
    setNewDuration: (val: number | null) => void;
    handleReset: (full: boolean) => void;
    getConversionOptions: () => ConversionOptions | null;
}

export const useMidiActions = ({
    midiData, selectedTracks, trackInfo, playingTrackId, eventsToDelete,
    setAppState, setErrorMessage, setSuccessMessage, setMidiData, setTrackInfo, setEventCounts, setFileName, setSelectedTracks, setPlayingTrackId, setEventsToDelete,
    setGeneratedScore, setAuditLog, setAnalyzedTrackData, setIsAnalysisModalOpen, setPianoRollTrackData, setIsPianoRollVisible,
    setOriginalTempo, setNewTempo, setOriginalTimeSignature, setNewTimeSignature, setOriginalDuration, setNewDuration,
    handleReset, getConversionOptions
}: UseMidiActionsProps) => {

    const handleFileUpload = useCallback(async (file: File) => {
        setAppState(AppState.LOADING);
        setErrorMessage('');
        setSuccessMessage('');
        setSelectedTracks(new Set());
        setMidiData(null);
        setTrackInfo([]);
        setFileName(file.name);
        stopPlayback();
        setPlayingTrackId(null);
        setEventCounts(null);
        setEventsToDelete(new Set());
        handleReset(false); // Partial reset

        try {
            const { midi, tracks, eventCounts } = await parseMidiFromFile(file);
            setMidiData(midi);
            setTrackInfo(tracks);
            setEventCounts(eventCounts);
            setFileName(file.name);

            const tempo = midi.header.tempos[0]?.bpm || 120;
            const tsData = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
            const ts = { numerator: tsData[0], denominator: tsData[1] };

            setOriginalTempo(tempo);
            setNewTempo(String(Math.round(tempo)));
            setOriginalTimeSignature(ts);
            setNewTimeSignature({ numerator: String(ts.numerator), denominator: String(ts.denominator) });
            setOriginalDuration(midi.duration);
            setNewDuration(midi.duration);

            setAppState(AppState.LOADED);
        } catch (error) {
            console.error("MIDI Parsing Error:", error);
            setErrorMessage("Failed to parse MIDI file. Please ensure it's a valid .mid file.");
            setAppState(AppState.ERROR);
        }
    }, [setAppState, setErrorMessage, setSuccessMessage, setSelectedTracks, setMidiData, setTrackInfo, setFileName, setPlayingTrackId, setEventCounts, setEventsToDelete, handleReset, setOriginalTempo, setNewTempo, setOriginalTimeSignature, setNewTimeSignature, setOriginalDuration, setNewDuration]);

    const handleGenerateScore = useCallback(async (contextText: string) => {
        if (!midiData || selectedTracks.size < 1) return;
        stopPlayback();
        setPlayingTrackId(null);
        setAppState(AppState.GENERATING);
        setErrorMessage('');
        setSuccessMessage('');
        setGeneratedScore('');
        setAuditLog('');

        const conversionOptions = getConversionOptions();
        if (!conversionOptions) {
             setErrorMessage("Invalid options.");
             setAppState(AppState.ERROR);
             return;
        }

        const effectiveOptions = {
            ...conversionOptions,
            processingProfile: conversionOptions.processingProfile || 'stretto_quantized'
        };
        
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const sortedTracks = Array.from(selectedTracks).map(id => Number(id)).sort((a, b) => a - b);

            const { report, auditLog } = generateGeminiScore(
                midiData, 
                sortedTracks, 
                effectiveOptions, 
                contextText
            );
            
            setGeneratedScore(report);
            setAuditLog(auditLog || '');
            setSuccessMessage('Analysis Report & Score Generated!');
            setAppState(AppState.SUCCESS);
        } catch(e) {
            console.error("Error generating score:", e);
            setErrorMessage("An unexpected error occurred while generating the score.");
            setAppState(AppState.ERROR);
        }
    }, [midiData, selectedTracks, getConversionOptions, setAppState, setErrorMessage, setSuccessMessage, setGeneratedScore, setAuditLog, setPlayingTrackId]);

    const handlePreviewTrack = useCallback(async (trackId: number) => {
        if (!midiData) return;
        if (playingTrackId === trackId) {
            stopPlayback();
            setPlayingTrackId(null);
        } else {
            stopPlayback();
            setPlayingTrackId(null);
            setErrorMessage('');
            const conversionOptions = getConversionOptions();
            if (!conversionOptions) {
              setErrorMessage("Cannot preview: Invalid conversion options.");
              return;
            };
            try {
                const previewMidi = createPreviewMidi(midiData, trackId, eventsToDelete, conversionOptions);
                playTrack(previewMidi, () => setPlayingTrackId(null));
                setPlayingTrackId(trackId);
            } catch (error) {
                console.error("Error creating preview MIDI:", error);
                setErrorMessage("Could not generate track preview.");
            }
        }
    }, [midiData, playingTrackId, getConversionOptions, eventsToDelete, setPlayingTrackId, setErrorMessage]);

    const handleShowPianoRoll = useCallback((trackId: number) => {
        if (!midiData) return;
        setErrorMessage('');
        const conversionOptions = getConversionOptions();
        if (!conversionOptions) {
          setErrorMessage("Cannot show piano roll: Invalid conversion options.");
          return;
        }
        try {
          const trackData = getTransformedTrackDataForPianoRoll(midiData, trackId, conversionOptions);
          setPianoRollTrackData(trackData);
          setIsPianoRollVisible(true);
        } catch (error) {
           console.error("Error generating piano roll data:", error);
           setErrorMessage("Could not generate data for the piano roll.");
        }
    }, [midiData, getConversionOptions, setPianoRollTrackData, setIsPianoRollVisible, setErrorMessage]);

    const handleAnalyzeTrack = useCallback((trackId: number) => {
        if (!midiData) return;
        setErrorMessage('');
        const conversionOptions = getConversionOptions();
        if (!conversionOptions) {
            setErrorMessage("Analysis failed: Invalid settings configuration. Check Tempo/Time Signature.");
            return;
        }
        
        try {
            console.log(`Analyzing Track ID: ${trackId}`);
            const data = analyzeTrack(midiData, trackId, conversionOptions);
            if(!data) throw new Error("Analysis returned no data.");
            setAnalyzedTrackData(data);
            setIsAnalysisModalOpen(true);
        } catch (error) {
            console.error("Analysis Error:", error);
            setErrorMessage("Failed to analyze track. Ensure the track contains note data.");
        }
    }, [midiData, getConversionOptions, setAnalyzedTrackData, setIsAnalysisModalOpen, setErrorMessage]);

    const handleTrackSelect = useCallback((trackId: number) => {
        setSelectedTracks(prevSelected => {
          const newSelected = new Set(prevSelected);
          if (newSelected.has(trackId)) newSelected.delete(trackId);
          else newSelected.add(trackId);
          return newSelected;
        });
    }, [setSelectedTracks]);
      
    const handleSelectAllTracks = useCallback(() => {
        if (trackInfo.length > 0 && selectedTracks.size === trackInfo.length) {
            setSelectedTracks(new Set());
        } else {
            const allTrackIds = trackInfo.map(track => track.id);
            setSelectedTracks(new Set(allTrackIds));
        }
    }, [trackInfo, selectedTracks, setSelectedTracks]);

    const handleEventFilterToggle = useCallback((eventType: MidiEventType) => {
        setEventsToDelete(prev => {
            const newSet = new Set(prev);
            if (newSet.has(eventType)) newSet.delete(eventType);
            else newSet.add(eventType);
            return newSet;
        });
    }, [setEventsToDelete]);

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
        handleReset
    };
};