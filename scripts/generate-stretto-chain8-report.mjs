import fs from 'node:fs/promises';
import path from 'node:path';
import { searchStrettoChains } from '../components/services/strettoGenerator.ts';

function makeTwelveBeatSubject(ppq) {
  const pitches = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65];
  return pitches.map((midi, i) => ({
    midi,
    ticks: i * ppq,
    durationTicks: ppq,
    velocity: 96,
    name: `N${i + 1}`,
  }));
}

async function run() {
  const ppq = 12;
  const subject = makeTwelveBeatSubject(ppq);
  const options = {
    ensembleTotal: 4,
    targetChainLength: 8,
    subjectVoiceIndex: 2,
    truncationMode: 'Max 1',
    truncationTargetBeats: 8,
    inversionMode: 'Max 1',
    useChromaticInversion: false,
    thirdSixthMode: 'Max 1',
    pivotMidi: 60,
    requireConsonantEnd: true,
    disallowComplexExceptions: false,
    maxPairwiseDissonance: 1,
    scaleRoot: 0,
    scaleMode: 'Major',
  };

  const startedAt = new Date().toISOString();
  const report = await searchStrettoChains(subject, options, ppq);

  const payload = {
    meta: {
      startedAt,
      generatedAt: new Date().toISOString(),
      scenario: 'stretto-chain8',
    },
    input: { ppq, subject, options },
    output: report,
  };

  const artifactsDir = path.resolve('artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });

  const jsonPath = path.join(artifactsDir, 'stretto-chain8-report.json');
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

  const htmlPath = path.join(artifactsDir, 'stretto-chain8-report.html');
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"/><title>Stretto Chain-8 Report</title>
<style>body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px;background:#0f172a;color:#e2e8f0} pre{white-space:pre-wrap;background:#111827;padding:16px;border-radius:8px}</style>
</head>
<body>
<h1>Stretto Chain-8 Report</h1>
<p>Generated at: ${payload.meta.generatedAt}</p>
<pre>${JSON.stringify(payload, null, 2)}</pre>
</body></html>`;
  await fs.writeFile(htmlPath, html, 'utf8');

  console.log('stretto.chain8.report generated', {
    stopReason: report.stats.stopReason,
    resultCount: report.results.length,
    maxDepthReached: report.stats.maxDepthReached,
    jsonPath,
    htmlPath,
  });
}

run().catch((error) => {
  console.error('stretto.chain8.report failed');
  console.error(error);
  process.exit(1);
});
