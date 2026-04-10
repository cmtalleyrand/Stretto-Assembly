import React, { useEffect, useState } from 'react';
import { StrettoConstraintMode, StrettoSearchOptions } from '../../types';

interface ConstraintSelectorProps {
    label: string;
    field: keyof StrettoSearchOptions;
    value: StrettoConstraintMode;
    onChange: (field: keyof StrettoSearchOptions, value: StrettoConstraintMode) => void;
}

export default function ConstraintSelector({ label, field, value, onChange }: ConstraintSelectorProps) {
    const isNumber = typeof value === 'number';
    const numValue = isNumber ? value : 1;
    const isCustom = isNumber;
    const [inputValue, setInputValue] = useState<string>(numValue.toString());

    useEffect(() => {
        setInputValue(numValue.toString());
    }, [numValue]);

    return (
        <div className="bg-gray-900 p-2 rounded border border-gray-700">
            <label className="block text-[10px] font-bold text-gray-400 mb-2 uppercase">{label}</label>
            <div className="flex gap-1 items-center">
                <button
                    onClick={() => onChange(field, 'None')}
                    className={`flex-1 py-1 text-[10px] rounded border transition-colors ${value === 'None' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-500'}`}
                >
                    None
                </button>

                <div
                    className={`flex items-center border rounded transition-colors cursor-pointer ${isCustom ? 'bg-brand-primary border-brand-primary' : 'bg-gray-800 border-gray-600 hover:border-gray-500'}`}
                    onClick={() => {
                        if (!isCustom) onChange(field, numValue);
                    }}
                >
                    <span className={`pl-2 pr-1 py-1 text-[10px] ${isCustom ? 'text-white' : 'text-gray-500'}`}>Max</span>
                    <input
                        type="number"
                        min="1"
                        max="10"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            const nextVal = parseInt(e.target.value, 10);
                            if (!Number.isNaN(nextVal) && nextVal > 0) {
                                onChange(field, nextVal);
                            }
                        }}
                        onBlur={() => {
                            const parsed = parseInt(inputValue, 10);
                            if (inputValue === '' || Number.isNaN(parsed) || parsed < 1) {
                                setInputValue('1');
                                onChange(field, 1);
                            }
                        }}
                        className={`w-8 bg-transparent text-[10px] text-center outline-none ${isCustom ? 'text-white' : 'text-gray-500'}`}
                    />
                </div>

                <button
                    onClick={() => onChange(field, 'Unlimited')}
                    className={`flex-1 py-1 text-[10px] rounded border transition-colors ${value === 'Unlimited' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-500'}`}
                >
                    Unlimited
                </button>
            </div>
        </div>
    );
}
