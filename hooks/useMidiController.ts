import { useReducer, useCallback, useEffect, useMemo } from 'react';
import { AppState, ConversionOptions } from '../types';
import { getQuantizationWarning, stopPlayback } from '../components/services/midiService';
import { MUSICAL_TIME_OPTIONS } from '../constants';
import { useMidiActions } from './useMidiActions';
import { createInitialMidiControllerState, midiControllerReducer } from './midiControllerState';

export const useMidiController = () => {
  const [controllerState, dispatch] = useReducer(midiControllerReducer, undefined, createInitialMidiControllerState);
  const { midiSessionState, conversionSettingsState, analysisUiState } = controllerState;

  const {
    appState,
    midiData,
    trackInfo,
    selectedTracks,
    fileName,
    playingTrackId,
    eventCounts,
    eventsToDelete
  } = midiSessionState;

  const {
    originalTempo,
    newTempo,
    originalTimeSignature,
    newTimeSignature,
    tempoChangeMode,
    originalDuration,
    newDuration,
    modalRoot,
    modalModeName,
    isModalConversionEnabled,
    modalMappings,
    primaryRhythm,
    secondaryRhythm,
    quantizeDurationMin,
    shiftToMeasure,
    detectOrnaments,
    softOverlapToleranceIndex,
    pitchBias,
    maxVoices,
    disableChords,
    voiceAssignmentMode,
    outputStrategy,
    analysisSections,
    contextText,
    voiceNames
  } = conversionSettingsState;

  const {
    errorMessage,
    successMessage,
    generatedScore,
    auditLog,
    analyzedTrackData,
    isAnalysisModalOpen,
    isPianoRollVisible,
    pianoRollTrackData
  } = analysisUiState;

  useEffect(() => { return () => { stopPlayback(); }; }, []);

  useEffect(() => {
    if (appState === AppState.IDLE || appState === AppState.LOADING) return;
    if (originalTempo && originalDuration) {
      const parsedTempo = parseInt(newTempo, 10);
      let duration = originalDuration;
      if (!isNaN(parsedTempo) && parsedTempo > 0) {
        if (tempoChangeMode === 'speed') {
          duration = duration * (originalTempo / parsedTempo);
        }
      }
      dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { newDuration: duration } });
    }
  }, [newTempo, tempoChangeMode, originalTempo, originalDuration, appState]);

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
      tempoChangeMode,
      originalTempo,
      transposition: 0,
      noteTimeScale: 1,
      inversionMode: 'off',
      primaryRhythm,
      secondaryRhythm,
      quantizationValue: primaryRhythm.enabled ? primaryRhythm.minNoteValue : 'off',
      quantizeDurationMin,
      shiftToMeasure,
      detectOrnaments,
      modalConversion: { enabled: isModalConversionEnabled, root: modalRoot, modeName: modalModeName, mappings: modalMappings },
      removeShortNotesThreshold: 0,
      pruneOverlaps: false,
      pruneThresholdIndex: 0,
      voiceSeparationOverlapTolerance: MUSICAL_TIME_OPTIONS[softOverlapToleranceIndex].value,
      voiceSeparationPitchBias: pitchBias,
      voiceSeparationMaxVoices: maxVoices,
      voiceSeparationDisableChords: disableChords,
      voiceAssignmentMode,
      outputStrategy: 'separate_voices',
      sections: analysisSections,
      voiceNames
    };
  }, [newTempo, newTimeSignature, originalTempo, tempoChangeMode, primaryRhythm, secondaryRhythm, quantizeDurationMin, shiftToMeasure, detectOrnaments, softOverlapToleranceIndex, pitchBias, maxVoices, disableChords, voiceAssignmentMode, midiData, analysisSections, voiceNames, modalRoot, modalModeName, isModalConversionEnabled, modalMappings]);

  const quantizationWarning = useMemo(() => {
    if (!midiData || !primaryRhythm.enabled) return null;
    const options = getConversionOptions();
    if (!options) return null;
    return getQuantizationWarning(midiData, selectedTracks, options);
  }, [midiData, selectedTracks, primaryRhythm, getConversionOptions]);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { errorMessage: '', successMessage: '' } });
    if (appState === AppState.SUCCESS || appState === AppState.ERROR) {
      dispatch({ type: 'MIDI_SESSION_PATCH', payload: { appState: AppState.LOADED } });
    }
  }, [appState]);

  const actions = useMidiActions({
    midiData,
    selectedTracks,
    trackInfo,
    playingTrackId,
    eventsToDelete,
    dispatch,
    getConversionOptions
  });

  return {
    state: {
      appState,
      errorMessage,
      successMessage,
      fileName,
      trackInfo,
      selectedTracks,
      playingTrackId,
      eventCounts,
      midiData,
      isLoadedState: [AppState.LOADED, AppState.GENERATING, AppState.SUCCESS, AppState.ERROR].includes(appState),
      quantizationWarning,
      isPianoRollVisible,
      pianoRollTrackData,
      generatedScore,
      auditLog,
      analyzedTrackData,
      isAnalysisModalOpen
    },
    settings: {
      originalTempo,
      newTempo,
      originalTimeSignature,
      newTimeSignature,
      tempoChangeMode,
      originalDuration,
      newDuration,
      modalRoot,
      modalModeName,
      isModalConversionEnabled,
      modalMappings,
      primaryRhythm,
      secondaryRhythm,
      quantizationValue: primaryRhythm.enabled ? primaryRhythm.minNoteValue : 'off',
      quantizeDurationMin,
      shiftToMeasure,
      detectOrnaments,
      softOverlapToleranceIndex,
      pitchBias,
      maxVoices,
      disableChords,
      voiceAssignmentMode,
      outputStrategy,
      eventsToDelete,
      analysisSections,
      contextText,
      voiceNames
    },
    setters: {
      setNewTempo: (value: string) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { newTempo: value } }),
      setNewTimeSignature: (value: { numerator: string; denominator: string }) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { newTimeSignature: value } }),
      setTempoChangeMode: (value: 'speed' | 'time') => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { tempoChangeMode: value } }),
      setModalRoot: (value: number) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { modalRoot: value } }),
      setModalModeName: (value: string) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { modalModeName: value } }),
      setIsModalConversionEnabled: (value: boolean) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { isModalConversionEnabled: value } }),
      setModalMappings: (value: Record<number, number>) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { modalMappings: value } }),
      setPrimaryRhythm: (value: typeof primaryRhythm) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { primaryRhythm: value } }),
      setSecondaryRhythm: (value: typeof secondaryRhythm) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { secondaryRhythm: value } }),
      setQuantizeDurationMin: (value: string) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { quantizeDurationMin: value } }),
      setShiftToMeasure: (value: boolean) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { shiftToMeasure: value } }),
      setDetectOrnaments: (value: boolean) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { detectOrnaments: value } }),
      setSoftOverlapToleranceIndex: (value: number) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { softOverlapToleranceIndex: value } }),
      setPitchBias: (value: number) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { pitchBias: value } }),
      setMaxVoices: (value: number) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { maxVoices: value } }),
      setDisableChords: (value: boolean) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { disableChords: value } }),
      setVoiceAssignmentMode: (value: 'auto' | 'manual') => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { voiceAssignmentMode: value } }),
      setOutputStrategy: (value: 'combine' | 'separate_tracks' | 'separate_voices') => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { outputStrategy: value } }),
      setIsPianoRollVisible: (value: boolean) => dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { isPianoRollVisible: value } }),
      setEventsToDelete: (value: Set<'pitchBend' | 'controlChange' | 'programChange'>) => dispatch({ type: 'MIDI_SESSION_PATCH', payload: { eventsToDelete: value } }),
      setAnalysisSections: (value: typeof analysisSections) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { analysisSections: value } }),
      setContextText: (value: string) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { contextText: value } }),
      setVoiceNames: (value: Record<number, string>) => dispatch({ type: 'CONVERSION_SETTINGS_PATCH', payload: { voiceNames: value } }),
      setIsAnalysisModalOpen: (value: boolean) => dispatch({ type: 'ANALYSIS_UI_PATCH', payload: { isAnalysisModalOpen: value } })
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
