import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';

export function useFiles<T>(endpoint: string) {
    const [datasets, setDatasets] = useState<T>({} as T);
    const [loadError, setLoadError] = useState<boolean>(false);

    const fetchFiles = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setDatasets(data);
                setLoadError(false);
            } else {
                // Server responded but with an error — keep current data, set error flag
                setLoadError(true);
            }
        } catch {
            // Network failure — keep current data, set error flag
            setLoadError(true);
        }
    }, [endpoint]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    return { datasets, fetchFiles, loadError };
}
