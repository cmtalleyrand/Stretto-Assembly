import { StrettoCandidate } from '../../types';

export function isCandidateAllowedByHardPairwisePolicy(candidate: StrettoCandidate, maxPairwiseDissonance: number): boolean {
    return candidate.dissonanceRatio <= maxPairwiseDissonance;
}

export function pruneCheckedIdsByHardPairwisePolicy(
    checkedIds: Set<string>,
    candidates: StrettoCandidate[],
    maxPairwiseDissonance: number
): Set<string> {
    const candidateById = new Map<string, StrettoCandidate>(candidates.map((c) => [c.id, c]));
    const pruned = new Set<string>();

    for (const id of checkedIds) {
        const candidate = candidateById.get(id);
        if (!candidate) continue;
        if (isCandidateAllowedByHardPairwisePolicy(candidate, maxPairwiseDissonance)) {
            pruned.add(id);
        }
    }

    return pruned;
}
