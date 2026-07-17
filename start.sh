#!/bin/bash
set -e

echo "=== BioMolExplorer Development Server (Hot Reload) ==="

# Procurar Conda em locais comuns e no PATH
for CONDA_DIR in "$HOME/progs/anaconda3" "$HOME/anaconda3" "$HOME/miniconda3" "/opt/anaconda3" "/usr/local/anaconda3"; do
    if [ -x "$CONDA_DIR/bin/conda" ]; then
        export PATH="$CONDA_DIR/bin:$PATH"
        break
    fi
done

# Adicionar Dock6 e Chimera ao PATH e configurar DOCK6_PATH se disponíveis
for D6_DIR in "$HOME/progs/dock6" "$HOME/dock6" "/opt/dock6" "/usr/local/dock6"; do
    if [ -d "$D6_DIR" ]; then
        export PATH="$D6_DIR/bin:$PATH"
        export DOCK6_PATH="$D6_DIR"
        break
    fi
done

CONDA_BASE=$(conda info --base 2>/dev/null || true)
if [ -z "$CONDA_BASE" ]; then
    echo "Erro: Conda não encontrado no PATH nem nos diretórios padrão."
    exit 1
fi

source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate BioMolExplorer

# Função de limpeza para encerrar TODOS os serviços e processos do BioMolExplorer ao pressionar CTRL+C
cleanup() {
    echo ""
    echo "🛑 Encerrando todos os serviços e processos do BioMolExplorer..."
    
    # Encerra processos filhos iniciados por este script bash
    kill -TERM $(jobs -p) 2>/dev/null || true

    # Encerra processos específicos por PID
    if [ -n "$PYTHON_PID" ]; then
        kill -TERM "$PYTHON_PID" 2>/dev/null || true
        kill -TERM -"$PYTHON_PID" 2>/dev/null || true
    fi
    if [ -n "$API_PID" ]; then
        kill -TERM "$API_PID" 2>/dev/null || true
        kill -TERM -"$API_PID" 2>/dev/null || true
    fi

    # Garante o encerramento de qualquer processo órfão ou subprocesso científico ativo
    pkill -TERM -f "apps/python-service/app.py" 2>/dev/null || true
    pkill -TERM -f "apps/api/src/server.ts" 2>/dev/null || true
    pkill -TERM -f "chimera --nogui" 2>/dev/null || true
    pkill -TERM -f "vina --" 2>/dev/null || true
    pkill -TERM -f "antechamber" 2>/dev/null || true
    pkill -TERM -f "sqm -O" 2>/dev/null || true

    sleep 0.5

    # Força encerramento (SIGKILL) caso algum processo ainda esteja rodando
    rm -f apps/web/.next/dev/lock 2>/dev/null || true
    pkill -9 -f "apps/python-service/app.py" 2>/dev/null || true
    pkill -9 -f "next dev" 2>/dev/null || true
    pkill -9 -f "next-server" 2>/dev/null || true
    pkill -9 -f "chimera --nogui" 2>/dev/null || true
    pkill -9 -f "vina --" 2>/dev/null || true

    echo "✅ Todos os serviços foram encerrados com sucesso!"
    exit 0
}

# Configura o trap para capturar CTRL+C (SIGINT), SIGTERM e encerramento do script
trap cleanup SIGINT SIGTERM EXIT

echo "🧹 Encerrando processos anteriores..."
pkill -9 -f "apps/python-service/app.py" 2>/dev/null || true
pkill -9 -f "apps/api/src/server.ts" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "chimera --nogui" 2>/dev/null || true
pkill -9 -f "vina --" 2>/dev/null || true
sleep 1

echo "🧹 Limpando cache de build do Next.js..."
rm -rf apps/web/.next 2>/dev/null || true

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

# Resolve o interpretador Python do ambiente conda BioMolExplorer (ou fallback para python3/python)
if [ -x "$CONDA_BASE/envs/BioMolExplorer/bin/python" ]; then
    PYTHON_BIN="$CONDA_BASE/envs/BioMolExplorer/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
else
    PYTHON_BIN="python"
fi

# 1. Inicia o Python Flask em background (já tem hot-reload via debug=True)
PORT=$PYTHON_PORT FLASK_PORT=$PYTHON_PORT "$PYTHON_BIN" apps/python-service/app.py &
PYTHON_PID=$!

# Configurar Node.js dinamicamente (NVM ou sistema)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use 22 2>/dev/null || nvm use default 2>/dev/null || true
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Erro: Node.js não encontrado no PATH ou NVM."
    exit 1
fi

# 2. Inicia a API Node.js com NODEMON para hot-reload
PORT=$API_PORT PYTHON_URL="http://127.0.0.1:$PYTHON_PORT" npx nodemon --watch apps/api/src -e ts,js --exec "ts-node" apps/api/src/server.ts &
API_PID=$!

# Aguarda os serviços de backend estarem prontos
echo "Aguardando serviços de backend..."
sleep 5

# 3. Inicia o Next.js em modo DEV (Fast Refresh nativo) na porta selecionada
echo "Iniciando Next.js (Front-end) com Hot Reload na porta $WEB_PORT..."
PORT=$WEB_PORT API_INTERNAL_URL="http://localhost:$API_PORT" npm run dev --workspace=web -- -p "$WEB_PORT"
