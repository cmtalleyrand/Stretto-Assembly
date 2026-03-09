
import React, { useState } from 'react';
import { MidiEventCounts, MidiEventType, TempoChangeMode, OutputStrategy, RhythmRule, VoiceAssignmentMode, ProcessingProfile } from '../types';
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
        processingProfile: ProcessingProfile;
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
        setProcessingProfile: (val: ProcessingProfile) => void;
    };
    eventCounts: MidiEventCounts | null;
    onEventFilterToggle: (eventType: MidiEventType) => void;
    quantizationWarning?: { message: string, details: string[] } | null;
}

export default function ConversionSettings({ settings, setters, quantizationWarning }: ConversionSettingsProps) {
  const [isLegacyPanelOpen, setIsLegacyPanelOpen] = useState(false);

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

            <div className="border-t border-gray-medium pt-4">
                <h3 className="text-lg font-semibold text-gray-light mb-4">Processing Profile</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${settings.processingProfile === 'stretto_quantized' ? 'bg-brand-primary/20 border-brand-primary ring-1 ring-brand-primary' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                        <input type="radio" name="processingProfile" value="stretto_quantized" checked={settings.processingProfile === 'stretto_quantized'} onChange={() => setters.setProcessingProfile('stretto_quantized')} className="sr-only" />
                        <span className="font-bold text-sm text-gray-200">Stretto Quantized (Default)</span>
                        <span className="text-[10px] text-gray-400 mt-2 leading-tight">Deterministic quantized-input pipeline for generation and analysis.</span>
                    </label>
                    <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${settings.processingProfile === 'legacy_transform' ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                        <input type="radio" name="processingProfile" value="legacy_transform" checked={settings.processingProfile === 'legacy_transform'} onChange={() => setters.setProcessingProfile('legacy_transform')} className="sr-only" />
                        <span className="font-bold text-sm text-gray-200">Legacy Transform (Compatibility)</span>
                        <span className="text-[10px] text-gray-400 mt-2 leading-tight">Backward-compatible profile retained for historical workflows.</span>
                    </label>
                </div>
            </div>

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
                showLegacyControls={false}
            />

            <details className="border-t border-gray-medium pt-4" open={isLegacyPanelOpen} onToggle={(e) => setIsLegacyPanelOpen((e.target as HTMLDetailsElement).open)}>
                <summary className="cursor-pointer text-lg font-semibold text-amber-400">Legacy Transform (Compatibility)</summary>
                <p className="text-xs text-gray-500 mt-2">These controls are compatibility-only and remain non-default under the Stretto Quantized profile.</p>
                <div className="space-y-6 mt-4">
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
                        showLegacyControls={true}
                    />
                </div>
            </details>
        </div>
    </div>
  );
}
