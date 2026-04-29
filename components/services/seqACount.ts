// Rigorous |Seq_A| count by augmented DP — one-to-one rule translation.
// Independent of strettoGenerator. All rules applied from first principles.
//
// Run: node --import tsx components/services/seqACount.ts

type V = 0 | 1 | 2; // 0 = N, 1 = I, 2 = T

interface Inputs {
    SbBeats: number;
    n: number;       // chain length (entries incl. root)
    qI: number;      // Infinity for unbounded
    qT: number;
}

function count(inp: Inputs): { total: number; states: number } {
    const Sb = 2 * inp.SbBeats;            // Sb in half-beats
    const dMax = Math.floor(4 * inp.SbBeats / 3);
    const L = Math.floor(2 * inp.SbBeats / 3);
    const H = inp.SbBeats;                  // half-beats: Sb beats / 2 ⇒ Sb half-beats
    const A5full = Math.floor(inp.SbBeats / 2);   // Sb/4 beats = Sb/2 half-beats; floor for Sb odd
    const A5trunc = Math.floor((inp.SbBeats - 1) / 2); // (Sb-2 half-beats) lengthBeats = Sb-1 ⇒ /2

    // For the truncated variant, lengthBeats = Sb - 1 (truncation = 1 beat).
    // A.5 bound = floor(prevLengthBeats / 2) in half-beats... let's be precise:
    //   d_{i-1} − d_i ≤ prevLengthBeats / 4 (beats)
    //   ⇒ δ_{i-1} − δ' ≤ prevLengthBeats / 2 (half-beats)
    // For non-truncated prev: prevLengthBeats = Sb ⇒ bound = Sb/2 half-beats.
    // For truncated prev:     prevLengthBeats = Sb−1 ⇒ bound = (Sb−1)/2 half-beats.

    // Long-delay set as bitmask over values {L+1 .. dMax}.
    const longCount = Math.max(0, dMax - L);
    if (longCount > 30) throw new Error('long pool too large for bitmask');

    const longBit = (delta: number) => (delta > L ? (1 << (delta - L - 1)) : 0);

    // State key: pack into a number for a Map.
    // (δ, δprev, v, U, kI, kT) — δ,δprev ≤ 31; v ≤ 2; U up to 2^longCount; kI,kT small.
    const key = (d: number, dp: number, v: V, U: number, kI: number, kT: number) =>
        ((((((d * 32 + dp) * 4 + v) * (1 << longCount) + U) * 32 + kI) * 32 + kT));

    // Layer 1: position 1. δ_1 ∈ [H, dMax]; v_1 = N (A.9 + A.10).
    let layer = new Map<number, number>();
    for (let d = H; d <= dMax; d++) {
        const U = longBit(d);
        layer.set(key(d, 0, 0, U, 0, 0), 1);
    }
    let totalStates = layer.size;

    // dummy "prev variant N, prev δ = 0 (sentinel; A.3 blocked by i<2)" handled in step 2.

    for (let i = 2; i <= inp.n - 1; i++) {
        const next = new Map<number, number>();
        for (const [k, mult] of layer) {
            // unpack
            let kk = k;
            const kT = kk % 32; kk = Math.floor(kk / 32);
            const kI = kk % 32; kk = Math.floor(kk / 32);
            const U = kk % (1 << longCount); kk = Math.floor(kk / (1 << longCount));
            const v = (kk % 4) as V; kk = Math.floor(kk / 4);
            const dp = kk % 32; kk = Math.floor(kk / 32);
            const d = kk;

            const prevLenBeats = (v === 2) ? (inp.SbBeats - 1) : inp.SbBeats;
            const A5 = Math.floor(prevLenBeats / 2);

            // δ' bounds
            const lo = Math.max(1, d - A5);
            const hi = dMax;
            for (let dN = lo; dN <= hi; dN++) {
                // A.2
                if (Math.max(d, dN) >= H && !(dN < d)) continue;
                // A.3
                if (i >= 2 && dp !== 0 && d > dp && d > L && !(dN <= dp - 1)) continue;
                // A.4
                if (v === 2 && d > L && !(d - dN >= 2)) continue;
                // A.1
                if (dN > L && (U & longBit(dN))) continue;

                const Unext = U | longBit(dN);

                // variant choices for v'
                const vChoices: V[] = (v === 1 || v === 2) ? [0] : [0, 1, 2];
                for (const vN of vChoices) {
                    // A.10
                    if (dN >= H && vN === 2) continue;
                    // quotas
                    const kInext = kI + (vN === 1 ? 1 : 0);
                    const kTnext = kT + (vN === 2 ? 1 : 0);
                    if (kInext > inp.qI) continue;
                    if (kTnext > inp.qT) continue;

                    const k2 = key(dN, d, vN, Unext, kInext, kTnext);
                    next.set(k2, (next.get(k2) ?? 0) + mult);
                }
            }
        }
        layer = next;
        totalStates += layer.size;
    }

    let total = 0;
    for (const v of layer.values()) total += v;
    return { total, states: totalStates };
}

const configs: Inputs[] = [
    { SbBeats: 8,  n: 6, qI: 0,        qT: 0 },
    { SbBeats: 8,  n: 8, qI: 0,        qT: 0 },
    { SbBeats: 8,  n: 8, qI: 1,        qT: 1 },
    { SbBeats: 8,  n: 8, qI: 99,       qT: 99 },
    { SbBeats: 12, n: 6, qI: 0,        qT: 0 },
    { SbBeats: 12, n: 8, qI: 0,        qT: 0 },
    { SbBeats: 12, n: 8, qI: 1,        qT: 1 },
    { SbBeats: 12, n: 8, qI: 99,       qT: 99 },
    { SbBeats: 16, n: 8, qI: 0,        qT: 0 },
    { SbBeats: 16, n: 8, qI: 1,        qT: 1 },
    { SbBeats: 16, n: 8, qI: 99,       qT: 99 }
];

console.log('Sb  n  qI  qT  |Seq_A|         dp-states');
console.log('--  -  --  --  --------------  ---------');
for (const c of configs) {
    const t0 = Date.now();
    const r = count(c);
    const ms = Date.now() - t0;
    console.log(
        `${String(c.SbBeats).padStart(2)}  ${c.n}  ${String(c.qI).padStart(2)}  ${String(c.qT).padStart(2)}  ${String(r.total).padStart(14)}  ${String(r.states).padStart(9)}  (${ms}ms)`
    );
}
