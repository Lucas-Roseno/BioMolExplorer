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

echo "Limpando instâncias antigas dos serviços..."
# Libera as portas 3001 e 5000 se houver algo rodando de uma execução anterior
lsof -t -i:3001 | xargs -r kill -9 2>/dev/null || true
lsof -t -i:5000 | xargs -r kill -9 2>/dev/null || true

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

# 3. Inicia o Next.js via Standalone Server
# Isso é MUITO mais rápido e eficiente que o 'npm start'
export HOSTNAME="0.0.0.0"

# Procura a primeira porta livre começando pela configurada (padrão 3000)
START_PORT=${PORT:-3000}
while ss -lntu | grep -qw ":$START_PORT" || lsof -i :$START_PORT > /dev/null 2>&1; do
    echo "A porta $START_PORT já está em uso, tentando a porta $((START_PORT+1))..."
    START_PORT=$((START_PORT+1))
done

export PORT=$START_PORT
echo "Iniciando Servidor Web na porta $PORT..."

# Verifica se o standalone existe, caso contrário usa o modo padrão
if [ -f "apps/web/.next/standalone/apps/web/server.js" ]; then
    echo "Executando via Next.js Standalone (Monorepo)..."
    # O modo Standalone do Next.js exige que copiemos a pasta static e public manualmente para que o CSS funcione
    cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/ 2>/dev/null || true
    cp -r apps/web/public apps/web/.next/standalone/apps/web/ 2>/dev/null || true
    
    # É necessário entrar na pasta para o standalone rodar corretamente
    cd apps/web/.next/standalone/apps/web && node server.js
elif [ -f "apps/web/.next/standalone/server.js" ]; then
    echo "Executando via Next.js Standalone..."
    # O modo Standalone do Next.js exige que copiemos a pasta static e public manualmente para que o CSS funcione
    cp -r apps/web/.next/static apps/web/.next/standalone/.next/ 2>/dev/null || true
    cp -r apps/web/public apps/web/.next/standalone/ 2>/dev/null || true
    
    # É necessário entrar na pasta para o standalone rodar corretamente
    cd apps/web/.next/standalone && node server.js
else
    echo "Standalone não encontrado. Tentando npm start..."
    npm start --workspace=web
fi
