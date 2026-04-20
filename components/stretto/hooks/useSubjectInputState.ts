import { useEffect, useMemo, useState } from 'react';
import { RawNote } from '../../../types';
import { extractKeyFromAbc, extractMeterFromAbc, parseSimpleAbc } from '../../services/abcBridge';
import { deriveInitialPivotSettings } from '../../services/stretto/pivotInitialization';

export function useSubjectInputState(params: {
    initialNotes: RawNote[];
    ppq: number;
    ts: { num: number; den: number };
    onDerivedPivotSettings?: (settings: { pivotMidi: number; scaleRoot: number; scaleMode: string }) => void;
}) {
    const { initialNotes, ppq, ts, onDerivedPivotSettings } = params;
    const [mode, setMode] = useState<'midi' | 'abc'>('abc');
    const [abcInput, setAbcInput] = useState("M:4/4\nL:1/4\nQ:120\nK:C\nc2 G c d e f g3 a b c'2");

    const subjectTitle = useMemo(() => {
        if (mode === 'abc') {
            const match = abcInput.match(/^T:\s*(.+)$/m);
            return match ? match[1].trim() : 'ABC_Subject';
        }
        return 'MIDI_Subject';
    }, [mode, abcInput]);

    const subjectNotes = useMemo(() => {
        if (mode === 'abc') return parseSimpleAbc(abcInput, ppq || 480);
        return initialNotes;
    }, [mode, abcInput, initialNotes, ppq]);

    const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const abcKeyLabel = useMemo(() => {
        if (mode !== 'abc') return null;
        const parsed = extractKeyFromAbc(abcInput);
        if (!parsed) return 'C Major (default – no K: field)';
        return `${NOTE_NAMES[parsed.root]} ${parsed.mode}`;
    }, [mode, abcInput]);

    const parsedAbcMeter = useMemo(() => {
        if (mode !== 'abc') return null;
        return extractMeterFromAbc(abcInput);
    }, [mode, abcInput]);

    const activeMeter = useMemo(() => {
        if (mode === 'abc' && parsedAbcMeter) return parsedAbcMeter;
        return ts;
    }, [mode, parsedAbcMeter, ts]);

    const subjectPianoRollData = useMemo(() => ({
        notes: subjectNotes.map((n) => ({ ...n, voiceIndex: 0 })),
        name: 'Subject',
        ppq: ppq || 480,
        timeSignature: { numerator: activeMeter.num, denominator: activeMeter.den },
    }), [subjectNotes, ppq, activeMeter]);

    useEffect(() => {
        if (!onDerivedPivotSettings) return;
        const derived = deriveInitialPivotSettings(subjectNotes, mode, abcInput);
        if (!derived) return;
        onDerivedPivotSettings(derived);
    }, [subjectNotes, mode, abcInput, onDerivedPivotSettings]);

    return {
        mode,
        setMode,
        abcInput,
        setAbcInput,
        subjectTitle,
        subjectNotes,
        abcKeyLabel,
        parsedAbcMeter,
        activeMeter,
        subjectPianoRollData,
    };
}
