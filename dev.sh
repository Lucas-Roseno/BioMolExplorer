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

# Limpar processos antigos nas portas 3000, 3001 e 5000
echo "Limpando processos nas portas 3000, 3001 e 5000..."
fuser -k -9 3000/tcp 3001/tcp 5000/tcp 2>/dev/null || true
if command -v lsof >/dev/null 2>&1; then
    kill -9 $(lsof -t -i:3000 -i:3001 -i:5000) 2>/dev/null || true
fi

# Verificar se há containers Docker ativos ocupando essas portas
if command -v docker >/dev/null 2>&1; then
    CONFLICTING_DOCKER=$(docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep -E '(:3000->|:3001->|:5000->)' || true)
    if [ -n "$CONFLICTING_DOCKER" ]; then
        echo "⚠️  Detectado container Docker rodando nas portas do projeto (3000/3001/5000):"
        echo "$CONFLICTING_DOCKER" | awk '{print "   - ID: " $1 ", Nome: " $2}'
        echo -n "Deseja parar estes containers conflitantes automaticamente? (s/N): "
        read -r -t 10 response || response="n"
        if [[ "$response" =~ ^[Ss]$ ]]; then
            CONTAINER_IDS=$(echo "$CONFLICTING_DOCKER" | cut -d' ' -f1)
            echo "Parando container(s)..."
            docker stop $CONTAINER_IDS
            sleep 2
        else
            echo "Aviso: O conflito de portas pode causar erros de inicialização se os containers não forem parados."
        fi
    fi
fi

# 1. Inicia o Python Flask em background com hot-reload ativado
FLASK_DEBUG=1 python apps/python-service/app.py &

# 2. Inicia a API Node.js com NODEMON para hot-reload
npx nodemon --watch apps/api/src -e ts,js --exec "ts-node" apps/api/src/server.ts &

# Aguarda os serviços de backend estarem prontos
echo "Aguardando serviços de backend..."
sleep 5

# 3. Inicia o Next.js em modo DEV (Fast Refresh nativo) na porta 3000
echo "Iniciando Next.js (Front-end) com Hot Reload..."
npm run dev --workspace=web
