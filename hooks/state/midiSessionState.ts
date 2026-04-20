import { Midi } from '@tonejs/midi';
import { AppState, MidiEventCounts, MidiEventType, TrackInfo } from '../../types';

export interface MidiSessionState {
  appState: AppState;
  errorMessage: string;
  successMessage: string;
  midiData: Midi | null;
  trackInfo: TrackInfo[];
  selectedTracks: Set<number>;
  fileName: string;
  playingTrackId: number | null;
  eventCounts: MidiEventCounts | null;
  eventsToDelete: Set<MidiEventType>;
}

export const createInitialMidiSessionState = (): MidiSessionState => ({
  appState: AppState.IDLE,
  errorMessage: '',
  successMessage: '',
  midiData: null,
  trackInfo: [],
  selectedTracks: new Set<number>(),
  fileName: 'input.mid',
  playingTrackId: null,
  eventCounts: null,
  eventsToDelete: new Set<MidiEventType>(),
});

export type MidiSessionAction =
  | { type: 'FULL_RESET' }
  | { type: 'PARTIAL_RESET' }
  | { type: 'SET_APP_STATE'; payload: AppState }
  | { type: 'SET_ERROR_MESSAGE'; payload: string }
  | { type: 'SET_SUCCESS_MESSAGE'; payload: string }
  | { type: 'SET_MIDI_DATA'; payload: Midi | null }
  | { type: 'SET_TRACK_INFO'; payload: TrackInfo[] }
  | { type: 'SET_SELECTED_TRACKS'; payload: Set<number> }
  | { type: 'SET_FILE_NAME'; payload: string }
  | { type: 'SET_PLAYING_TRACK_ID'; payload: number | null }
  | { type: 'SET_EVENT_COUNTS'; payload: MidiEventCounts | null }
  | { type: 'SET_EVENTS_TO_DELETE'; payload: Set<MidiEventType> };

export const midiSessionReducer = (state: MidiSessionState, action: MidiSessionAction): MidiSessionState => {
  switch (action.type) {
    case 'FULL_RESET':
      return {
        ...createInitialMidiSessionState(),
        fileName: '',
      };
    case 'PARTIAL_RESET':
      return {
        ...state,
        errorMessage: '',
        successMessage: '',
        selectedTracks: new Set<number>(),
        playingTrackId: null,
        eventCounts: null,
        eventsToDelete: new Set<MidiEventType>(),
      };
    case 'SET_APP_STATE':
      return { ...state, appState: action.payload };
    case 'SET_ERROR_MESSAGE':
      return { ...state, errorMessage: action.payload };
    case 'SET_SUCCESS_MESSAGE':
      return { ...state, successMessage: action.payload };
    case 'SET_MIDI_DATA':
      return { ...state, midiData: action.payload };
    case 'SET_TRACK_INFO':
      return { ...state, trackInfo: action.payload };
    case 'SET_SELECTED_TRACKS':
      return { ...state, selectedTracks: action.payload };
    case 'SET_FILE_NAME':
      return { ...state, fileName: action.payload };
    case 'SET_PLAYING_TRACK_ID':
      return { ...state, playingTrackId: action.payload };
    case 'SET_EVENT_COUNTS':
      return { ...state, eventCounts: action.payload };
    case 'SET_EVENTS_TO_DELETE':
      return { ...state, eventsToDelete: action.payload };
    default:
      return state;
  }
};
