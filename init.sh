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
    node apps/web/.next/standalone/server.js
elif [ -f "apps/web/.next/standalone/apps/web/server.js" ]; then
    # Estrutura comum em monorepos
    node apps/web/.next/standalone/apps/web/server.js
else
    echo "Standalone não encontrado. Tentando npm start..."
    npm start --workspace=web
fi
