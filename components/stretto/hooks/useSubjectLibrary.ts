import { useEffect, useState } from 'react';

export interface SavedSubject {
    id: string;
    name: string;
    data: string;
}

const STORAGE_KEY = 'stretto_subject_library';

export function useSubjectLibrary() {
    const [savedSubjects, setSavedSubjects] = useState<SavedSubject[]>([]);
    const [saveName, setSaveName] = useState('');
    const [showLibrary, setShowLibrary] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        try {
            setSavedSubjects(JSON.parse(saved));
        } catch (error) {
            console.error(error);
        }
    }, []);

    const saveSubject = (abcInput: string) => {
        if (!saveName.trim() || !abcInput.trim()) return;
        const newSubject: SavedSubject = {
            id: Date.now().toString(),
            name: saveName.trim(),
            data: abcInput,
        };
        const updated = [...savedSubjects, newSubject];
        setSavedSubjects(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setSaveName('');
    };

    const deleteSubject = (id: string) => {
        const updated = savedSubjects.filter((subject) => subject.id !== id);
        setSavedSubjects(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    };

    return {
        savedSubjects,
        saveName,
        setSaveName,
        showLibrary,
        setShowLibrary,
        saveSubject,
        deleteSubject,
    };
}
