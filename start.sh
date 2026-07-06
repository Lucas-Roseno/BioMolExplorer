#!/bin/bash
set -e

echo "=== BioMolExplorer Development Server (Hot Reload) ==="

# Ativar Conda Environment
CONDA_BASE=$(conda info --base 2>/dev/null)
if [ -z "$CONDA_BASE" ]; then
    echo "Erro: Conda não encontrado no PATH."
    exit 1
fi

source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate BioMolExplorer

echo "Iniciando os 3 serviços em modo DEV..."

# Função para verificar se a porta está disponível no host (checa IPv4 e IPv6 via kernel ou lsof/netstat)
is_port_available() {
    local port=$1
    if command -v ss >/dev/null 2>&1; then
        ! ss -tuln | awk '{print $5}' | grep -E ":$port$" >/dev/null 2>&1
    elif command -v lsof >/dev/null 2>&1; then
        ! lsof -i :"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1
    elif command -v netstat >/dev/null 2>&1; then
        ! netstat -tuln 2>/dev/null | awk '{print $4}' | grep -E ":$port$" >/dev/null 2>&1
    else
        python3 -c "import socket, sys; [socket.socket(af, socket.SOCK_STREAM).bind((addr, int(sys.argv[1]))) for af, addr in [(socket.AF_INET, '0.0.0.0'), (socket.AF_INET6, '::')]]" "$port" 2>/dev/null
    fi
}

echo "Procurando portas disponíveis para os serviços..."

WEB_PORT=3000
while ! is_port_available "$WEB_PORT"; do
    WEB_PORT=$((WEB_PORT + 1))
done

API_PORT=3001
while [ "$API_PORT" -eq "$WEB_PORT" ] || ! is_port_available "$API_PORT"; do
    API_PORT=$((API_PORT + 1))
done

PYTHON_PORT=5000
while [ "$PYTHON_PORT" -eq "$WEB_PORT" ] || [ "$PYTHON_PORT" -eq "$API_PORT" ] || ! is_port_available "$PYTHON_PORT"; do
    PYTHON_PORT=$((PYTHON_PORT + 1))
done

echo "✅ Portas dinâmicas selecionadas:"
echo "   - Next.js (Web):  http://localhost:$WEB_PORT"
echo "   - API (Maestro):  http://localhost:$API_PORT"
echo "   - Python (Flask): http://127.0.0.1:$PYTHON_PORT"
echo ""

# 1. Inicia o Python Flask em background (já tem hot-reload via debug=True)
PORT=$PYTHON_PORT FLASK_PORT=$PYTHON_PORT python apps/python-service/app.py &

# 2. Inicia a API Node.js com NODEMON para hot-reload
PORT=$API_PORT PYTHON_URL="http://127.0.0.1:$PYTHON_PORT" npx nodemon --watch apps/api/src -e ts,js --exec "ts-node" apps/api/src/server.ts &

# Aguarda os serviços de backend estarem prontos
echo "Aguardando serviços de backend..."
sleep 5

# 3. Inicia o Next.js em modo DEV (Fast Refresh nativo) na porta selecionada
echo "Iniciando Next.js (Front-end) com Hot Reload na porta $WEB_PORT..."
PORT=$WEB_PORT API_INTERNAL_URL="http://localhost:$API_PORT" npm run dev --workspace=web -- -p "$WEB_PORT"
