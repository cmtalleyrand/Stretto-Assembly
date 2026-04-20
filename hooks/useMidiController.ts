import { useReducer, useCallback, useEffect, useMemo, Dispatch, SetStateAction } from 'react';
import { AppState, ConversionOptions, MidiEventType } from '../types';
import { getQuantizationWarning, stopPlayback } from '../components/services/midiService';
import { MUSICAL_TIME_OPTIONS } from '../constants';
import { useMidiActions } from './useMidiActions';
import { analysisUiReducer, createInitialAnalysisUiState, AnalysisUiAction, AnalysisUiState } from './state/analysisUiState';
import { conversionSettingsReducer, createInitialConversionSettingsState, ConversionSettingsAction, ConversionSettingsState } from './state/conversionSettingsState';
import { createInitialMidiSessionState, midiSessionReducer, MidiSessionAction, MidiSessionState } from './state/midiSessionState';

const applyStateUpdater = <T,>(value: SetStateAction<T>, previous: T): T => (
  typeof value === 'function' ? (value as (prev: T) => T)(previous) : value
);

const createLegacySettersAdapter = (
  midiSession: MidiSessionState,
  conversionSettings: ConversionSettingsState,
  dispatchMidiSession: Dispatch<MidiSessionAction>,
  dispatchConversionSettings: Dispatch<ConversionSettingsAction>,
  dispatchAnalysisUi: Dispatch<AnalysisUiAction>,
) => ({
  setNewTempo: (val: string) => dispatchConversionSettings({ type: 'SET_NEW_TEMPO', payload: val }),
  setNewTimeSignature: (val: { numerator: string; denominator: string }) => dispatchConversionSettings({ type: 'SET_NEW_TIME_SIGNATURE', payload: val }),
  setTempoChangeMode: (val: ConversionSettingsState['tempoChangeMode']) => dispatchConversionSettings({ type: 'SET_TEMPO_CHANGE_MODE', payload: val }),
  setModalRoot: (val: number) => dispatchConversionSettings({ type: 'SET_MODAL_ROOT', payload: val }),
  setModalModeName: (val: string) => dispatchConversionSettings({ type: 'SET_MODAL_MODE_NAME', payload: val }),
  setIsModalConversionEnabled: (val: boolean) => dispatchConversionSettings({ type: 'SET_IS_MODAL_CONVERSION_ENABLED', payload: val }),
  setModalMappings: (val: Record<number, number>) => dispatchConversionSettings({ type: 'SET_MODAL_MAPPINGS', payload: val }),
  setPrimaryRhythm: (val: ConversionSettingsState['primaryRhythm']) => dispatchConversionSettings({ type: 'SET_PRIMARY_RHYTHM', payload: val }),
  setSecondaryRhythm: (val: ConversionSettingsState['secondaryRhythm']) => dispatchConversionSettings({ type: 'SET_SECONDARY_RHYTHM', payload: val }),
  setQuantizeDurationMin: (val: string) => dispatchConversionSettings({ type: 'SET_QUANTIZE_DURATION_MIN', payload: val }),
  setShiftToMeasure: (val: boolean) => dispatchConversionSettings({ type: 'SET_SHIFT_TO_MEASURE', payload: val }),
  setDetectOrnaments: (val: boolean) => dispatchConversionSettings({ type: 'SET_DETECT_ORNAMENTS', payload: val }),
  setSoftOverlapToleranceIndex: (val: number) => dispatchConversionSettings({ type: 'SET_SOFT_OVERLAP_TOLERANCE_INDEX', payload: val }),
  setPitchBias: (val: number) => dispatchConversionSettings({ type: 'SET_PITCH_BIAS', payload: val }),
  setMaxVoices: (val: number) => dispatchConversionSettings({ type: 'SET_MAX_VOICES', payload: val }),
  setDisableChords: (val: boolean) => dispatchConversionSettings({ type: 'SET_DISABLE_CHORDS', payload: val }),
  setVoiceAssignmentMode: (val: ConversionSettingsState['voiceAssignmentMode']) => dispatchConversionSettings({ type: 'SET_VOICE_ASSIGNMENT_MODE', payload: val }),
  setOutputStrategy: (val: ConversionSettingsState['outputStrategy']) => dispatchConversionSettings({ type: 'SET_OUTPUT_STRATEGY', payload: val }),
  setIsPianoRollVisible: (val: boolean) => dispatchAnalysisUi({ type: 'SET_IS_PIANO_ROLL_VISIBLE', payload: val }),
  setEventsToDelete: (value: SetStateAction<Set<MidiEventType>>) => {
    const next = applyStateUpdater(value, midiSession.eventsToDelete);
    dispatchMidiSession({ type: 'SET_EVENTS_TO_DELETE', payload: next });
  },
  setAnalysisSections: (val: ConversionSettingsState['analysisSections']) => dispatchConversionSettings({ type: 'SET_ANALYSIS_SECTIONS', payload: val }),
  setContextText: (val: string) => dispatchConversionSettings({ type: 'SET_CONTEXT_TEXT', payload: val }),
  setVoiceNames: (val: Record<number, string>) => dispatchConversionSettings({ type: 'SET_VOICE_NAMES', payload: val }),
  setIsAnalysisModalOpen: (val: boolean) => dispatchAnalysisUi({ type: 'SET_IS_ANALYSIS_MODAL_OPEN', payload: val }),
  setSelectedTracks: (value: SetStateAction<Set<number>>) => {
    const next = applyStateUpdater(value, midiSession.selectedTracks);
    dispatchMidiSession({ type: 'SET_SELECTED_TRACKS', payload: next });
  },
  setOriginalTempo: (val: number | null) => dispatchConversionSettings({ type: 'SET_ORIGINAL_TEMPO', payload: val }),
  setOriginalTimeSignature: (val: { numerator: number; denominator: number } | null) => dispatchConversionSettings({ type: 'SET_ORIGINAL_TIME_SIGNATURE', payload: val }),
  setOriginalDuration: (val: number | null) => dispatchConversionSettings({ type: 'SET_ORIGINAL_DURATION', payload: val }),
  setNewDuration: (val: number | null) => dispatchConversionSettings({ type: 'SET_NEW_DURATION', payload: val }),
  setGeneratedScore: (val: string) => dispatchAnalysisUi({ type: 'SET_GENERATED_SCORE', payload: val }),
  setAuditLog: (val: string) => dispatchAnalysisUi({ type: 'SET_AUDIT_LOG', payload: val }),
  setPianoRollTrackData: (val: AnalysisUiState['pianoRollTrackData']) => dispatchAnalysisUi({ type: 'SET_PIANO_ROLL_TRACK_DATA', payload: val }),
});

export const useMidiController = () => {
  const [midiSession, dispatchMidiSession] = useReducer(midiSessionReducer, undefined, createInitialMidiSessionState);
  const [conversionSettings, dispatchConversionSettings] = useReducer(conversionSettingsReducer, undefined, createInitialConversionSettingsState);
  const [analysisUi, dispatchAnalysisUi] = useReducer(analysisUiReducer, undefined, createInitialAnalysisUiState);

  useEffect(() => () => { stopPlayback(); }, []);

  useEffect(() => {
    if (midiSession.appState === AppState.IDLE || midiSession.appState === AppState.LOADING) return;
    if (conversionSettings.originalTempo && conversionSettings.originalDuration) {
      const parsedTempo = parseInt(conversionSettings.newTempo, 10);
      const duration = conversionSettings.originalDuration;
      if (!Number.isNaN(parsedTempo) && parsedTempo > 0) {
        dispatchConversionSettings({
          type: 'SET_NEW_DURATION',
          payload: conversionSettings.tempoChangeMode === 'speed'
            ? duration * (conversionSettings.originalTempo / parsedTempo)
            : duration,
        });
      } else {
        dispatchConversionSettings({ type: 'SET_NEW_DURATION', payload: duration });
      }
    }
  }, [
    conversionSettings.newTempo,
    conversionSettings.tempoChangeMode,
    conversionSettings.originalTempo,
    conversionSettings.originalDuration,
    midiSession.appState,
  ]);

  const dispatchReset = useCallback((type: 'FULL_RESET' | 'PARTIAL_RESET') => {
    stopPlayback();
    dispatchMidiSession({ type });
    dispatchConversionSettings({ type });
    dispatchAnalysisUi({ type });
  }, []);

  const getConversionOptions = useCallback((): ConversionOptions | null => {
    if (!conversionSettings.originalTempo || !midiSession.midiData) return null;
    const parsedTempo = parseInt(conversionSettings.newTempo, 10);
    const parsedTsNum = parseInt(conversionSettings.newTimeSignature.numerator, 10);
    const parsedTsDenom = parseInt(conversionSettings.newTimeSignature.denominator, 10);
    if (Number.isNaN(parsedTempo) || parsedTempo <= 0) return null;
    if (Number.isNaN(parsedTsNum) || Number.isNaN(parsedTsDenom) || parsedTsNum <= 0 || parsedTsDenom <= 0) return null;

    return {
      tempo: parsedTempo,
      timeSignature: { numerator: parsedTsNum, denominator: parsedTsDenom },
      tempoChangeMode: conversionSettings.tempoChangeMode,
      originalTempo: conversionSettings.originalTempo,
      transposition: 0,
      noteTimeScale: 1,
      inversionMode: 'off',
      primaryRhythm: conversionSettings.primaryRhythm,
      secondaryRhythm: conversionSettings.secondaryRhythm,
      quantizationValue: conversionSettings.primaryRhythm.enabled ? conversionSettings.primaryRhythm.minNoteValue : 'off',
      quantizeDurationMin: conversionSettings.quantizeDurationMin,
      shiftToMeasure: conversionSettings.shiftToMeasure,
      detectOrnaments: conversionSettings.detectOrnaments,
      modalConversion: {
        enabled: conversionSettings.isModalConversionEnabled,
        root: conversionSettings.modalRoot,
        modeName: conversionSettings.modalModeName,
        mappings: conversionSettings.modalMappings,
      },
      removeShortNotesThreshold: 0,
      pruneOverlaps: false,
      pruneThresholdIndex: 0,
      voiceSeparationOverlapTolerance: MUSICAL_TIME_OPTIONS[conversionSettings.softOverlapToleranceIndex].value,
      voiceSeparationPitchBias: conversionSettings.pitchBias,
      voiceSeparationMaxVoices: conversionSettings.maxVoices,
      voiceSeparationDisableChords: conversionSettings.disableChords,
      voiceAssignmentMode: conversionSettings.voiceAssignmentMode,
      outputStrategy: 'separate_voices',
      sections: conversionSettings.analysisSections,
      voiceNames: conversionSettings.voiceNames,
    };
  }, [conversionSettings, midiSession.midiData]);

  const quantizationWarning = useMemo(() => {
    if (!midiSession.midiData || !conversionSettings.primaryRhythm.enabled) return null;
    const options = getConversionOptions();
    if (!options) return null;
    return getQuantizationWarning(midiSession.midiData, midiSession.selectedTracks, options);
  }, [midiSession.midiData, midiSession.selectedTracks, conversionSettings.primaryRhythm, getConversionOptions]);

  const clearMessages = useCallback(() => {
    dispatchMidiSession({ type: 'SET_ERROR_MESSAGE', payload: '' });
    dispatchMidiSession({ type: 'SET_SUCCESS_MESSAGE', payload: '' });
    if (midiSession.appState === AppState.SUCCESS || midiSession.appState === AppState.ERROR) {
      dispatchMidiSession({ type: 'SET_APP_STATE', payload: AppState.LOADED });
    }
  }, [midiSession.appState]);

  const actions = useMidiActions({
    midiData: midiSession.midiData,
    selectedTracks: midiSession.selectedTracks,
    trackInfo: midiSession.trackInfo,
    playingTrackId: midiSession.playingTrackId,
    eventsToDelete: midiSession.eventsToDelete,
    dispatchMidiSession,
    dispatchConversionSettings,
    dispatchAnalysisUi,
    dispatchReset,
    getConversionOptions,
  });

  const setters = createLegacySettersAdapter(
    midiSession,
    conversionSettings,
    dispatchMidiSession,
    dispatchConversionSettings,
    dispatchAnalysisUi,
  );

  return {
    state: {
      appState: midiSession.appState,
      errorMessage: midiSession.errorMessage,
      successMessage: midiSession.successMessage,
      fileName: midiSession.fileName,
      trackInfo: midiSession.trackInfo,
      selectedTracks: midiSession.selectedTracks,
      playingTrackId: midiSession.playingTrackId,
      eventCounts: midiSession.eventCounts,
      midiData: midiSession.midiData,
      isLoadedState: [AppState.LOADED, AppState.GENERATING, AppState.SUCCESS, AppState.ERROR].includes(midiSession.appState),
      quantizationWarning,
      isPianoRollVisible: analysisUi.isPianoRollVisible,
      pianoRollTrackData: analysisUi.pianoRollTrackData,
      generatedScore: analysisUi.generatedScore,
      auditLog: analysisUi.auditLog,
      analyzedTrackData: analysisUi.analyzedTrackData,
      isAnalysisModalOpen: analysisUi.isAnalysisModalOpen,
    },
    settings: {
      ...conversionSettings,
      quantizationValue: conversionSettings.primaryRhythm.enabled ? conversionSettings.primaryRhythm.minNoteValue : 'off',
      eventsToDelete: midiSession.eventsToDelete,
    },
    setters,
    actions: {
      ...actions,
      clearMessages,
      handleReset: () => dispatchReset('FULL_RESET'),
      handleGenerateScore: () => actions.handleGenerateScore(conversionSettings.contextText),
      handleDownloadScore: () => actions.handleDownloadScore(analysisUi.generatedScore, midiSession.fileName),
      handleDownloadAuditLog: () => actions.handleDownloadAuditLog(analysisUi.auditLog, midiSession.fileName),
    },
  };
};
