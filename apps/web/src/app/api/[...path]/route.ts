const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:3001';

async function proxyRequest(request: Request) {
    const url = new URL(request.url);
    const targetUrl = `${API_INTERNAL_URL}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    headers.delete('host');

    const init: RequestInit = {
        method: request.method,
        headers,
        signal: AbortSignal.timeout(300_000), // 5 minutes timeout
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = await request.arrayBuffer();
    }

    try {
        const response = await fetch(targetUrl, init);

        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete('transfer-encoding');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (error: any) {
        console.error(`Proxy error for ${targetUrl}:`, error.message);
        return new Response(JSON.stringify({ error: 'Backend unavailable' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

export async function GET(request: Request) { return proxyRequest(request); }
export async function POST(request: Request) { return proxyRequest(request); }
export async function PUT(request: Request) { return proxyRequest(request); }
export async function DELETE(request: Request) { return proxyRequest(request); }
export async function PATCH(request: Request) { return proxyRequest(request); }
