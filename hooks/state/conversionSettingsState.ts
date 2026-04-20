import { AnalysisSection, OutputStrategy, RhythmRule, TempoChangeMode, VoiceAssignmentMode } from '../../types';

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

const defaultAnalysisSection: AnalysisSection = {
  id: '1', name: 'Section A', startMeasure: 1, endMeasure: 8, harmonyMode: 'hia_v2', pitchStatsMode: 'frequency',
  chordTolerance: '1/32', chordMinDuration: 'off', arpeggioWindowVal: '1/2', ignorePassingMotion: false,
  hybridConfig: { voiceRoles: {}, arpStrategy: 'note_based', arpHistoryCount: 4, arpHistoryTime: '1/2' },
  debugLogging: false,
};

export const createInitialConversionSettingsState = (): ConversionSettingsState => ({
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
  analysisSections: [defaultAnalysisSection],
  contextText: '',
  voiceNames: {},
});

export type ConversionSettingsAction =
  | { type: 'FULL_RESET' }
  | { type: 'PARTIAL_RESET' }
  | { type: 'SET_ORIGINAL_TEMPO'; payload: number | null }
  | { type: 'SET_NEW_TEMPO'; payload: string }
  | { type: 'SET_ORIGINAL_TIME_SIGNATURE'; payload: { numerator: number; denominator: number } | null }
  | { type: 'SET_NEW_TIME_SIGNATURE'; payload: { numerator: string; denominator: string } }
  | { type: 'SET_TEMPO_CHANGE_MODE'; payload: TempoChangeMode }
  | { type: 'SET_ORIGINAL_DURATION'; payload: number | null }
  | { type: 'SET_NEW_DURATION'; payload: number | null }
  | { type: 'SET_MODAL_ROOT'; payload: number }
  | { type: 'SET_MODAL_MODE_NAME'; payload: string }
  | { type: 'SET_IS_MODAL_CONVERSION_ENABLED'; payload: boolean }
  | { type: 'SET_MODAL_MAPPINGS'; payload: Record<number, number> }
  | { type: 'SET_PRIMARY_RHYTHM'; payload: RhythmRule }
  | { type: 'SET_SECONDARY_RHYTHM'; payload: RhythmRule }
  | { type: 'SET_QUANTIZE_DURATION_MIN'; payload: string }
  | { type: 'SET_SHIFT_TO_MEASURE'; payload: boolean }
  | { type: 'SET_DETECT_ORNAMENTS'; payload: boolean }
  | { type: 'SET_SOFT_OVERLAP_TOLERANCE_INDEX'; payload: number }
  | { type: 'SET_PITCH_BIAS'; payload: number }
  | { type: 'SET_MAX_VOICES'; payload: number }
  | { type: 'SET_DISABLE_CHORDS'; payload: boolean }
  | { type: 'SET_VOICE_ASSIGNMENT_MODE'; payload: VoiceAssignmentMode }
  | { type: 'SET_OUTPUT_STRATEGY'; payload: OutputStrategy }
  | { type: 'SET_ANALYSIS_SECTIONS'; payload: AnalysisSection[] }
  | { type: 'SET_CONTEXT_TEXT'; payload: string }
  | { type: 'SET_VOICE_NAMES'; payload: Record<number, string> };

export const conversionSettingsReducer = (state: ConversionSettingsState, action: ConversionSettingsAction): ConversionSettingsState => {
  switch (action.type) {
    case 'FULL_RESET':
    case 'PARTIAL_RESET':
      return createInitialConversionSettingsState();
    case 'SET_ORIGINAL_TEMPO':
      return { ...state, originalTempo: action.payload };
    case 'SET_NEW_TEMPO':
      return { ...state, newTempo: action.payload };
    case 'SET_ORIGINAL_TIME_SIGNATURE':
      return { ...state, originalTimeSignature: action.payload };
    case 'SET_NEW_TIME_SIGNATURE':
      return { ...state, newTimeSignature: action.payload };
    case 'SET_TEMPO_CHANGE_MODE':
      return { ...state, tempoChangeMode: action.payload };
    case 'SET_ORIGINAL_DURATION':
      return { ...state, originalDuration: action.payload };
    case 'SET_NEW_DURATION':
      return { ...state, newDuration: action.payload };
    case 'SET_MODAL_ROOT':
      return { ...state, modalRoot: action.payload };
    case 'SET_MODAL_MODE_NAME':
      return { ...state, modalModeName: action.payload };
    case 'SET_IS_MODAL_CONVERSION_ENABLED':
      return { ...state, isModalConversionEnabled: action.payload };
    case 'SET_MODAL_MAPPINGS':
      return { ...state, modalMappings: action.payload };
    case 'SET_PRIMARY_RHYTHM':
      return { ...state, primaryRhythm: action.payload };
    case 'SET_SECONDARY_RHYTHM':
      return { ...state, secondaryRhythm: action.payload };
    case 'SET_QUANTIZE_DURATION_MIN':
      return { ...state, quantizeDurationMin: action.payload };
    case 'SET_SHIFT_TO_MEASURE':
      return { ...state, shiftToMeasure: action.payload };
    case 'SET_DETECT_ORNAMENTS':
      return { ...state, detectOrnaments: action.payload };
    case 'SET_SOFT_OVERLAP_TOLERANCE_INDEX':
      return { ...state, softOverlapToleranceIndex: action.payload };
    case 'SET_PITCH_BIAS':
      return { ...state, pitchBias: action.payload };
    case 'SET_MAX_VOICES':
      return { ...state, maxVoices: action.payload };
    case 'SET_DISABLE_CHORDS':
      return { ...state, disableChords: action.payload };
    case 'SET_VOICE_ASSIGNMENT_MODE':
      return { ...state, voiceAssignmentMode: action.payload };
    case 'SET_OUTPUT_STRATEGY':
      return { ...state, outputStrategy: action.payload };
    case 'SET_ANALYSIS_SECTIONS':
      return { ...state, analysisSections: action.payload };
    case 'SET_CONTEXT_TEXT':
      return { ...state, contextText: action.payload };
    case 'SET_VOICE_NAMES':
      return { ...state, voiceNames: action.payload };
    default:
      return state;
  }
};
