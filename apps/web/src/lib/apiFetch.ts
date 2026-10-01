/**
 * apiFetch — thin wrapper around fetch that automatically injects
 * Authorization and X-Workspace headers from localStorage.
 *
 * Use this for all API calls that go through the Node.js Maestro (port 3001),
 * which will then forward the headers to the Flask Python service.
 */
export function buildAuthHeaders(): Record<string, string> {
    if (typeof window === 'undefined') return {};

    const token = localStorage.getItem('biomol_token');
    const wsRaw = localStorage.getItem('biomol_workspace');
    const headers: Record<string, string> = {};

    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (wsRaw) {
        try {
            const ws = JSON.parse(wsRaw);
            if (ws?.name) headers['X-Workspace'] = ws.name;
        } catch { /* ignore malformed JSON */ }
    }
    return headers;
}

/**
 * Drop-in replacement for `fetch` that adds auth headers automatically.
 * Merges any headers the caller provides with the auth headers.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(buildAuthHeaders());
    const bodyIsFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

    // Explicit caller headers may intentionally select a workspace different
    // from the currently active one (for example, an import action on a card).
    new Headers(options.headers).forEach((value, name) => headers.set(name, value));

    if (options.body && !bodyIsFormData && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, {
        ...options,
        headers,
    });
    return res;
}

function filenameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8?.[1]) return decodeURIComponent(utf8[1].trim());
    const plain = disposition.match(/filename="?([^";]+)"?/i);
    return plain?.[1]?.trim() ?? null;
}

/** Download a protected file while preserving the active user and workspace. */
export async function downloadWithAuth(url: string, fallbackFilename: string): Promise<void> {
    const response = await apiFetch(url);
    if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}.`);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filenameFromDisposition(response.headers.get('content-disposition')) || fallbackFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
}
