export type TripletInversionPair = {
  firstIsInverted: boolean;
  secondIsInverted: boolean;
};

export type TripletDelayOrderingMode = 'allow_equal' | 'strict_increasing';

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

export function computeSecondDelayStart(
  firstDelayTicks: number,
  stepTicks: number,
  mode: TripletDelayOrderingMode
): number {
  return mode === 'allow_equal' ? firstDelayTicks : firstDelayTicks + stepTicks;
}
