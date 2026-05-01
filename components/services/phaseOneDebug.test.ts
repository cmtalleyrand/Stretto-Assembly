// Trace why Phase 1 misses the chain
//   0:0|1200:7|2160:-7|2640:-12 (all type N, length 1920)
// at baseOptions / H=4.

import { checkCounterpointStructureWithBassRole } from './strettoGenerator';
import type { RawNote } from '../../types';

const ppq = 480;
const baseSubject: RawNote[] = [
    { midi: 60, ticks: 0, durationTicks: 480, velocity: 90, name: 'C4' },
    { midi: 62, ticks: 480, durationTicks: 480, velocity: 90, name: 'D4' },
    { midi: 64, ticks: 960, durationTicks: 480, velocity: 90, name: 'E4' },
    { midi: 65, ticks: 1440, durationTicks: 480, velocity: 90, name: 'F4' }
];

import type { SubjectVariant, InternalNote } from './strettoScoring';
const baseNotes: InternalNote[] = baseSubject.map(n => ({
    relTick: n.ticks, durationTicks: n.durationTicks, pitch: n.midi
}));
const variant: SubjectVariant = { type: 'N', truncationBeats: 0, lengthTicks: 1920, notes: baseNotes };

// Chain: starts at [0, 1200, 2160, 2640], transpositions [0, 7, -7, -12]
const chain = [
    { start: 0,    t: 0   },
    { start: 1200, t: 7   },
    { start: 2160, t: -7  },
    { start: 2640, t: -12 }
];

console.log('Pair-harmony for every (k, i) overlapping pair in the missing chain:');
for (let i = 1; i < chain.length; i++) {
    for (let k = 0; k < i; k++) {
        const overlap = chain[k].start + 1920 > chain[i].start;
        if (!overlap) continue;
        const d = chain[i].start - chain[k].start;
        const Δt = chain[i].t - chain[k].t;
        const r = checkCounterpointStructureWithBassRole(
            variant, variant, d, Δt, 0.5, 'dissonant', ppq, 4, 4, false, true
        );
        console.log(
            `  k=${k} i=${i}  d=${d}  Δt=${Δt.toString().padStart(4)}  compatible=${r.compatible}  parallel58=${r.hasParallelPerfect58}  diss=${r.dissonanceRatio.toFixed(3)}`
        );
    }
}

// A.7 check on adjacent boundaries
console.log('\nA.7 (|Δt| ≥ 5) on adjacent boundaries:');
for (let i = 1; i < chain.length; i++) {
    const Δt = chain[i].t - chain[i - 1].t;
    console.log(`  i=${i}  Δt=${Δt}  pass=${Math.abs(Δt) >= 5}`);
}

// Parallel-P5/P8 conditional rule
console.log('\nParallel-P5/P8 at each adjacent boundary:');
const Sb = 1920, SbThird = Math.floor(Sb / 3);
console.log(`  Sb=${Sb}  SbThird=${SbThird}`);
const delays = [chain[1].start - chain[0].start, chain[2].start - chain[1].start, chain[3].start - chain[2].start];
console.log(`  delays = ${JSON.stringify(delays)}`);
for (let i = 1; i < chain.length; i++) {
    const d = chain[i].start - chain[i - 1].start;
    const Δt = chain[i].t - chain[i - 1].t;
    const r = checkCounterpointStructureWithBassRole(variant, variant, d, Δt, 0.5, 'dissonant', ppq, 4, 4, false, true);
    if (r.hasParallelPerfect58) {
        const dPrev = i >= 2 ? delays[i - 2] : null;
        const trig2 = dPrev !== null && dPrev >= SbThird && d >= SbThird;
        console.log(`  i=${i}  hasParallel=true  dPrev=${dPrev}  trigger2(both≥SbThird)=${trig2}`);
    } else {
        console.log(`  i=${i}  hasParallel=false`);
    }
}
