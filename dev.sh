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
fuser -k 3000/tcp 3001/tcp 5000/tcp || true

# 1. Inicia o Python Flask em background (já tem hot-reload via debug=True)
python apps/python-service/app.py &

# 2. Inicia a API Node.js com NODEMON para hot-reload
npx nodemon --watch apps/api/src -e ts,js --exec "ts-node" apps/api/src/server.ts &

# Aguarda os serviços de backend estarem prontos
echo "Aguardando serviços de backend..."
sleep 5

# 3. Inicia o Next.js em modo DEV (Fast Refresh nativo) na porta 3000
echo "Iniciando Next.js (Front-end) com Hot Reload..."
npm run dev --workspace=web
