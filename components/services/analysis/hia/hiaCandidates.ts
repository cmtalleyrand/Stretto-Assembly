import { ChordCandidate } from './hiaDefs';
import { getStrictPitchName } from '../../midiSpelling';

const QUALITIES: { [key: string]: number[] } = {
    'Maj': [0, 4, 7], 'Min': [0, 3, 7], 'Dim': [0, 3, 6], 'Aug': [0, 4, 8],
    '7': [0, 4, 7, 10], 'Maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10],
    'm7b5': [0, 3, 6, 10], 'dim7': [0, 3, 6, 9],'mMaj7': [0, 3, 7, 11], 'Aug7': [0, 4, 8, 10],
    'm6': [0, 3, 7, 9], 'Maj6': [0, 4, 7, 9], 
};

export function generateCandidates(roots: Set<number>): ChordCandidate[] {
    const candidates: ChordCandidate[] = [];
    roots.forEach(root => {
        Object.entries(QUALITIES).forEach(([qName, intervals]) => {
            candidates.push({
                root, quality: qName, intervals, bass: root, baselineQ: 1.0,
                name: `${getStrictPitchName(root).replace(/\d/g, '')}-${qName}`
            });
        });
    });
    return candidates;
}