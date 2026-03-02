
export const MUSICAL_TIME_OPTIONS = [
    { label: 'Off', value: 0 },
    { label: '1/128', value: 0.03125 },
    { label: '1/64t', value: 0.0416 },
    { label: '1/64', value: 0.0625 },
    { label: '1/32t', value: 0.0833 },
    { label: '1/32', value: 0.125 },
    { label: '1/16t', value: 0.1666 },
    { label: '1/16', value: 0.25 },
    { label: '1/8t', value: 0.3333 },
    { label: '1/8', value: 0.5 },
    { label: '1/4', value: 1.0 },
    { label: '1/2', value: 2.0 },
    { label: 'Whole', value: 4.0 },
    { label: '2 Measures', value: 8.0 },
    { label: '4 Measures', value: 16.0 },
];

export const RHYTHM_FAMILIES = {
    'Simple': [
        { label: '1/4', value: '1/4' },
        { label: '1/8', value: '1/8' },
        { label: '1/16', value: '1/16' },
        { label: '1/32', value: '1/32' },
        { label: '1/64', value: '1/64' },
    ],
    'Triple': [
        { label: '1/4 Triplet', value: '1/4t' },
        { label: '1/8 Triplet', value: '1/8t' },
        { label: '1/16 Triplet', value: '1/16t' },
        { label: '1/32 Triplet', value: '1/32t' },
    ],
    'Quintuplet': [
        { label: '1/4 Quint', value: '1/4q' },
        { label: '1/8 Quint', value: '1/8q' },
        { label: '1/16 Quint', value: '1/16q' },
        { label: '1/32 Quint', value: '1/32q' },
    ]
};
