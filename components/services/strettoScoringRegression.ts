import assert from 'node:assert/strict';
import { SCORING } from './strettoConstants';

interface ScoreFixture {
  id: string;
  qualityPenaltyFraction: number;
  additiveDelta: number;
}

const FIXTURES: ScoreFixture[] = [
  { id: 'A_pristine_dense', qualityPenaltyFraction: 0.08, additiveDelta: 120 },
  { id: 'B_clean_compact', qualityPenaltyFraction: 0.15, additiveDelta: 260 },
  { id: 'C_balanced', qualityPenaltyFraction: 0.27, additiveDelta: 180 },
  { id: 'D_harmonic_risk', qualityPenaltyFraction: 0.35, additiveDelta: 170 },
  { id: 'E_noisy_but_complex', qualityPenaltyFraction: 0.42, additiveDelta: 150 },
  { id: 'F_sparse', qualityPenaltyFraction: 0.48, additiveDelta: 40 },
  { id: 'G_poor_quality', qualityPenaltyFraction: 0.63, additiveDelta: -90 },
  { id: 'H_extreme_penalties', qualityPenaltyFraction: 0.82, additiveDelta: -310 },
];

function legacyScore(f: ScoreFixture): number {
  const quality = Math.round(1000 * (1 - f.qualityPenaltyFraction));
  const raw = quality + f.additiveDelta;
  return Math.max(0, Math.min(2000, raw));
}

function baseZeroScore(f: ScoreFixture): number {
  const U_quality = Math.round(
    SCORING.QUALITY_UTILITY_SCALE * (SCORING.QUALITY_NEUTRAL_PENALTY - f.qualityPenaltyFraction)
  );
  const raw = U_quality + f.additiveDelta;
  return Math.max(SCORING.SCORE_MIN, Math.min(SCORING.SCORE_MAX, raw));
}

function rank(fixtures: ScoreFixture[], scorer: (f: ScoreFixture) => number): string[] {
  return [...fixtures].sort((a, b) => scorer(b) - scorer(a)).map((f) => f.id);
}

function runRegression() {
  const oldRanking = rank(FIXTURES, legacyScore);
  const newRanking = rank(FIXTURES, baseZeroScore);

  assert.deepEqual(newRanking, oldRanking, 'Ranking inversion detected between legacy and base-0 formulations.');

  for (const fixture of FIXTURES) {
    const oldScore = legacyScore(fixture);
    const newScore = baseZeroScore(fixture);
    assert.equal(newScore, oldScore - 1000, `Affine shift invariant failed for ${fixture.id}.`);
  }

  console.log('PASS: stretto scoring regression preserved ranking monotonicity for fixture set.');
  console.log(`Legacy ranking: ${oldRanking.join(' > ')}`);
  console.log(`Base-0 ranking: ${newRanking.join(' > ')}`);
}

runRegression();
