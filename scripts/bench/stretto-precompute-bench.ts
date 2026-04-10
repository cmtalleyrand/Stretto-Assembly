import { performance } from 'node:perf_hooks';

type FixtureName = 'small' | 'medium' | 'stress';

interface PairRecord {
  dissonanceRatio: number;
  hasFourth: boolean;
  hasVoiceCrossing: boolean;
  maxDissonanceRunEvents: number;
  intervalClass: number;
}

interface PairTuple {
  vA: number;
  vB: number;
  delay: number;
  transposition: number;
  record: PairRecord;
}

interface Fixture {
  name: FixtureName;
  variantCount: number;
  delays: number[];
  transpositions: number[];
  tuples: PairTuple[];
}

interface BenchConfig {
  warmupIterations: number;
  measuredIterations: number;
  fixtures: FixtureName[];
}

interface IterationMetrics {
  ms: number;
  heapUsedDeltaBytes: number | null;
  checksum: bigint;
  recordsMaterialized: number;
}

interface BackendStats {
  backend: 'map' | 'dense';
  fixture: FixtureName;
  iterations: IterationMetrics[];
}

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const FNV_MASK_64 = 0xffffffffffffffffn;

function parseArgs(argv: string[]): BenchConfig {
  const args = new Set(argv);
  const argByPrefix = (prefix: string): string | undefined => argv.find((arg) => arg.startsWith(prefix));

  const ciMode = args.has('--ci') || argByPrefix('--mode=') === '--mode=ci';
  const warmupOverride = argByPrefix('--warmup=');
  const iterationsOverride = argByPrefix('--iterations=');
  const fixtureArg = argByPrefix('--fixture=');

  const warmupIterations = warmupOverride
    ? Number.parseInt(warmupOverride.split('=')[1], 10)
    : ciMode
      ? 2
      : 5;

  const measuredIterations = iterationsOverride
    ? Number.parseInt(iterationsOverride.split('=')[1], 10)
    : ciMode
      ? 6
      : 20;

  if (!Number.isFinite(warmupIterations) || warmupIterations < 0) {
    throw new Error(`Invalid --warmup value: ${warmupOverride}`);
  }
  if (!Number.isFinite(measuredIterations) || measuredIterations <= 0) {
    throw new Error(`Invalid --iterations value: ${iterationsOverride}`);
  }

  const fixtures: FixtureName[] = fixtureArg
    ? fixtureArg.split('=')[1].split(',').map((value) => value.trim()).filter(Boolean) as FixtureName[]
    : ['small', 'medium', 'stress'];

  const allowed = new Set<FixtureName>(['small', 'medium', 'stress']);
  for (const fixture of fixtures) {
    if (!allowed.has(fixture)) {
      throw new Error(`Invalid fixture name: ${fixture}. Allowed: small, medium, stress`);
    }
  }

  return {
    warmupIterations,
    measuredIterations,
    fixtures
  };
}

function createDeterministicFixtures(): Record<FixtureName, Fixture> {
  return {
    small: buildFixture('small', 6, 8, 7, 17),
    medium: buildFixture('medium', 16, 18, 15, 29),
    stress: buildFixture('stress', 28, 36, 25, 41)
  };
}

function buildFixture(
  name: FixtureName,
  variantCount: number,
  delayCardinality: number,
  transpositionCardinality: number,
  seed: number
): Fixture {
  const delays = Array.from({ length: delayCardinality }, (_, index) => index * 120);
  const transpositions = Array.from({ length: transpositionCardinality }, (_, index) => index - Math.floor(transpositionCardinality / 2));

  let rng = seed >>> 0;
  const nextRand = (): number => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 0x100000000;
  };

  const tuples: PairTuple[] = [];
  for (let vA = 0; vA < variantCount; vA++) {
    for (let vB = 0; vB < variantCount; vB++) {
      if (vA === vB) continue;
      for (const delay of delays) {
        for (const transposition of transpositions) {
          const admit = ((vA * 31 + vB * 17 + delay + transposition * 13) % 11) < 5;
          const stochasticGate = nextRand() > 0.4;
          if (!admit || !stochasticGate) continue;
          const intervalClass = ((transposition % 12) + 12) % 12;
          tuples.push({
            vA,
            vB,
            delay,
            transposition,
            record: {
              dissonanceRatio: Number((nextRand() * 0.8).toFixed(6)),
              hasFourth: intervalClass === 5,
              hasVoiceCrossing: nextRand() > 0.84,
              maxDissonanceRunEvents: 1 + Math.floor(nextRand() * 3),
              intervalClass
            }
          });
        }
      }
    }
  }

  return { name, variantCount, delays, transpositions, tuples };
}

function maybeRunGc(): void {
  const maybeGc = (globalThis as { gc?: () => void }).gc;
  if (typeof maybeGc === 'function') {
    maybeGc();
  }
}

function benchmarkBackend(
  backend: 'map' | 'dense',
  fixture: Fixture,
  measuredIterations: number,
  warmupIterations: number
): BackendStats {
  const iterations: IterationMetrics[] = [];

  const run = backend === 'map' ? runMapBackend : runDenseBackend;

  for (let i = 0; i < warmupIterations; i++) {
    run(fixture);
  }

  for (let i = 0; i < measuredIterations; i++) {
    maybeRunGc();
    const before = typeof process.memoryUsage === 'function' ? process.memoryUsage().heapUsed : null;
    const start = performance.now();
    const result = run(fixture);
    const end = performance.now();
    const after = typeof process.memoryUsage === 'function' ? process.memoryUsage().heapUsed : null;

    iterations.push({
      ms: end - start,
      heapUsedDeltaBytes: before === null || after === null ? null : after - before,
      checksum: result.checksum,
      recordsMaterialized: result.recordsMaterialized
    });
  }

  return { backend, fixture: fixture.name, iterations };
}

function runMapBackend(fixture: Fixture): { checksum: bigint; recordsMaterialized: number } {
  const byVA = new Map<number, Map<number, Map<number, Map<number, PairRecord>>>>();
  for (const tuple of fixture.tuples) {
    let byVB = byVA.get(tuple.vA);
    if (!byVB) {
      byVB = new Map();
      byVA.set(tuple.vA, byVB);
    }
    let byDelay = byVB.get(tuple.vB);
    if (!byDelay) {
      byDelay = new Map();
      byVB.set(tuple.vB, byDelay);
    }
    let byTransposition = byDelay.get(tuple.delay);
    if (!byTransposition) {
      byTransposition = new Map();
      byDelay.set(tuple.delay, byTransposition);
    }
    byTransposition.set(tuple.transposition, tuple.record);
  }

  let checksum = FNV_OFFSET_BASIS_64;
  let count = 0;
  for (let vA = 0; vA < fixture.variantCount; vA++) {
    for (let vB = 0; vB < fixture.variantCount; vB++) {
      if (vA === vB) continue;
      for (const delay of fixture.delays) {
        for (const transposition of fixture.transpositions) {
          const record = byVA.get(vA)?.get(vB)?.get(delay)?.get(transposition);
          if (!record) continue;
          count++;
          checksum = hashRecord(checksum, vA, vB, delay, transposition, record);
        }
      }
    }
  }
  return { checksum, recordsMaterialized: count };
}

function runDenseBackend(fixture: Fixture): { checksum: bigint; recordsMaterialized: number } {
  const delayIndex = new Map<number, number>(fixture.delays.map((delay, idx) => [delay, idx]));
  const transpositionIndex = new Map<number, number>(fixture.transpositions.map((value, idx) => [value, idx]));

  const totalSlots = fixture.variantCount * fixture.variantCount * fixture.delays.length * fixture.transpositions.length;

  const present = new Uint8Array(totalSlots);
  const dissonanceRatio = new Float64Array(totalSlots);
  const maxRunEvents = new Uint8Array(totalSlots);
  const flags = new Uint8Array(totalSlots);
  const intervalClass = new Uint8Array(totalSlots);

  const offsetOf = (vA: number, vB: number, delayIdx: number, transpositionIdx: number): number => {
    return (((vA * fixture.variantCount + vB) * fixture.delays.length + delayIdx) * fixture.transpositions.length) + transpositionIdx;
  };

  for (const tuple of fixture.tuples) {
    const delayIdx = delayIndex.get(tuple.delay);
    const transpositionIdx = transpositionIndex.get(tuple.transposition);
    if (delayIdx === undefined || transpositionIdx === undefined) {
      throw new Error('Dense index construction failed due to unsupported key.');
    }
    const offset = offsetOf(tuple.vA, tuple.vB, delayIdx, transpositionIdx);
    present[offset] = 1;
    dissonanceRatio[offset] = tuple.record.dissonanceRatio;
    maxRunEvents[offset] = tuple.record.maxDissonanceRunEvents;
    intervalClass[offset] = tuple.record.intervalClass;
    flags[offset] = (tuple.record.hasFourth ? 1 : 0) | (tuple.record.hasVoiceCrossing ? 2 : 0);
  }

  let checksum = FNV_OFFSET_BASIS_64;
  let count = 0;
  for (let vA = 0; vA < fixture.variantCount; vA++) {
    for (let vB = 0; vB < fixture.variantCount; vB++) {
      if (vA === vB) continue;
      for (let delayIdx = 0; delayIdx < fixture.delays.length; delayIdx++) {
        for (let transpositionIdx = 0; transpositionIdx < fixture.transpositions.length; transpositionIdx++) {
          const offset = offsetOf(vA, vB, delayIdx, transpositionIdx);
          if (present[offset] === 0) continue;
          count++;
          checksum = hashDenseRecord(
            checksum,
            vA,
            vB,
            fixture.delays[delayIdx],
            fixture.transpositions[transpositionIdx],
            dissonanceRatio[offset],
            flags[offset],
            maxRunEvents[offset],
            intervalClass[offset]
          );
        }
      }
    }
  }

  return { checksum, recordsMaterialized: count };
}

function hashRecord(
  checksum: bigint,
  vA: number,
  vB: number,
  delay: number,
  transposition: number,
  record: PairRecord
): bigint {
  let hash = checksum;
  hash = fnv1aAdd(hash, vA);
  hash = fnv1aAdd(hash, vB);
  hash = fnv1aAdd(hash, delay);
  hash = fnv1aAdd(hash, transposition);
  hash = fnv1aAdd(hash, Math.trunc(record.dissonanceRatio * 1_000_000));
  hash = fnv1aAdd(hash, record.hasFourth ? 1 : 0);
  hash = fnv1aAdd(hash, record.hasVoiceCrossing ? 1 : 0);
  hash = fnv1aAdd(hash, record.maxDissonanceRunEvents);
  hash = fnv1aAdd(hash, record.intervalClass);
  return hash;
}

function hashDenseRecord(
  checksum: bigint,
  vA: number,
  vB: number,
  delay: number,
  transposition: number,
  denseDissonanceRatio: number,
  denseFlags: number,
  denseMaxRunEvents: number,
  denseIntervalClass: number
): bigint {
  let hash = checksum;
  hash = fnv1aAdd(hash, vA);
  hash = fnv1aAdd(hash, vB);
  hash = fnv1aAdd(hash, delay);
  hash = fnv1aAdd(hash, transposition);
  hash = fnv1aAdd(hash, Math.trunc(denseDissonanceRatio * 1_000_000));
  hash = fnv1aAdd(hash, denseFlags & 1);
  hash = fnv1aAdd(hash, (denseFlags & 2) >>> 1);
  hash = fnv1aAdd(hash, denseMaxRunEvents);
  hash = fnv1aAdd(hash, denseIntervalClass);
  return hash;
}

function fnv1aAdd(hash: bigint, value: number): bigint {
  return ((hash ^ BigInt(value >>> 0)) * FNV_PRIME_64) & FNV_MASK_64;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'n/a';
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function summarize(stats: BackendStats): {
  backend: string;
  fixture: FixtureName;
  iterations: number;
  meanMs: number;
  p50Ms: number;
  minMs: number;
  maxMs: number;
  meanHeapDelta: number | null;
  checksum: string;
  recordsMaterialized: number;
} {
  const times = stats.iterations.map((entry) => entry.ms);
  const heapDeltas = stats.iterations
    .map((entry) => entry.heapUsedDeltaBytes)
    .filter((value): value is number => typeof value === 'number');

  const checksum = stats.iterations[0]?.checksum ?? 0n;
  const recordsMaterialized = stats.iterations[0]?.recordsMaterialized ?? 0;

  return {
    backend: stats.backend,
    fixture: stats.fixture,
    iterations: stats.iterations.length,
    meanMs: mean(times),
    p50Ms: percentile(times, 0.5),
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    meanHeapDelta: heapDeltas.length > 0 ? mean(heapDeltas) : null,
    checksum: `0x${checksum.toString(16)}`,
    recordsMaterialized
  };
}

function printSummaryRow(summary: ReturnType<typeof summarize>): void {
  console.log([
    summary.fixture.padEnd(7),
    summary.backend.padEnd(6),
    `iter=${String(summary.iterations).padStart(2)}`,
    `mean=${summary.meanMs.toFixed(3)}ms`,
    `p50=${summary.p50Ms.toFixed(3)}ms`,
    `min=${summary.minMs.toFixed(3)}ms`,
    `max=${summary.maxMs.toFixed(3)}ms`,
    `heapΔ=${formatBytes(summary.meanHeapDelta)}`,
    `records=${summary.recordsMaterialized}`,
    `checksum=${summary.checksum}`
  ].join(' | '));
}

function main(): void {
  const config = parseArgs(process.argv.slice(2));
  const fixtures = createDeterministicFixtures();

  console.log('stretto-precompute-bench');
  console.log(`mode: warmup=${config.warmupIterations}, measured=${config.measuredIterations}`);

  for (const fixtureName of config.fixtures) {
    const fixture = fixtures[fixtureName];
    const mapStats = benchmarkBackend('map', fixture, config.measuredIterations, config.warmupIterations);
    const denseStats = benchmarkBackend('dense', fixture, config.measuredIterations, config.warmupIterations);

    const mapSummary = summarize(mapStats);
    const denseSummary = summarize(denseStats);

    printSummaryRow(mapSummary);
    printSummaryRow(denseSummary);

    const equivalent = mapSummary.checksum === denseSummary.checksum
      && mapSummary.recordsMaterialized === denseSummary.recordsMaterialized;

    console.log(`equivalent(${fixtureName})=${equivalent ? 'yes' : 'no'}`);
    if (!equivalent) {
      process.exitCode = 1;
    }
    console.log('');
  }
}

main();
