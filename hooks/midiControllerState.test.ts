import { AppState } from '../types';
import {
  createInitialMidiControllerState,
  midiControllerReducer,
  MidiControllerState
} from './midiControllerState';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDefaultInvariants(state: MidiControllerState): void {
  assert(state.midiSessionState.selectedTracks.size === 0, 'selectedTracks must be empty at default.');
  assert(state.midiSessionState.eventsToDelete.size === 0, 'eventsToDelete must be empty at default.');
  assert(state.analysisUiState.errorMessage === '', 'errorMessage must be empty at default.');
  assert(state.analysisUiState.successMessage === '', 'successMessage must be empty at default.');
  assert(state.analysisUiState.generatedScore === '', 'generatedScore must be empty at default.');
  assert(state.conversionSettingsState.newTempo === '', 'newTempo must be empty at default.');
  assert(state.conversionSettingsState.analysisSections.length === 1, 'analysisSections must contain one default section.');
}

(function testFullResetRestoresInitialState(): void {
  let state = createInitialMidiControllerState();
  state = midiControllerReducer(state, {
    type: 'MIDI_SESSION_PATCH',
    payload: { appState: AppState.LOADED, fileName: 'dirty.mid', selectedTracks: new Set([1]) }
  });
  state = midiControllerReducer(state, {
    type: 'CONVERSION_SETTINGS_PATCH',
    payload: { newTempo: '132', contextText: 'dirty context' }
  });
  state = midiControllerReducer(state, {
    type: 'ANALYSIS_UI_PATCH',
    payload: { errorMessage: 'dirty error', generatedScore: 'dirty score' }
  });

  const reset = midiControllerReducer(state, { type: 'FULL_RESET' });
  assert(reset.midiSessionState.appState === AppState.IDLE, 'FULL_RESET must restore AppState.IDLE.');
  assert(reset.midiSessionState.fileName === 'input.mid', 'FULL_RESET must restore default file name.');
  assertDefaultInvariants(reset);
})();

(function testPartialResetPreservesFileUploadPreludeState(): void {
  let state = createInitialMidiControllerState();

  // Emulate the file-upload prelude path in useMidiActions.handleFileUpload.
  state = midiControllerReducer(state, {
    type: 'MIDI_SESSION_PATCH',
    payload: {
      appState: AppState.LOADING,
      fileName: 'incoming.mid',
      selectedTracks: new Set([4]),
      eventCounts: { pitchBend: 1, controlChange: 2, programChange: 3 },
      eventsToDelete: new Set(['pitchBend'])
    }
  });
  state = midiControllerReducer(state, {
    type: 'CONVERSION_SETTINGS_PATCH',
    payload: { newTempo: '180', contextText: 'stale context' }
  });
  state = midiControllerReducer(state, {
    type: 'ANALYSIS_UI_PATCH',
    payload: { errorMessage: 'stale error', generatedScore: 'stale score' }
  });

  const partial = midiControllerReducer(state, { type: 'PARTIAL_RESET' });

  assert(partial.midiSessionState.appState === AppState.LOADING, 'PARTIAL_RESET must preserve LOADING state for file upload path continuity.');
  assert(partial.midiSessionState.fileName === 'incoming.mid', 'PARTIAL_RESET must preserve in-flight fileName.');
  assert(partial.midiSessionState.selectedTracks.size === 0, 'PARTIAL_RESET must clear selectedTracks.');
  assert(partial.midiSessionState.eventCounts === null, 'PARTIAL_RESET must clear eventCounts.');
  assert(partial.midiSessionState.eventsToDelete.size === 0, 'PARTIAL_RESET must clear event filter deletions.');
  assert(partial.conversionSettingsState.newTempo === '', 'PARTIAL_RESET must clear conversion settings.');
  assert(partial.conversionSettingsState.contextText === '', 'PARTIAL_RESET must clear contextText.');
  assert(partial.analysisUiState.errorMessage === '', 'PARTIAL_RESET must clear analysis errors.');
  assert(partial.analysisUiState.generatedScore === '', 'PARTIAL_RESET must clear generated score text.');
})();

(function testPatchTransitionCorrectness(): void {
  const initial = createInitialMidiControllerState();
  const updated = midiControllerReducer(initial, {
    type: 'CONVERSION_SETTINGS_PATCH',
    payload: { detectOrnaments: false, maxVoices: 4 }
  });

  assert(updated.conversionSettingsState.detectOrnaments === false, 'Patch transition must update detectOrnaments.');
  assert(updated.conversionSettingsState.maxVoices === 4, 'Patch transition must update maxVoices.');
  assert(updated.midiSessionState === initial.midiSessionState, 'Patch transition must preserve untouched slice references for session slice.');
  assert(updated.analysisUiState === initial.analysisUiState, 'Patch transition must preserve untouched slice references for analysis slice.');
})();

console.log('midiControllerState.test passed');
