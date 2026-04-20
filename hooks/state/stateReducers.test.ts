import { AppState } from '../../types';
import { analysisUiReducer, createInitialAnalysisUiState } from './analysisUiState';
import { conversionSettingsReducer, createInitialConversionSettingsState } from './conversionSettingsState';
import { createInitialMidiSessionState, midiSessionReducer } from './midiSessionState';

const midiInitial = createInitialMidiSessionState();
const midiMutated = midiSessionReducer(midiInitial, { type: 'SET_ERROR_MESSAGE', payload: 'x' });
const midiPartialReset = midiSessionReducer(midiMutated, { type: 'PARTIAL_RESET' });
if (midiPartialReset.errorMessage !== '') {
  throw new Error('midiSession PARTIAL_RESET must clear transient error state.');
}
const midiFullReset = midiSessionReducer(
  midiSessionReducer(midiInitial, { type: 'SET_APP_STATE', payload: AppState.SUCCESS }),
  { type: 'FULL_RESET' },
);
if (midiFullReset.appState !== AppState.IDLE || midiFullReset.fileName !== '') {
  throw new Error('midiSession FULL_RESET must restore deterministic baseline and blank filename.');
}

const conversionInitial = createInitialConversionSettingsState();
const conversionMutated = conversionSettingsReducer(conversionInitial, { type: 'SET_NEW_TEMPO', payload: '132' });
const conversionReset = conversionSettingsReducer(conversionMutated, { type: 'PARTIAL_RESET' });
if (conversionReset.newTempo !== '' || conversionReset.modalModeName !== 'Major') {
  throw new Error('conversionSettings reset must restore defaults for tempo and modal mode.');
}

const analysisInitial = createInitialAnalysisUiState();
const analysisMutated = analysisUiReducer(analysisInitial, { type: 'SET_GENERATED_SCORE', payload: 'score' });
const analysisReset = analysisUiReducer(analysisMutated, { type: 'FULL_RESET' });
if (analysisReset.generatedScore !== '' || analysisReset.isAnalysisModalOpen !== false) {
  throw new Error('analysisUi FULL_RESET must clear generated artifacts and modal visibility.');
}

console.log('stateReducers.test passed');
