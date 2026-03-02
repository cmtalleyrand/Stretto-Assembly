import { useState, useCallback, useEffect, useMemo } from 'react';
import { Midi } from '@tonejs/midi';
import { AppState, TrackInfo, MidiEventCounts, MidiEventType, TempoChangeMode, ConversionOptions, PianoRollTrackData, TrackAnalysisData, OutputStrategy, RhythmRule, VoiceAssignmentMode, AnalysisSection } from '../types';
import { getQuantizationWarning, stopPlayback } from '../components/services/midiService';
import { MUSICAL_TIME_OPTIONS } from '../constants';
import { useMidiActions } from './useMidiActions';

export const useMidiController = () => {
  // --- 1. STATE ---
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [midiData, setMidiData] = useState<Midi | null>(null);
  const [trackInfo, setTrackInfo] = useState<TrackInfo[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState<string>('input.mid');
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [eventCounts, setEventCounts] = useState<MidiEventCounts | null>(null);
  const [eventsToDelete, setEventsToDelete] = useState<Set<MidiEventType>>(new Set());
  
  const [generatedScore, setGeneratedScore] = useState<string>('');
  const [auditLog, setAuditLog] = useState<string>(''); 
  const [analyzedTrackData, setAnalyzedTrackData] = useState<TrackAnalysisData | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState<boolean>(false);

  // Settings
  const [originalTempo, setOriginalTempo] = useState<number | null>(null);
  const [newTempo, setNewTempo] = useState<string>('');
  const [originalTimeSignature, setOriginalTimeSignature] = useState<{numerator: number, denominator: number} | null>(null);
  const [newTimeSignature, setNewTimeSignature] = useState({numerator: '', denominator: ''});
  const [tempoChangeMode, setTempoChangeMode] = useState<TempoChangeMode>('speed');
  const [originalDuration, setOriginalDuration] = useState<number | null>(null);
  const [newDuration, setNewDuration] = useState<number | null>(null);

  const [modalRoot, setModalRoot] = useState<number>(0);
  const [modalModeName, setModalModeName] = useState<string>('Major');
  const [isModalConversionEnabled, setIsModalConversionEnabled] = useState<boolean>(false);
  const [modalMappings, setModalMappings] = useState<Record<number, number>>({});

  const [primaryRhythm, setPrimaryRhythm] = useState<RhythmRule>({ enabled: true, family: 'Simple', minNoteValue: '1/16' }); 
  const [secondaryRhythm, setSecondaryRhythm] = useState<RhythmRule>({ enabled: false, family: 'Triple', minNoteValue: '1/8t' });

  const [quantizeDurationMin, setQuantizeDurationMin] = useState<string>('off');
  const [shiftToMeasure, setShiftToMeasure] = useState<boolean>(false);
  const [detectOrnaments, setDetectOrnaments] = useState<boolean>(true); 
  const [softOverlapToleranceIndex, setSoftOverlapToleranceIndex] = useState<number>(5); 
  const [pitchBias, setPitchBias] = useState<number>(50); 
  const [maxVoices, setMaxVoices] = useState<number>(0); 
  const [disableChords, setDisableChords] = useState<boolean>(false);
  const [voiceAssignmentMode, setVoiceAssignmentMode] = useState<VoiceAssignmentMode>('auto');
  const [outputStrategy, setOutputStrategy] = useState<OutputStrategy>('separate_voices'); 
  const [voiceNames, setVoiceNames] = useState<Record<number, string>>({}); 
  
  const [analysisSections, setAnalysisSections] = useState<AnalysisSection[]>([
      { 
          id: '1', name: 'Section A', startMeasure: 1, endMeasure: 8, harmonyMode: 'hia_v2', pitchStatsMode: 'frequency',
          chordTolerance: '1/32', chordMinDuration: 'off', arpeggioWindowVal: '1/2', ignorePassingMotion: false,
          hybridConfig: { voiceRoles: {}, arpStrategy: 'note_based', arpHistoryCount: 4, arpHistoryTime: '1/2' },
          debugLogging: false
      }
  ]);
  const [contextText, setContextText] = useState<string>('');

  const [isPianoRollVisible, setIsPianoRollVisible] = useState<boolean>(false);
  const [pianoRollTrackData, setPianoRollTrackData] = useState<PianoRollTrackData | null>(null);

  // --- 2. EFFECTS & HELPERS ---

  useEffect(() => { return () => { stopPlayback(); }; }, []);

  // Duration Recalc
  useEffect(() => {
    if (appState === AppState.IDLE || appState === AppState.LOADING) return;
    if (originalTempo && originalDuration) {
        const parsedTempo = parseInt(newTempo, 10);
        let duration = originalDuration;
        if (!isNaN(parsedTempo) && parsedTempo > 0) {
            if (tempoChangeMode === 'speed') setNewDuration(duration * (originalTempo / parsedTempo));
            else setNewDuration(duration);
        } else setNewDuration(duration);
    }
  }, [newTempo, tempoChangeMode, originalTempo, originalDuration, appState]);
  
  const handleReset = useCallback((fullReset = true) => {
    if(fullReset) { setAppState(AppState.IDLE); setMidiData(null); setTrackInfo([]); setFileName(''); }
    stopPlayback(); setPlayingTrackId(null);
    setErrorMessage(''); setSuccessMessage(''); setGeneratedScore(''); setAuditLog('');
    setSelectedTracks(new Set());
    setOriginalTempo(null); setNewTempo('');
    setOriginalTimeSignature(null); setNewTimeSignature({numerator: '', denominator: ''});
    setEventCounts(null); setEventsToDelete(new Set());
    setTempoChangeMode('speed'); setOriginalDuration(null); setNewDuration(null);
    setModalRoot(0); setModalModeName('Major'); setIsModalConversionEnabled(false); setModalMappings({});
    setPrimaryRhythm({ enabled: true, family: 'Simple', minNoteValue: '1/16' });
    setSecondaryRhythm({ enabled: false, family: 'Triple', minNoteValue: '1/8t' });
    setQuantizeDurationMin('off'); setShiftToMeasure(false); setDetectOrnaments(true);
    setSoftOverlapToleranceIndex(5); setPitchBias(50); setMaxVoices(0); setDisableChords(false);
    setVoiceAssignmentMode('auto'); setOutputStrategy('separate_voices'); setVoiceNames({});
    setAnalysisSections([{ 
        id: '1', name: 'Section A', startMeasure: 1, endMeasure: 8, harmonyMode: 'hia_v2', pitchStatsMode: 'frequency',
        chordTolerance: '1/32', chordMinDuration: 'off', arpeggioWindowVal: '1/2', ignorePassingMotion: false,
        hybridConfig: { voiceRoles: {}, arpStrategy: 'note_based', arpHistoryCount: 4, arpHistoryTime: '1/2' },
        debugLogging: false
    }]);
    setContextText(''); setAnalyzedTrackData(null); setIsAnalysisModalOpen(false);
  }, []);

  const getConversionOptions = useCallback((): ConversionOptions | null => {
    if (!originalTempo || !midiData) return null;
    const parsedTempo = parseInt(newTempo, 10);
    const parsedTsNum = parseInt(newTimeSignature.numerator, 10);
    const parsedTsDenom = parseInt(newTimeSignature.denominator, 10);
    if (isNaN(parsedTempo) || parsedTempo <= 0) return null;
    if (isNaN(parsedTsNum) || isNaN(parsedTsDenom) || parsedTsNum <= 0 || parsedTsDenom <= 0) return null;

    return {
        tempo: parsedTempo,
        timeSignature: { numerator: parsedTsNum, denominator: parsedTsDenom },
        tempoChangeMode, originalTempo, transposition: 0, noteTimeScale: 1, inversionMode: 'off',
        primaryRhythm, secondaryRhythm, quantizationValue: primaryRhythm.enabled ? primaryRhythm.minNoteValue : 'off', 
        quantizeDurationMin, shiftToMeasure, detectOrnaments,
        modalConversion: { enabled: isModalConversionEnabled, root: modalRoot, modeName: modalModeName, mappings: modalMappings },
        removeShortNotesThreshold: 0, pruneOverlaps: false, pruneThresholdIndex: 0,
        voiceSeparationOverlapTolerance: MUSICAL_TIME_OPTIONS[softOverlapToleranceIndex].value,
        voiceSeparationPitchBias: pitchBias, voiceSeparationMaxVoices: maxVoices,
        voiceSeparationDisableChords: disableChords, voiceAssignmentMode, outputStrategy: 'separate_voices', 
        sections: analysisSections, voiceNames
    };
  }, [newTempo, newTimeSignature, originalTempo, tempoChangeMode, primaryRhythm, secondaryRhythm, quantizeDurationMin, shiftToMeasure, detectOrnaments, softOverlapToleranceIndex, pitchBias, maxVoices, disableChords, voiceAssignmentMode, midiData, analysisSections, voiceNames, modalRoot, modalModeName, isModalConversionEnabled, modalMappings]);

  const quantizationWarning = useMemo(() => {
      if (!midiData || !primaryRhythm.enabled) return null;
      const options = getConversionOptions();
      if (!options) return null;
      return getQuantizationWarning(midiData, selectedTracks, options);
  }, [midiData, selectedTracks, primaryRhythm, getConversionOptions]);

  const clearMessages = useCallback(() => {
      setErrorMessage(''); setSuccessMessage('');
      if(appState === AppState.SUCCESS || appState === AppState.ERROR) setAppState(AppState.LOADED);
  }, [appState]);

  // --- 3. ACTIONS (from hook) ---
  const actions = useMidiActions({
      midiData, selectedTracks, trackInfo, playingTrackId, eventsToDelete,
      setAppState, setErrorMessage, setSuccessMessage, setMidiData, setTrackInfo, setEventCounts, setFileName, setSelectedTracks, setPlayingTrackId, setEventsToDelete,
      setGeneratedScore, setAuditLog, setAnalyzedTrackData, setIsAnalysisModalOpen, setPianoRollTrackData, setIsPianoRollVisible,
      setOriginalTempo, setNewTempo, setOriginalTimeSignature, setNewTimeSignature, setOriginalDuration, setNewDuration,
      handleReset, getConversionOptions
  });

  return {
    state: {
        appState, errorMessage, successMessage, fileName, trackInfo, selectedTracks, playingTrackId, eventCounts, midiData,
        isLoadedState: [AppState.LOADED, AppState.GENERATING, AppState.SUCCESS, AppState.ERROR].includes(appState),
        quantizationWarning, isPianoRollVisible, pianoRollTrackData, generatedScore, auditLog, analyzedTrackData, isAnalysisModalOpen
    },
    settings: {
        originalTempo, newTempo, originalTimeSignature, newTimeSignature, tempoChangeMode, originalDuration, newDuration,
        modalRoot, modalModeName, isModalConversionEnabled, modalMappings,
        primaryRhythm, secondaryRhythm, quantizationValue: primaryRhythm.enabled ? primaryRhythm.minNoteValue : 'off', 
        quantizeDurationMin, shiftToMeasure, detectOrnaments, softOverlapToleranceIndex, pitchBias, maxVoices, disableChords,
        voiceAssignmentMode, outputStrategy, eventsToDelete, analysisSections, contextText, voiceNames
    },
    setters: {
        setNewTempo, setNewTimeSignature, setTempoChangeMode, setModalRoot, setModalModeName, setIsModalConversionEnabled, setModalMappings,
        setPrimaryRhythm, setSecondaryRhythm, setQuantizeDurationMin, setShiftToMeasure, setDetectOrnaments, setSoftOverlapToleranceIndex,
        setPitchBias, setMaxVoices, setDisableChords, setVoiceAssignmentMode, setOutputStrategy, setIsPianoRollVisible, setEventsToDelete,
        setAnalysisSections, setContextText, setVoiceNames, setIsAnalysisModalOpen
    },
    actions: {
        ...actions,
        clearMessages,
        handleReset: () => actions.handleReset(true),
        handleGenerateScore: () => actions.handleGenerateScore(contextText),
        handleDownloadScore: () => actions.handleDownloadScore(generatedScore, fileName),
        handleDownloadAuditLog: () => actions.handleDownloadAuditLog(auditLog, fileName)
    }
  };
};