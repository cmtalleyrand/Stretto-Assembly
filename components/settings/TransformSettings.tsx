
import React from 'react';

interface TransformSettingsProps {
    detectOrnaments: boolean;
    setDetectOrnaments: (val: boolean) => void;
}

export default function TransformSettings({
    detectOrnaments, setDetectOrnaments,
}: TransformSettingsProps) {

    return (
        <div className="border-t border-gray-medium pt-4">
            <h3 className="text-lg font-semibold text-gray-light mb-4">Preprocessing</h3>
            <div className="grid grid-cols-1 gap-4">
                <div>
                    <label className="flex items-center p-3 bg-gray-darker rounded-lg border border-gray-medium hover:border-brand-secondary/50 transition-colors cursor-pointer w-full">
                        <input
                            type="checkbox"
                            checked={detectOrnaments}
                            onChange={(e) => setDetectOrnaments(e.target.checked)}
                            className="h-5 w-5 rounded bg-gray-dark border-gray-medium text-brand-primary focus:ring-brand-primary focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-darker"
                        />
                        <div className="ml-3">
                            <span className="font-semibold text-gray-light">Identify Ornaments</span>
                            <p className="text-xs text-gray-400">Detects Trills, Turns, and Grace Notes and tags them for analysis.</p>
                        </div>
                    </label>
                </div>
            </div>
        </div>
    );
}
