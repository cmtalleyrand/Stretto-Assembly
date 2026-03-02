
import React from 'react';
import { MidiEventCounts, MidiEventType, TempoChangeMode, OutputStrategy, RhythmRule, VoiceAssignmentMode } from '../types';
import TempoTimeSettings from './settings/TempoTimeSettings';
import TransformSettings from './settings/TransformSettings';
import VoiceSettings from './settings/VoiceSettings';
import QuantizationSettings from './settings/QuantizationSettings';
import KeyModeSettings from './settings/KeyModeSettings';

interface ConversionSettingsProps {
    settings: {
        originalTempo: number | null;
        newTempo: string;
        originalTimeSignature: { numerator: number, denominator: number } | null;
        newTimeSignature: { numerator: string, denominator: string };
        tempoChangeMode: TempoChangeMode;
        originalDuration: number | null;
        newDuration: number | null;
        
        modalRoot: number;
        modalModeName: string;
        isModalConversionEnabled: boolean;
        modalMappings: Record<number, number>;

        primaryRhythm: RhythmRule;
        secondaryRhythm: RhythmRule;
        quantizationValue: string; // legacy

        quantizeDurationMin: string;
        shiftToMeasure: boolean;
        detectOrnaments: boolean;
        softOverlapToleranceIndex: number;
        pitchBias: number;
        maxVoices: number;
        disableChords: boolean;
        voiceAssignmentMode: VoiceAssignmentMode;
        outputStrategy: OutputStrategy;
    };
    setters: {
        setNewTempo: (val: string) => void;
        setNewTimeSignature: (val: { numerator: string, denominator: string }) => void;
        setTempoChangeMode: (val: TempoChangeMode) => void;
        
        setModalRoot: (val: number) => void;
        setModalModeName: (val: string) => void;
        setIsModalConversionEnabled: (val: boolean) => void;
        setModalMappings: (val: Record<number, number>) => void;

        setPrimaryRhythm: (val: RhythmRule) => void;
        setSecondaryRhythm: (val: RhythmRule) => void;
        
        setQuantizeDurationMin: (val: string) => void;
        setShiftToMeasure: (val: boolean) => void;
        setDetectOrnaments: (val: boolean) => void;
        setSoftOverlapToleranceIndex: (val: number) => void;
        setPitchBias: (val: number) => void;
        setMaxVoices: (val: number) => void;
        setDisableChords: (val: boolean) => void;
        setVoiceAssignmentMode: (val: VoiceAssignmentMode) => void;
        setOutputStrategy: (val: OutputStrategy) => void;
    };
    eventCounts: MidiEventCounts | null;
    onEventFilterToggle: (eventType: MidiEventType) => void;
    quantizationWarning?: { message: string, details: string[] } | null;
}

export default function ConversionSettings({ settings, setters, quantizationWarning }: ConversionSettingsProps) {
  return (
    <div className="w-full bg-gray-dark p-6 rounded-2xl shadow-2xl border border-gray-medium mt-6 animate-slide-up">
        <div className="border-b border-gray-medium pb-4 mb-4">
            <h2 className="text-xl font-bold text-gray-light">Configuration</h2>
        </div>

        <div className="space-y-6">
            <TempoTimeSettings 
                originalTempo={settings.originalTempo}
                newTempo={settings.newTempo}
                setNewTempo={setters.setNewTempo}
                originalTimeSignature={settings.originalTimeSignature}
                newTimeSignature={settings.newTimeSignature}
                setNewTimeSignature={setters.setNewTimeSignature}
                tempoChangeMode={settings.tempoChangeMode}
                setTempoChangeMode={setters.setTempoChangeMode}
                originalDuration={settings.originalDuration}
                newDuration={settings.newDuration}
            />

            <KeyModeSettings 
                modalRoot={settings.modalRoot}
                setModalRoot={setters.setModalRoot}
                modalModeName={settings.modalModeName}
                setModalModeName={setters.setModalModeName}
                isModalConversionEnabled={settings.isModalConversionEnabled}
                setIsModalConversionEnabled={setters.setIsModalConversionEnabled}
                modalMappings={settings.modalMappings}
                setModalMappings={setters.setModalMappings}
            />

            <TransformSettings 
                detectOrnaments={settings.detectOrnaments}
                setDetectOrnaments={setters.setDetectOrnaments}
            />

            <VoiceSettings 
                softOverlapToleranceIndex={settings.softOverlapToleranceIndex}
                setSoftOverlapToleranceIndex={setters.setSoftOverlapToleranceIndex}
                pitchBias={settings.pitchBias}
                setPitchBias={setters.setPitchBias}
                maxVoices={settings.maxVoices}
                setMaxVoices={setters.setMaxVoices}
                disableChords={settings.disableChords}
                setDisableChords={setters.setDisableChords}
                voiceAssignmentMode={settings.voiceAssignmentMode}
                setVoiceAssignmentMode={setters.setVoiceAssignmentMode}
            />

            <QuantizationSettings 
                primaryRhythm={settings.primaryRhythm}
                setPrimaryRhythm={setters.setPrimaryRhythm}
                secondaryRhythm={settings.secondaryRhythm}
                setSecondaryRhythm={setters.setSecondaryRhythm}
                
                quantizeDurationMin={settings.quantizeDurationMin}
                setQuantizeDurationMin={setters.setQuantizeDurationMin}
                shiftToMeasure={settings.shiftToMeasure}
                setShiftToMeasure={setters.setShiftToMeasure}
                quantizationWarning={quantizationWarning}
            />
        </div>
    </div>
  );
}
