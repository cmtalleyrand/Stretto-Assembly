import { HarmonicRegion } from '../../types';

export interface HarmonicRegionDissonanceAudit {
  nctRegions: number;
  dissonantRegions: number;
  consonantRegionsWithNct: number;
}

export function computeMaxConsecutiveDissonanceRegions(regions: HarmonicRegion[]): number {
  let maxRun = 0;
  let run = 0;
  regions.forEach((region) => {
    if (region.type !== 'consonant_stable') {
      run += 1;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  });
  return maxRun;
}

export function computeHarmonicRegionDissonanceAudit(regions: HarmonicRegion[]): HarmonicRegionDissonanceAudit {
  let nctRegions = 0;
  let dissonantRegions = 0;
  let consonantRegionsWithNct = 0;

  regions.forEach((region) => {
    const hasNct = !!region.detailedInfo && region.detailedInfo.ncts.length > 0;
    const isDissonantRegion = region.type !== 'consonant_stable';

    if (hasNct) nctRegions++;
    if (isDissonantRegion) dissonantRegions++;
    if (hasNct && !isDissonantRegion) consonantRegionsWithNct++;
  });

  return { nctRegions, dissonantRegions, consonantRegionsWithNct };
}
