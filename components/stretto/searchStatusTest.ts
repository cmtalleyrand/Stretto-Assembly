import { deriveSearchDiagnosticsPresentation, deriveSearchRuntimePresentation, deriveSearchStatusPresentation } from './searchStatus';
import { StrettoSearchReport } from '../../types';
import { STRETTO_TELEMETRY_GLOSSARY, metricHelpText } from './telemetryGlossary';

function mkReport(
  stopReason: StrettoSearchReport['stats']['stopReason'],
  maxDepthReached: number,
  timeoutExtensionAppliedMs: number = 0,
  withStats: boolean = false
): StrettoSearchReport {
  return {
    results: [],
    stats: {
      nodesVisited: 100,
      timeMs: 5000,
      stopReason,
      maxDepthReached,
      timeoutExtensionAppliedMs,
      coverage: withStats
        ? {
            nodeBudgetUsedPercent: 20,
            maxFrontierSize: 150,
            maxFrontierClassCount: 12,
            edgesTraversed: 500,
            frontierSizeAtTermination: 40,
            frontierClassesAtTermination: 8,
            completionRatioLowerBound: 71
          }
        : undefined,
      stageStats: withStats
        ? {
            validDelayCount: 6,
            transpositionCount: 9,
            pairwiseTotal: 120,
            pairwiseCompatible: 30,
            pairwiseWithFourth: 12,
            pairwiseWithVoiceCrossing: 5,
            pairwiseP4TwoVoiceDissonant: 9,
            tripleCandidates: 80,
            triplePairwiseRejected: 25,
            tripleLowerBoundRejected: 10,
            tripleParallelRejected: 12,
            tripleVoiceRejected: 8,
            tripleP4BassRejected: 7,
            harmonicallyValidTriples: 18,
            deterministicDagMergedNodes: 11,
            pairStageRejected: 90,
            tripletStageRejected: 4,
            globalLineageStageRejected: 3,
            structuralScanInvocations: 400
          }
        : undefined
    }
  };
}

const timeoutFar = deriveSearchStatusPresentation(mkReport('Timeout', 3), 8);
if (timeoutFar.heading !== 'Search Timed Out') {
  throw new Error('Timeout heading should use concise terminal label.');
}
if (!timeoutFar.detail.includes('Depth 3/8')) {
  throw new Error('Timeout detail must report concise depth metrics.');
}

const timeoutNear = deriveSearchStatusPresentation(mkReport('Timeout', 7, 10000), 8);
if (timeoutNear.heading !== 'Search Timed Out') {
  throw new Error('Timeout near-target heading should use concise terminal label.');
}
if (!timeoutNear.detail.includes('+10000ms')) {
  throw new Error('Timeout near-target extension visibility is missing.');
}

const exhaustedNone = deriveSearchStatusPresentation(mkReport('Exhausted', 0), 8);
if (!exhaustedNone.heading.includes('No Valid Chain')) {
  throw new Error('Exhausted with no depth heading is incorrect.');
}

const diagnostics = deriveSearchDiagnosticsPresentation(mkReport('Exhausted', 3, 0, true));
if (!diagnostics.summary.includes('Stage-level counts only')) {
  throw new Error('Diagnostics summary must explicitly avoid inferred root-cause labels.');
}
if (!diagnostics.constraintSignals.some((signal) => signal.includes('120 total; 30 compatible (25%), 90 rejected (75%)'))) {
  throw new Error('Diagnostics must expose pairwise total/compatible/rejected signal.');
}
if (!diagnostics.constraintSignals.some((signal) => signal.includes('Triplet reject breakdown: pairwise=25, lowerBound=10, parallel=12, voice=8, p4Bass=7'))) {
  throw new Error('Diagnostics must expose triplet reject breakdown signal.');
}
if (!diagnostics.constraintSignals.some((signal) => signal.includes('terminationFrontier=40 (8 classes)'))) {
  throw new Error('Diagnostics must expose termination frontier coverage signal.');
}

const runtime = deriveSearchRuntimePresentation(12000, 30000);
if (runtime.elapsedPercent !== 40) {
  throw new Error('Runtime presentation must expose deterministic elapsed-percent quantization.');
}
if (runtime.algorithmPhase !== 'Triplet Gate Construction') {
  throw new Error('Runtime phase classification must align with elapsed budget segment.');
}
if (!runtime.phaseDetail.includes('Wall-clock budget segment')) {
  throw new Error('Runtime phase detail must explicitly distinguish budget segments from strict algorithmic completion.');
}
if (runtime.estimatedRemainingMs !== 18000) {
  throw new Error('Runtime remaining-time estimate must be budget minus elapsed.');
}
if (STRETTO_TELEMETRY_GLOSSARY.elapsedBudgetPercent.estimateClass !== 'exact') {
  throw new Error('Glossary classification for elapsed budget percent must remain exact.');
}
if (!metricHelpText('runtimePhaseHeuristic').includes('not a proof of algorithmic completion')) {
  throw new Error('Glossary help text must disambiguate heuristic budget phases from completion.');
}
if (STRETTO_TELEMETRY_GLOSSARY.dagNodesExpanded.estimateClass !== 'exact') {
  throw new Error('DAG node expansion metric must remain classified as exact.');
}
if (!metricHelpText('dagEdgesEvaluated').includes('transition edges evaluated')) {
  throw new Error('DAG edge metric glossary text must remain explicit about transition-edge counting semantics.');
}
if (STRETTO_TELEMETRY_GLOSSARY.pairwiseOperationsProcessed.estimateClass !== 'exact') {
  throw new Error('Pairwise operations processed metric must remain classified as exact.');
}
if (!metricHelpText('tripletOperationsProcessed').includes('triplet candidate operations processed')) {
  throw new Error('Triplet operations metric glossary text must remain explicit about candidate-operation counting semantics.');
}

console.log('searchStatusTest passed');
