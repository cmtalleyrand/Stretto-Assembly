import { useState } from 'react';
import { CanonChainResult, CanonSearchOptions, CanonSearchReport, RawNote } from '../../../types';
import { runCanonSearch } from '../../services/canonSearch';

export function useCanonSearchState() {
    const [canonOptions, setCanonOptions] = useState<CanonSearchOptions>({
        ensembleTotal: 4,
        delayMinBeats: 1,
        delayMaxBeats: 4,
        dissonanceThreshold: 0.5,
        chainLengthMin: 4,
        chainLengthMax: 8,
        allowInversions: false,
        allowThirdSixth: false,
        pivotMidi: 60,
        useChromaticInversion: false,
        scaleRoot: 0,
        scaleMode: 'Major',
        subjectVoiceIndex: 0,
        transpositionMode: 'independent',
    });
    const [canonReport, setCanonReport] = useState<CanonSearchReport | null>(null);
    const [isCanonSearching, setIsCanonSearching] = useState(false);
    const [selectedCanonResult, setSelectedCanonResult] = useState<CanonChainResult | null>(null);
    const [canonProgress, setCanonProgress] = useState<{ pct: number; msg: string } | null>(null);

    const handleCanonSearch = async (notes: RawNote[], ppq: number) => {
        const validNotes = notes.filter(Boolean);
        if (validNotes.length === 0) return;
        setIsCanonSearching(true);
        setCanonReport(null);
        setSelectedCanonResult(null);
        setCanonProgress({ pct: 0, msg: 'Starting…' });
        try {
            const report = await runCanonSearch(validNotes, canonOptions, ppq || 480, (pct, msg) => setCanonProgress({ pct, msg }));
            setCanonReport(report);
        } catch (error) {
            console.error('Canon search failed:', error);
        } finally {
            setIsCanonSearching(false);
            setCanonProgress(null);
        }
    };

    return {
        canonOptions,
        setCanonOptions,
        canonReport,
        isCanonSearching,
        selectedCanonResult,
        setSelectedCanonResult,
        canonProgress,
        handleCanonSearch,
    };
}
