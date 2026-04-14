export type TripletInversionPair = {
  firstIsInverted: boolean;
  secondIsInverted: boolean;
};

/**
 * 'tightening' — only enumerate pairs where d2 < d1 (stretto progressive tightening)
 * 'unconstrained' — enumerate all (d1, d2) combinations
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
 * d2 is the relative gap from e1 to e2 — always starts at the minimum step.
 */
export function computeSecondDelayStart(_firstDelayTicks: number, stepTicks: number): number {
  return stepTicks;
}

/**
 * Upper bound for d2 (the e1→e2 gap).
 * 'tightening': d2 must be strictly less than d1 (progressive stretto).
 * 'unconstrained': d2 can be up to maxDelay.
 */
export function computeSecondDelayEnd(
  firstDelayTicks: number,
  maxDelay: number,
  stepTicks: number,
  mode: TripletDelayOrderingMode
): number {
  if (mode === 'tightening') {
    // d2 < d1 — largest valid d2 is one step below d1
    return firstDelayTicks - stepTicks;
  }
  return maxDelay;
}
