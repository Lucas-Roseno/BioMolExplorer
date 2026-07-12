const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:3001';

async function proxyRequest(request: Request) {
    const url = new URL(request.url);
    const targetUrl = `${API_INTERNAL_URL}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    headers.delete('host');

    const init: RequestInit = {
        method: request.method,
        headers,
        signal: AbortSignal.timeout(1_800_000), // 30 minutes timeout
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
        console.error(`[BioMolExplorer] Proxy error for ${targetUrl}:`, error.message);

        // Timeout — the operation may still be running in the background
        if (error.name === 'TimeoutError' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
            return new Response(JSON.stringify({
                success: false,
                message: 'The operation is taking longer than expected. It may still be running in the background — please wait a moment and check back.'
            }), {
                status: 504,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Cannot reach the Python backend at all
        return new Response(JSON.stringify({
            success: false,
            message: 'The server is currently unavailable. Please make sure the application is running and try again.'
        }), {
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
