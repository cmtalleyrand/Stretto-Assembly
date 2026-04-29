// Pairwise harmonic survival rate per (vA, vB, delay) — for 3 plausible
// subjects. Reports % of (vA, vB, d) tuples for which NO transposition
// passes the harmonic check, then re-runs the |Seq_A| DP applying that
// elimination as an additional transition filter.

import { checkCounterpointStructureWithBassRole, isVoicePairAllowedForTransposition } from './strettoGenerator';
import { getInvertedPitch } from './strettoCore';
import type { SubjectVariant, InternalNote } from './strettoScoring';

const ppq = 480;
const delayStep = ppq / 2;

interface Subject {
    name: string;
    SbBeats: number;
    pivotMidi: number;
    scaleRoot: number;
    scaleMode: 'Major' | 'Minor';
    notes: { pitch: number; relBeat: number; durBeat: number }[];
}

// Three plausible subjects.
const subjects: Subject[] = [
    {
        name: 'S1: 4-beat C-major stepwise',
        SbBeats: 4, pivotMidi: 64, scaleRoot: 0, scaleMode: 'Major',
        notes: [
            { pitch: 60, relBeat: 0,   durBeat: 1 },
            { pitch: 62, relBeat: 1,   durBeat: 1 },
            { pitch: 64, relBeat: 2,   durBeat: 1 },
            { pitch: 65, relBeat: 3,   durBeat: 1 }
        ]
    },
    {
        name: 'S2: 8-beat subject with leap and rhythmic variety',
        SbBeats: 8, pivotMidi: 65, scaleRoot: 0, scaleMode: 'Major',
        notes: [
            { pitch: 60, relBeat: 0,   durBeat: 1 },
            { pitch: 64, relBeat: 1,   durBeat: 0.5 },   // leap up a third
            { pitch: 67, relBeat: 1.5, durBeat: 0.5 },   // up a fifth
            { pitch: 65, relBeat: 2,   durBeat: 1 },
            { pitch: 64, relBeat: 3,   durBeat: 1 },
            { pitch: 62, relBeat: 4,   durBeat: 1 },
            { pitch: 60, relBeat: 5,   durBeat: 2 },
            { pitch: 64, relBeat: 7,   durBeat: 1 }
        ]
    },
    {
        name: 'S3: 12-beat subject (3 measures of 4/4)',
        SbBeats: 12, pivotMidi: 67, scaleRoot: 0, scaleMode: 'Major',
        notes: [
            { pitch: 60, relBeat: 0,    durBeat: 0.5 },
            { pitch: 64, relBeat: 0.5,  durBeat: 0.5 },
            { pitch: 67, relBeat: 1,    durBeat: 1 },
            { pitch: 65, relBeat: 2,    durBeat: 1 },
            { pitch: 64, relBeat: 3,    durBeat: 1 },
            { pitch: 67, relBeat: 4,    durBeat: 0.5 },
            { pitch: 71, relBeat: 4.5,  durBeat: 0.5 },
            { pitch: 72, relBeat: 5,    durBeat: 1 },
            { pitch: 71, relBeat: 6,    durBeat: 1 },
            { pitch: 69, relBeat: 7,    durBeat: 1 },
            { pitch: 67, relBeat: 8,    durBeat: 1 },
            { pitch: 65, relBeat: 9,    durBeat: 1 },
            { pitch: 64, relBeat: 10,   durBeat: 1 },
            { pitch: 60, relBeat: 11,   durBeat: 1 }
        ]
    }
];

// Traditional transposition pool (matches tradTranspositions in fixtures).
const transpositions = [-31, -29, -19, -17, -7, -5, 0, 5, 7, 17, 19, 29, 31, -24, -12, 12, 24];

function buildVariants(s: Subject, truncBeats: number): SubjectVariant[] {
    const lengthTicks = Math.round(s.SbBeats * ppq);
    const baseNotes: InternalNote[] = s.notes.map(n => ({
        pitch: n.pitch,
        relTick: Math.round(n.relBeat * ppq),
        durationTicks: Math.round(n.durBeat * ppq)
    }));
    const N: SubjectVariant = { type: 'N', truncationBeats: 0, lengthTicks, notes: baseNotes };
    const invNotes: InternalNote[] = baseNotes.map(n => ({
        ...n,
        pitch: getInvertedPitch(n.pitch, s.pivotMidi, s.scaleRoot, s.scaleMode, false)
    }));
    const I: SubjectVariant = { type: 'I', truncationBeats: 0, lengthTicks, notes: invNotes };
    const truncTicks = Math.round(truncBeats * ppq);
    const truncatedLength = lengthTicks - truncTicks;
    const TN: SubjectVariant = {
        type: 'N', truncationBeats: truncBeats, lengthTicks: truncatedLength,
        notes: baseNotes
            .filter(n => n.relTick < truncatedLength)
            .map(n => ({ relTick: n.relTick, durationTicks: Math.min(n.durationTicks, truncatedLength - n.relTick), pitch: n.pitch }))
    };
    const TI: SubjectVariant = {
        type: 'I', truncationBeats: truncBeats, lengthTicks: truncatedLength,
        notes: invNotes
            .filter(n => n.relTick < truncatedLength)
            .map(n => ({ relTick: n.relTick, durationTicks: Math.min(n.durationTicks, truncatedLength - n.relTick), pitch: n.pitch }))
    };
    return [N, I, TN, TI];
}

const VARIANT_LABEL: Record<number, 'N'|'I'|'T_N'|'T_I'> = { 0: 'N', 1: 'I', 2: 'T_N', 3: 'T_I' };

function variantTypeIndex(v: SubjectVariant): 0 | 1 | 2 {
    if (v.truncationBeats > 0) return 2;
    return v.type === 'I' ? 1 : 0;
}

interface PairStats { tested: number; aliveAtLeastOneT: number; }

function analyzeSubject(s: Subject) {
    console.log(`\n=== ${s.name} (Sb=${s.SbBeats} beats) ===`);
    const variants = buildVariants(s, 1);
    const lengthTicks = variants[0].lengthTicks;
    const dMaxTicks = Math.floor(2 * lengthTicks / 3);
    const halfTicks = Math.floor(lengthTicks / 2);
    const longThresholdTicks = Math.floor(lengthTicks / 3);

    // Sweep (vA, vB, d) for all valid pairings (respecting A.8: not both transformed).
    const counts = new Map<string, PairStats>();
    let totalTested = 0;
    let totalAlive = 0;

    for (let iA = 0; iA < variants.length; iA++) {
        for (let iB = 0; iB < variants.length; iB++) {
            const vA = variants[iA];
            const vB = variants[iB];
            const aTransform = vA.type === 'I' || vA.truncationBeats > 0;
            const bTransform = vB.type === 'I' || vB.truncationBeats > 0;
            // A.8 rules out (transform → transform) so don't waste time on those.
            if (aTransform && bTransform) continue;

            // Delay range: A.6 d ≤ 2/3 prevLen; non-canon first-pos d ≥ Sb/2 not enforced here
            // because here we test arbitrary adjacency, not just (e_0, e_1).
            const lenA = vA.lengthTicks;
            const dMaxForPair = Math.floor(2 * lenA / 3);

            for (let d = delayStep; d <= dMaxForPair; d += delayStep) {
                // A.10 if vB is truncated and d ≥ Sb/2: skip (rule blocks)
                if (vB.truncationBeats > 0 && d >= halfTicks) continue;
                let alive = false;
                for (const t of transpositions) {
                    const r = checkCounterpointStructureWithBassRole(
                        vA, vB, d, t, 0.5, 'provisional', ppq, 4, 4, false, true
                    );
                    if (r.compatible) { alive = true; break; }
                }
                totalTested++;
                if (alive) totalAlive++;
                const key = `${variantTypeIndex(vA)}->${variantTypeIndex(vB)}`;
                const stats = counts.get(key) ?? { tested: 0, aliveAtLeastOneT: 0 };
                stats.tested++;
                if (alive) stats.aliveAtLeastOneT++;
                counts.set(key, stats);
            }
        }
    }

    console.log(`Total (vA, vB, d) tuples tested: ${totalTested}`);
    console.log(`Alive (≥1 valid t):              ${totalAlive}  (${(100*totalAlive/totalTested).toFixed(1)}%)`);
    console.log(`Dead  (no valid t):              ${totalTested - totalAlive}  (${(100*(totalTested-totalAlive)/totalTested).toFixed(1)}%)`);
    console.log(`Per (vA→vB):`);
    for (const [k, v] of counts) {
        const labels = k.split('->').map(x => VARIANT_LABEL[Number(x) as 0|1|2]).join('->');
        const dead = v.tested - v.aliveAtLeastOneT;
        console.log(`  ${labels.padEnd(10)}  tested=${String(v.tested).padStart(3)}  alive=${String(v.aliveAtLeastOneT).padStart(3)}  dead=${String(dead).padStart(3)}  (${(100*dead/v.tested).toFixed(1)}% dead)`);
    }
    return { variants, counts, totalTested, totalAlive };
}

// =================================================================
// Re-run |Seq_A| DP with per-subject dead-pair filter and report impact.
// =================================================================

interface AliveTable {
    // alive[vTypeA][vTypeB][delayHalfBeats] = true iff at least one t passes
    // vType: 0=N, 1=I, 2=T (truncated; type N or I doesn't matter here for our DP
    // since the DP only tracks {N,I,T} where T conflates both truncated forms)
    table: boolean[][][];
}

function buildAliveTable(s: Subject): AliveTable {
    const variants = buildVariants(s, 1);
    const lenN = variants[0].lengthTicks;
    const halfTicks = Math.floor(lenN / 2);
    const dMaxAll = Math.floor(2 * lenN / 3);
    const SbHalfBeats = 2 * s.SbBeats;
    // table[vA][vB][δ in half-beats]
    const table: boolean[][][] = [0,1,2].map(() => [0,1,2].map(() => new Array(SbHalfBeats + 1).fill(false)));

    // We map our DP variant types {0:N, 1:I, 2:T} to the harness variants:
    //  0:N -> variants[0]; 1:I -> variants[1]; 2:T -> variants[2] (truncated N).
    // (For T, the harmonic check uses the truncated normal-form.)
    const indexFor = (t: 0|1|2) => t;

    for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
            // A.8: skip transform → transform.
            if (a !== 0 && b !== 0) continue;
            const vA = variants[indexFor(a as 0|1|2)];
            const vB = variants[indexFor(b as 0|1|2)];
            for (let dHalfBeats = 1; dHalfBeats <= SbHalfBeats; dHalfBeats++) {
                const dTicks = Math.round(dHalfBeats * (ppq / 2));
                if (dTicks > Math.floor(2 * vA.lengthTicks / 3)) break;
                if (vB.truncationBeats > 0 && dTicks >= halfTicks) continue;
                let alive = false;
                for (const t of transpositions) {
                    const r = checkCounterpointStructureWithBassRole(
                        vA, vB, dTicks, t, 0.5, 'provisional', ppq, 4, 4, false, true
                    );
                    if (r.compatible) { alive = true; break; }
                }
                table[a][b][dHalfBeats] = alive;
            }
        }
    }
    return { table };
}

type V = 0 | 1 | 2;

function countSeqAWithFilter(SbBeats: number, n: number, qI: number, qT: number, alive: AliveTable | null): number {
    const Sb = 2 * SbBeats;
    const dMax = Math.floor(4 * SbBeats / 3);
    const L = Math.floor(2 * SbBeats / 3);
    const H = SbBeats;
    const longCount = Math.max(0, dMax - L);
    const longBit = (delta: number) => (delta > L ? (1 << (delta - L - 1)) : 0);
    const key = (d: number, dp: number, v: V, U: number, kI: number, kT: number) =>
        ((((((d * 32 + dp) * 4 + v) * (1 << longCount) + U) * 32 + kI) * 32 + kT));

    let layer = new Map<number, number>();
    for (let d = H; d <= dMax; d++) {
        // First-position alive check: no prior variant; effectively v_prev = N (root).
        if (alive && !alive.table[0][0][d]) continue;
        layer.set(key(d, 0, 0, longBit(d), 0, 0), 1);
    }

    for (let i = 2; i <= n - 1; i++) {
        const next = new Map<number, number>();
        for (const [k, mult] of layer) {
            let kk = k;
            const kT_v = kk % 32; kk = Math.floor(kk / 32);
            const kI_v = kk % 32; kk = Math.floor(kk / 32);
            const U = kk % (1 << longCount); kk = Math.floor(kk / (1 << longCount));
            const v = (kk % 4) as V; kk = Math.floor(kk / 4);
            const dp = kk % 32; kk = Math.floor(kk / 32);
            const d = kk;

            const prevLenBeats = (v === 2) ? (SbBeats - 1) : SbBeats;
            const A5 = Math.floor(prevLenBeats / 2);
            const lo = Math.max(1, d - A5);
            const hi = dMax;
            for (let dN = lo; dN <= hi; dN++) {
                if (Math.max(d, dN) >= H && !(dN < d)) continue;
                if (i >= 2 && dp !== 0 && d > dp && d > L && !(dN <= dp - 1)) continue;
                if (v === 2 && d > L && !(d - dN >= 2)) continue;
                if (dN > L && (U & longBit(dN))) continue;
                const Unext = U | longBit(dN);
                const vChoices: V[] = (v === 1 || v === 2) ? [0] : [0, 1, 2];
                for (const vN of vChoices) {
                    if (dN >= H && vN === 2) continue;
                    const kInext = kI_v + (vN === 1 ? 1 : 0);
                    const kTnext = kT_v + (vN === 2 ? 1 : 0);
                    if (kInext > qI) continue;
                    if (kTnext > qT) continue;
                    // Harmonic survival filter: (v, vN, dN) must have ≥1 valid t.
                    if (alive && !alive.table[v][vN][dN]) continue;
                    const k2 = key(dN, d, vN, Unext, kInext, kTnext);
                    next.set(k2, (next.get(k2) ?? 0) + mult);
                }
            }
        }
        layer = next;
    }
    let total = 0;
    for (const v of layer.values()) total += v;
    return total;
}

console.log('\n\n==== Impact of pairwise harmonic survival on |Seq_A| ====');
console.log('Subject                                  Sb   n  qI qT  |Seq_A| (rules only)  |Seq_A| (rules+harm)  reduction');
console.log('---------------------------------------  ---  -  -- --  --------------------  --------------------  ---------');

const dpConfigs = [
    { n: 8, qI: 0,  qT: 0  },
    { n: 8, qI: 1,  qT: 1  },
    { n: 8, qI: 99, qT: 99 }
];

for (const s of subjects) {
    analyzeSubject(s);
    const alive = buildAliveTable(s);
    for (const c of dpConfigs) {
        const baseline = countSeqAWithFilter(s.SbBeats, c.n, c.qI, c.qT, null);
        const filtered = countSeqAWithFilter(s.SbBeats, c.n, c.qI, c.qT, alive);
        const pct = baseline > 0 ? (100 * (baseline - filtered) / baseline).toFixed(1) : '—';
        console.log(
            `${s.name.padEnd(40)} ${String(s.SbBeats).padStart(3)}  ${c.n}  ${String(c.qI).padStart(2)} ${String(c.qT).padStart(2)}  ${String(baseline).padStart(20)}  ${String(filtered).padStart(20)}  ${pct.padStart(8)}%`
        );
    }
}
