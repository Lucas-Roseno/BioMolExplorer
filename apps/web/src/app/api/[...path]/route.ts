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
        console.error(`Proxy error for ${targetUrl}:`, error.message);
        
        // Tratar Timeout específico
        if (error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('aborted')) {
            return new Response(JSON.stringify({ 
                success: false, 
                message: 'A operação excedeu o tempo limite de 30 minutos na tela. O processamento da base ChEMBL pode ser muito pesado e continuará rodando em segundo plano no terminal.' 
            }), {
                status: 504,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ success: false, message: 'Backend unavailable' }), {
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
