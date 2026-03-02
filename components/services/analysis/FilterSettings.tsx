
import React from 'react';
import { MidiEventCounts, MidiEventType } from '../../types';
import { FilterIcon } from '../Icons';

const eventTypeMetadata: Record<MidiEventType, { label: string; description: string }> = {
    pitchBend: { label: 'Pitch Bends', description: 'Smooth changes in pitch, often from a pitch wheel.' },
    controlChange: { label: 'Control Changes (CC)', description: 'Parameter changes like modulation, volume, pan, etc.' },
    programChange: { label: 'Program Changes', description: 'Messages that change the instrument/patch.' },
};

interface FilterSettingsProps {
    eventCounts: MidiEventCounts | null;
    eventsToDelete: Set<MidiEventType>;
    onEventFilterToggle: (eventType: MidiEventType) => void;
}

export default function FilterSettings({ eventCounts, eventsToDelete, onEventFilterToggle }: FilterSettingsProps) {
    if (!eventCounts) return null;

    return (
        <div className="border-t border-gray-medium pt-4">
            <div className="flex items-center gap-2 mb-4">
                <FilterIcon className="w-5 h-5 text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-light">Event Filtering</h3>
            </div>
            <div className="space-y-3">
                {(Object.keys(eventTypeMetadata) as MidiEventType[]).map(eventType => (
                    <label key={eventType} className="flex items-center p-3 bg-gray-darker rounded-lg border border-gray-medium hover:border-brand-secondary/50 transition-colors cursor-pointer">
                        <input type="checkbox" checked={eventsToDelete.has(eventType)} onChange={() => onEventFilterToggle(eventType)} className="h-5 w-5 rounded bg-gray-dark border-gray-medium text-brand-primary focus:ring-brand-primary focus:ring-2" />
                        <span className="ml-3 flex-grow text-gray-light">{eventTypeMetadata[eventType].label}</span>
                        <span className="font-mono text-sm text-gray-400">{eventCounts[eventType].toLocaleString()} events</span>
                    </label>
                ))}
            </div>
        </div>
    );
}
