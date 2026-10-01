import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';

/** Build auth headers from localStorage (client-side only). */
function buildAuthHeaders(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem('biomol_token');
    const wsRaw = localStorage.getItem('biomol_workspace');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (wsRaw) {
        try {
            const ws = JSON.parse(wsRaw);
            if (ws?.name) headers['X-Workspace'] = ws.name;
        } catch { /* ignore */ }
    }
    return headers;
}

export function useFiles<T>(endpoint: string) {
    const [datasets, setDatasets] = useState<T>({} as T);
    const [loadError, setLoadError] = useState<boolean>(false);

    const fetchFiles = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                cache: 'no-store',
                headers: buildAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                setDatasets(data);
                setLoadError(false);
            } else {
                setLoadError(true);
            }
        } catch {
            setLoadError(true);
        }
    }, [endpoint]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    return { datasets, fetchFiles, loadError };
}
