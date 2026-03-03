import { writeFileSync, mkdirSync } from 'node:fs';
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

const ppq = 12;
const subject = makeTwelveBeatSubject(ppq);
const options = {
  ensembleTotal: 4,
  targetChainLength: 80,
  subjectVoiceIndex: 2,
  truncationMode: 'None',
  truncationTargetBeats: 0,
  inversionMode: 'None',
  useChromaticInversion: true,
  thirdSixthMode: 'None',
  pivotMidi: 60,
  requireConsonantEnd: false,
  disallowComplexExceptions: false,
  maxPairwiseDissonance: 1,
  scaleRoot: 0,
  scaleMode: 'Major',
};

const realNow = Date.now;
let fakeNow = 0;
Date.now = () => {
  fakeNow += 500;
  return fakeNow;
};

const report = await searchStrettoChains(subject, options, ppq);
Date.now = realNow;

const topEntries = report.results[0]?.entries ?? [];

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Stretto chain-80 test report</title>
<style>
body { font-family: Arial, sans-serif; margin: 24px; line-height: 1.3; }
code { background:#f4f4f4; padding:2px 6px; border-radius:4px; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
th { background: #f6f8fa; }
.grid { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; }
</style>
</head>
<body>
<h1>Stretto Assembly Test Input → Output</h1>
<p>Scenario: <code>12-beat subject</code>, <code>12 notes</code>, <code>targetChainLength: 80</code>.</p>
<div class="grid">
  <div>
    <h2>Input Subject</h2>
    <table>
      <thead><tr><th>#</th><th>MIDI</th><th>ticks</th><th>durationTicks</th></tr></thead>
      <tbody>
        ${subject.map((n, i) => `<tr><td>${i + 1}</td><td>${n.midi}</td><td>${n.ticks}</td><td>${n.durationTicks}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div>
    <h2>Search Report</h2>
    <ul>
      <li>nodesVisited: <strong>${report.stats.nodesVisited}</strong></li>
      <li>maxDepthReached: <strong>${report.stats.maxDepthReached}</strong></li>
      <li>stopReason: <strong>${report.stats.stopReason}</strong></li>
      <li>resultCount: <strong>${report.results.length}</strong></li>
    </ul>
    <h3>Top chain entries (if any)</h3>
    <table>
      <thead><tr><th>i</th><th>startBeat</th><th>transposition</th><th>voiceIndex</th></tr></thead>
      <tbody>
        ${topEntries.length ? topEntries.map((e, i) => `<tr><td>${i + 1}</td><td>${e.startBeat}</td><td>${e.transposition}</td><td>${e.voiceIndex}</td></tr>`).join('') : '<tr><td colspan="4">No results returned</td></tr>'}
      </tbody>
    </table>
  </div>
</div>
</body></html>`;

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/stretto-chain80-report.html', html);
writeFileSync('artifacts/stretto-chain80-report.json', JSON.stringify({ subject, options, report }, null, 2));

console.log('Generated artifacts/stretto-chain80-report.html and artifacts/stretto-chain80-report.json');
