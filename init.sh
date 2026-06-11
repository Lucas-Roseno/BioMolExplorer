#!/bin/bash
set -e

echo "=== BioMolExplorer Production Server ==="

# Ativar Conda Environment (Otimizado para Docker)
CONDA_BASE=$(conda info --base 2>/dev/null || echo "/opt/conda")
if [ -f "$CONDA_BASE/etc/profile.d/conda.sh" ]; then
    source "$CONDA_BASE/etc/profile.d/conda.sh"
    conda activate BioMolExplorer || echo "Aviso: Não foi possível ativar o ambiente BioMolExplorer. Usando ambiente padrão."
else
    echo "Aviso: Script do Conda não encontrado em $CONDA_BASE. Continuando com ambiente global..."
fi

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

echo "Iniciando os 3 serviços (Produção)..."

# 1. Inicia a API Node.js em background (porta 3001 interna)
# Usando node diretamente em vez de ts-node para performance se estiver compilado, 
# mas se não estiver, npx ts-node com flags de limite de memória resolve (para o Render Free Tier).
export TS_NODE_TRANSPILE_ONLY=1
export NODE_OPTIONS="--max-old-space-size=96"
npx ts-node apps/api/src/server.ts &

# 2. Inicia o Python Flask em background (porta 5000 interna)
python apps/python-service/app.py &

# Aguarda o Node.js API estar pronto (porta 3001)
echo "Aguardando API Node.js na porta 3001..."
timeout 60 bash -c 'until curl -s http://localhost:3001/ > /dev/null; do sleep 1; done' || echo "Aviso: Timeout aguardando API Node.js"

# Aguarda o Flask estar pronto (porta 5000)
echo "Aguardando Flask na porta 5000..."
timeout 60 bash -c 'until curl -s http://localhost:5000/pdb_files > /dev/null; do sleep 1; done' || echo "Aviso: Timeout aguardando Flask"

echo "Serviços de background prontos! Iniciando Servidor Web..."

# 3. Inicia o Next.js via Standalone Server (Porta 3000)
# Isso é MUITO mais rápido e eficiente que o 'npm start'
export HOSTNAME="0.0.0.0"
export PORT=${PORT:-3000}

# Verifica se o standalone existe, caso contrário usa o modo padrão
if [ -f "apps/web/.next/standalone/server.js" ]; then
    echo "Executando via Next.js Standalone..."
    cp -r apps/web/public apps/web/.next/standalone/public 2>/dev/null || true
    cp -r apps/web/.next/static apps/web/.next/standalone/.next/static 2>/dev/null || true
    node apps/web/.next/standalone/server.js
elif [ -f "apps/web/.next/standalone/apps/web/server.js" ]; then
    # Estrutura comum em monorepos
    cp -r apps/web/public apps/web/.next/standalone/apps/web/public 2>/dev/null || true
    cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static 2>/dev/null || true
    node apps/web/.next/standalone/apps/web/server.js
else
    echo "Standalone não encontrado. Tentando npm start..."
    npm start --workspace=web
fi
