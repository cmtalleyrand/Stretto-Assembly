import { PianoRollTrackData, TrackAnalysisData } from '../../types';

export interface AnalysisUiState {
  generatedScore: string;
  auditLog: string;
  analyzedTrackData: TrackAnalysisData | null;
  isAnalysisModalOpen: boolean;
  isPianoRollVisible: boolean;
  pianoRollTrackData: PianoRollTrackData | null;
}

export const createInitialAnalysisUiState = (): AnalysisUiState => ({
  generatedScore: '',
  auditLog: '',
  analyzedTrackData: null,
  isAnalysisModalOpen: false,
  isPianoRollVisible: false,
  pianoRollTrackData: null,
});

export type AnalysisUiAction =
  | { type: 'FULL_RESET' }
  | { type: 'PARTIAL_RESET' }
  | { type: 'SET_GENERATED_SCORE'; payload: string }
  | { type: 'SET_AUDIT_LOG'; payload: string }
  | { type: 'SET_ANALYZED_TRACK_DATA'; payload: TrackAnalysisData | null }
  | { type: 'SET_IS_ANALYSIS_MODAL_OPEN'; payload: boolean }
  | { type: 'SET_IS_PIANO_ROLL_VISIBLE'; payload: boolean }
  | { type: 'SET_PIANO_ROLL_TRACK_DATA'; payload: PianoRollTrackData | null };

export const analysisUiReducer = (state: AnalysisUiState, action: AnalysisUiAction): AnalysisUiState => {
  switch (action.type) {
    case 'FULL_RESET':
    case 'PARTIAL_RESET':
      return createInitialAnalysisUiState();
    case 'SET_GENERATED_SCORE':
      return { ...state, generatedScore: action.payload };
    case 'SET_AUDIT_LOG':
      return { ...state, auditLog: action.payload };
    case 'SET_ANALYZED_TRACK_DATA':
      return { ...state, analyzedTrackData: action.payload };
    case 'SET_IS_ANALYSIS_MODAL_OPEN':
      return { ...state, isAnalysisModalOpen: action.payload };
    case 'SET_IS_PIANO_ROLL_VISIBLE':
      return { ...state, isPianoRollVisible: action.payload };
    case 'SET_PIANO_ROLL_TRACK_DATA':
      return { ...state, pianoRollTrackData: action.payload };
    default:
      return state;
  }
};
