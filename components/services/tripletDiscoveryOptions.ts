export type TripletInversionPair = {
  firstIsInverted: boolean;
  secondIsInverted: boolean;
};

/**
 * 'tightening' — only enumerate pairs where d_te_2 < d_te_1 (stretto progressive tightening)
 * 'unconstrained' — enumerate all (d_te_1, d_te_2) combinations
 */
export type TripletDelayOrderingMode = 'tightening' | 'unconstrained';

export function enumerateTripletInversionPairs(includeInversions: boolean): TripletInversionPair[] {
  if (!includeInversions) {
    return [{ firstIsInverted: false, secondIsInverted: false }];
  }
  // Consecutive inversions are disallowed. Since e0 is fixed non-inverted,
  // only one of e1/e2 may be inverted.
  return [
    { firstIsInverted: false, secondIsInverted: false },
    { firstIsInverted: true, secondIsInverted: false },
    { firstIsInverted: false, secondIsInverted: true }
  ];
}

/**
 * d_te_2 is the relative gap from e1 to e2 — always starts at the minimum step.
 */
export function computeSecondDelayStart(_d_te_1_ticks: number, stepTicks: number): number {
  return stepTicks;
}

/**
 * Upper bound for d_te_2 (the e1→e2 gap).
 * 'tightening': d_te_2 must be strictly less than d_te_1 (progressive stretto).
 * 'unconstrained': d_te_2 can be up to maxDelay.
 */
export function computeSecondDelayEnd(
  d_te_1_ticks: number,
  maxDelay: number,
  stepTicks: number,
  mode: TripletDelayOrderingMode
): number {
  if (mode === 'tightening') {
    // d_te_2 < d_te_1 — largest valid d_te_2 is one step below d_te_1
    return d_te_1_ticks - stepTicks;
  }
  return maxDelay;
}
