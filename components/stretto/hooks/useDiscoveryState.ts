import { useEffect, useMemo, useState } from 'react';
import { RawNote, StrettoCandidate, StrettoGrade, StrettoListFilterContext, StrettoSearchOptions } from '../../../types';
import { analyzeStrettoCandidate, analyzeStrettoTripletCandidate } from '../../services/strettoCore';
import { computeSecondDelayEnd, computeSecondDelayStart, enumerateTripletInversionPairs, TripletDelayOrderingMode } from '../../services/tripletDiscoveryOptions';
import { computeDiscoveryDelayBounds, computeMaxDelayAutoBeats } from '../../services/stretto/delayUtils';
import { isCandidateAllowedByHardPairwisePolicy, pruneCheckedIdsByHardPairwisePolicy } from '../selectionPolicy';

export function useDiscoveryState(params: {
    subjectNotes: RawNote[];
    ppq: number;
    meter: { num: number; den: number };
    searchRes: 'half' | 'full' | 'double';
    configIntervals: number[];
    includeExtensions: boolean;
    includeInversions: boolean;
    searchOptions: StrettoSearchOptions;
}) {
    const [discoveryArity, setDiscoveryArity] = useState<'pairwise' | 'triplet'>('pairwise');
    const [tripletDelayOrderingMode, setTripletDelayOrderingMode] = useState<TripletDelayOrderingMode>('unconstrained');
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [pairwiseResults, setPairwiseResults] = useState<StrettoCandidate[]>([]);
    const [minDelayBeats, setMinDelayBeats] = useState<number>(0.5);
    const [maxDelayBeats, setMaxDelayBeats] = useState<string>('');
    const [gradeFilter, setGradeFilter] = useState<Record<StrettoGrade, boolean>>({ STRONG: true, VIABLE: true, INVALID: false });
    const [selectedCandidate, setSelectedCandidate] = useState<StrettoCandidate | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [discoveryFilterContext, setDiscoveryFilterContext] = useState<StrettoListFilterContext | null>(null);

    const maxDelayAutoBeats = useMemo(
        () => computeMaxDelayAutoBeats(params.subjectNotes, params.ppq || 480, params.meter.den),
        [params.subjectNotes, params.ppq, params.meter.den]
    );

    const processedDiscoveryResults = useMemo(
        () => filterDiscoveryResults(pairwiseResults, gradeFilter, params.searchOptions.maxPairwiseDissonance),
        [pairwiseResults, gradeFilter, params.searchOptions.maxPairwiseDissonance]
    );

    useEffect(() => {
        setCheckedIds((prev) => pruneCheckedIdsByHardPairwisePolicy(prev, pairwiseResults, params.searchOptions.maxPairwiseDissonance));
        setSelectedCandidate((prev) => {
            if (!prev) return null;
            return isCandidateAllowedByHardPairwisePolicy(prev, params.searchOptions.maxPairwiseDissonance) ? prev : null;
        });
    }, [pairwiseResults, params.searchOptions.maxPairwiseDissonance]);

    const runDiscovery = () => {
        const validNotes = params.subjectNotes.filter(Boolean);
        if (validNotes.length === 0) return;

        setIsDiscovering(true);
        setTimeout(() => {
            const candidates: StrettoCandidate[] = [];
            const currentPpq = params.ppq || 480;
            let stepTicks = currentPpq;
            if (params.searchRes === 'half') stepTicks = currentPpq / 2;
            else if (params.searchRes === 'double') stepTicks = currentPpq * 2;

            const bounds = computeDiscoveryDelayBounds({
                notes: validNotes,
                ppq: currentPpq,
                meterDenominator: params.meter.den,
                minDelayBeats,
                maxDelayBeatsInput: maxDelayBeats,
                stepTicks,
            });

            const intervalsToCheck = [...params.configIntervals];
            if (params.includeExtensions) {
                const exts = [3, 4, 8, 9, -3, -4, -8, -9];
                exts.forEach((interval) => {
                    if (!intervalsToCheck.includes(interval)) intervalsToCheck.push(interval);
                });
            }

            if (discoveryArity === 'pairwise') {
                intervalsToCheck.forEach((interval) => {
                    for (let delay = bounds.effectiveMinDelayTicks; delay <= bounds.effectiveMaxDelayTicks; delay += stepTicks) {
                        candidates.push(analyzeStrettoCandidate(validNotes, interval, Math.round(delay), currentPpq, params.meter, false, params.searchOptions.pivotMidi, params.searchOptions.useChromaticInversion, params.searchOptions.scaleRoot, params.searchOptions.maxPairwiseDissonance, params.searchOptions.scaleMode));
                        if (params.includeInversions) {
                            candidates.push(analyzeStrettoCandidate(validNotes, interval, Math.round(delay), currentPpq, params.meter, true, params.searchOptions.pivotMidi, params.searchOptions.useChromaticInversion, params.searchOptions.scaleRoot, params.searchOptions.maxPairwiseDissonance, params.searchOptions.scaleMode));
                        }
                    }
                });
            } else {
                const inversionPairs = enumerateTripletInversionPairs(params.includeInversions);
                for (let d1 = bounds.effectiveMinDelayTicks; d1 <= bounds.effectiveMaxDelayTicks; d1 += stepTicks) {
                    const start = computeSecondDelayStart(d1, stepTicks);
                    const end = computeSecondDelayEnd(d1, bounds.effectiveMaxDelayTicks, stepTicks, tripletDelayOrderingMode);
                    for (let d2 = start; d2 <= end; d2 += stepTicks) {
                        for (const i1 of intervalsToCheck) {
                            for (const i2 of intervalsToCheck) {
                                for (const pair of inversionPairs) {
                                    candidates.push(analyzeStrettoTripletCandidate(validNotes, i1, i2, Math.round(d1), Math.round(d2), currentPpq, params.meter, pair.firstIsInverted, pair.secondIsInverted, params.searchOptions.pivotMidi, params.searchOptions.useChromaticInversion, params.searchOptions.scaleRoot, params.searchOptions.maxPairwiseDissonance, params.searchOptions.scaleMode));
                                }
                            }
                        }
                    }
                }
            }

            setPairwiseResults(candidates);
            setIsDiscovering(false);
        }, 10);
    };

    const toggleCheck = (id: string) => {
        setCheckedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            const candidate = pairwiseResults.find((result) => result.id === id);
            if (candidate) setSelectedCandidate(candidate);
            return next;
        });
    };

    const resetForSubjectChange = () => {
        setSelectedCandidate(null);
        setCheckedIds(new Set());
        setDiscoveryFilterContext(null);
        setPairwiseResults([]);
    };

    return {
        discoveryArity,
        setDiscoveryArity,
        tripletDelayOrderingMode,
        setTripletDelayOrderingMode,
        isDiscovering,
        pairwiseResults,
        setPairwiseResults,
        minDelayBeats,
        setMinDelayBeats,
        maxDelayBeats,
        setMaxDelayBeats,
        gradeFilter,
        setGradeFilter,
        selectedCandidate,
        setSelectedCandidate,
        checkedIds,
        setCheckedIds,
        discoveryFilterContext,
        setDiscoveryFilterContext,
        maxDelayAutoBeats,
        processedDiscoveryResults,
        runDiscovery,
        toggleCheck,
        resetForSubjectChange,
    };
}

export function filterDiscoveryResults(
    pairwiseResults: StrettoCandidate[],
    gradeFilter: Record<StrettoGrade, boolean>,
    maxPairwiseDissonance: number
): StrettoCandidate[] {
    return pairwiseResults.filter((result) => gradeFilter[result.grade] && result.dissonanceRatio <= maxPairwiseDissonance);
}
