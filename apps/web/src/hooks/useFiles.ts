import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';

export function useFiles<T>(endpoint: string) {
    const [datasets, setDatasets] = useState<T>({} as T);

    const fetchFiles = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`);
            if (res.ok) {
                setDatasets(await res.json());
            }
        } catch {
            // Falhas silenciosas ou lógicas customizadas
        }
    }, [endpoint]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    return { datasets, fetchFiles };
}
