# Active vs. Legacy Analysis Pathways

This document defines the intended execution pathways for analysis and discovery features. Its purpose is to prevent architectural drift toward deprecated report-centric flows.

## Classification policy

1. **Active pathways**: workflow-critical modules that implement Stretto pairwise discovery, Stretto chain search worker execution, Canon search, and their user-facing displays.
2. **Legacy pathways**: retained modules that implement harmonic implication analysis, generic MIDI harmonic reports, or report-centric UI controls that are not part of the intended workflow.
3. **Deprecation intent**: legacy pathways remain available only for compatibility and testing; they are not normative targets for new product behavior.

## Module map

| Module path | Status | Rationale |
|---|---|---|
| `components/services/pairwisePivotSearch.ts` | active | Primary pairwise discovery engine used by current Stretto search flow. |
| `components/workers/strettoSearchWorker.ts` | active | Dedicated worker that executes Stretto chain search off the main thread; this is the intended chain-search runtime path. |
| `components/services/canonSearch.ts` | active | Canon search implementation that participates in current discovery behavior. |
| `components/stretto/StrettoSearchPanel.tsx` | active | UI control surface for active Stretto discovery initiation/configuration. |
| `components/stretto/StrettoChainView.tsx` | active | Primary chain display for Stretto results in the intended workflow. |
| `components/stretto/StrettoResultsList.tsx` | active | Active list visualization for discovered Stretto candidates. |
| `components/stretto/CanonSearchPanel.tsx` | active | UI control surface for active Canon discovery. |
| `components/stretto/CanonResultsList.tsx` | active | Active Canon result display component. |
| `components/services/analysis/harmonicImplication.ts` | legacy | Harmonic implication analysis pathway is deprecated relative to Stretto/Canon-first discovery. |
| `midiAnalysis.ts` | legacy | Root-level generic MIDI harmonic report pathway retained for backward compatibility. |
| `components/services/midiAnalysis.ts` | legacy | Generic MIDI analysis/report module outside intended Stretto/Canon production path. |
| `components/services/scoreGenerator.ts` (report-centric branches) | legacy | Contains report-oriented generation branches retained only for compatibility/testing scenarios. |
| `components/AnalysisSettings.tsx` | legacy | Analysis-report control surface not used by the intended Stretto/Canon workflow. |
| `components/analysis/ChordProgressionPanel.tsx` | legacy | Report panel for legacy harmonic-analysis views. |
| `components/analysis/KeyPredictionPanel.tsx` | legacy | Legacy key-prediction report display retained for non-normative compatibility paths. |
| `components/analysis/VoiceLeadingPanel.tsx` | legacy | Legacy voice-leading report display outside active discovery path. |
| `components/analysis/RhythmicIntegrityReport.tsx` | legacy | Legacy rhythmic report view retained for testing/compatibility coverage. |

## Migration note

- New feature work should route through active modules and maintain compatibility with `strettoSearchWorker` + pairwise/Canon discovery.
- Legacy modules should be preserved unless removal is explicitly scheduled, because they still support compatibility regressions and historical test expectations.
