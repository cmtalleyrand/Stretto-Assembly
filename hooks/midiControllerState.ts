import { Midi } from '@tonejs/midi';
import {
  AppState,
  AnalysisSection,
  MidiEventCounts,
  MidiEventType,
  OutputStrategy,
  PianoRollTrackData,
  RhythmRule,
  TempoChangeMode,
  TrackAnalysisData,
  TrackInfo,
  VoiceAssignmentMode
} from '../types';

export interface MidiSessionState {
  appState: AppState;
  midiData: Midi | null;
  trackInfo: TrackInfo[];
  selectedTracks: Set<number>;
  fileName: string;
  playingTrackId: number | null;
  eventCounts: MidiEventCounts | null;
  eventsToDelete: Set<MidiEventType>;
}

export interface ConversionSettingsState {
  originalTempo: number | null;
  newTempo: string;
  originalTimeSignature: { numerator: number; denominator: number } | null;
  newTimeSignature: { numerator: string; denominator: string };
  tempoChangeMode: TempoChangeMode;
  originalDuration: number | null;
  newDuration: number | null;
  modalRoot: number;
  modalModeName: string;
  isModalConversionEnabled: boolean;
  modalMappings: Record<number, number>;
  primaryRhythm: RhythmRule;
  secondaryRhythm: RhythmRule;
  quantizeDurationMin: string;
  shiftToMeasure: boolean;
  detectOrnaments: boolean;
  softOverlapToleranceIndex: number;
  pitchBias: number;
  maxVoices: number;
  disableChords: boolean;
  voiceAssignmentMode: VoiceAssignmentMode;
  outputStrategy: OutputStrategy;
  analysisSections: AnalysisSection[];
  contextText: string;
  voiceNames: Record<number, string>;
}

export interface AnalysisUiState {
  errorMessage: string;
  successMessage: string;
  generatedScore: string;
  auditLog: string;
  analyzedTrackData: TrackAnalysisData | null;
  isAnalysisModalOpen: boolean;
  isPianoRollVisible: boolean;
  pianoRollTrackData: PianoRollTrackData | null;
}

export interface MidiControllerState {
  midiSessionState: MidiSessionState;
  conversionSettingsState: ConversionSettingsState;
  analysisUiState: AnalysisUiState;
}

export const defaultAnalysisSection = (): AnalysisSection => ({
  id: '1',
  name: 'Section A',
  startMeasure: 1,
  endMeasure: 8,
  harmonyMode: 'hia_v2',
  pitchStatsMode: 'frequency',
  chordTolerance: '1/32',
  chordMinDuration: 'off',
  arpeggioWindowVal: '1/2',
  ignorePassingMotion: false,
  hybridConfig: { voiceRoles: {}, arpStrategy: 'note_based', arpHistoryCount: 4, arpHistoryTime: '1/2' },
  debugLogging: false
});

export const createDefaultMidiSessionState = (): MidiSessionState => ({
  appState: AppState.IDLE,
  midiData: null,
  trackInfo: [],
  selectedTracks: new Set(),
  fileName: 'input.mid',
  playingTrackId: null,
  eventCounts: null,
  eventsToDelete: new Set()
});

export const createDefaultConversionSettingsState = (): ConversionSettingsState => ({
  originalTempo: null,
  newTempo: '',
  originalTimeSignature: null,
  newTimeSignature: { numerator: '', denominator: '' },
  tempoChangeMode: 'speed',
  originalDuration: null,
  newDuration: null,
  modalRoot: 0,
  modalModeName: 'Major',
  isModalConversionEnabled: false,
  modalMappings: {},
  primaryRhythm: { enabled: true, family: 'Simple', minNoteValue: '1/16' },
  secondaryRhythm: { enabled: false, family: 'Triple', minNoteValue: '1/8t' },
  quantizeDurationMin: 'off',
  shiftToMeasure: false,
  detectOrnaments: true,
  softOverlapToleranceIndex: 5,
  pitchBias: 50,
  maxVoices: 0,
  disableChords: false,
  voiceAssignmentMode: 'auto',
  outputStrategy: 'separate_voices',
  analysisSections: [defaultAnalysisSection()],
  contextText: '',
  voiceNames: {}
});

export const createDefaultAnalysisUiState = (): AnalysisUiState => ({
  errorMessage: '',
  successMessage: '',
  generatedScore: '',
  auditLog: '',
  analyzedTrackData: null,
  isAnalysisModalOpen: false,
  isPianoRollVisible: false,
  pianoRollTrackData: null
});

export const createInitialMidiControllerState = (): MidiControllerState => ({
  midiSessionState: createDefaultMidiSessionState(),
  conversionSettingsState: createDefaultConversionSettingsState(),
  analysisUiState: createDefaultAnalysisUiState()
});

export type MidiControllerAction =
  | { type: 'FULL_RESET' }
  | { type: 'PARTIAL_RESET' }
  | { type: 'MIDI_SESSION_PATCH'; payload: Partial<MidiSessionState> }
  | { type: 'CONVERSION_SETTINGS_PATCH'; payload: Partial<ConversionSettingsState> }
  | { type: 'ANALYSIS_UI_PATCH'; payload: Partial<AnalysisUiState> };

export const midiControllerReducer = (
  state: MidiControllerState,
  action: MidiControllerAction
): MidiControllerState => {
  switch (action.type) {
    case 'FULL_RESET':
      return createInitialMidiControllerState();
    case 'PARTIAL_RESET':
      return {
        midiSessionState: {
          ...state.midiSessionState,
          selectedTracks: new Set(),
          playingTrackId: null,
          eventCounts: null,
          eventsToDelete: new Set()
        },
        conversionSettingsState: createDefaultConversionSettingsState(),
        analysisUiState: createDefaultAnalysisUiState()
      };
    case 'MIDI_SESSION_PATCH':
      return {
        ...state,
        midiSessionState: {
          ...state.midiSessionState,
          ...action.payload
        }
      };
    case 'CONVERSION_SETTINGS_PATCH':
      return {
        ...state,
        conversionSettingsState: {
          ...state.conversionSettingsState,
          ...action.payload
        }
      };
    case 'ANALYSIS_UI_PATCH':
      return {
        ...state,
        analysisUiState: {
          ...state.analysisUiState,
          ...action.payload
        }
      };
    default:
      return state;
  }
};
