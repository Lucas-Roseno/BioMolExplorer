#!/bin/bash
set -e

echo "=== BioMolExplorer Production Server ==="

# Ativar Conda Environment
source /opt/conda/etc/profile.d/conda.sh
conda activate BioMolExplorer

echo "Iniciando os 3 serviços (Next.js + API Node + Python Flask)..."

# Inicia a API Node.js em background (porta 3001 interna)
cd /app && npx ts-node apps/api/src/server.ts &

# Inicia o Python Flask em background (porta 5000 interna)
cd /app/apps/python-service && python app.py &

# Inicia o Next.js standalone na porta principal (3000)
cd /app/apps/web
PORT=${PORT:-3000} node .next/standalone/apps/web/server.js
