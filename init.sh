#!/bin/bash
set -e

echo "=== BioMolExplorer Production Server ==="

# Ativar Conda Environment
source /opt/conda/etc/profile.d/conda.sh
conda activate BioMolExplorer

echo "Iniciando os 3 serviços (Next.js + API Node + Python Flask)..."

# Inicia a API Node.js em background (porta 3001 interna)
cd /app && ts-node apps/api/src/server.ts &

# Inicia o Python Flask em background (porta 5000 interna)
cd /app/apps/python-service && python app.py &

# Aguarda um pouco para os serviços de backend subirem
sleep 3

# Inicia o Next.js standalone na porta principal (definida pelo Render via $PORT)
cd /app/apps/web/.next/standalone/apps/web
HOSTNAME="0.0.0.0" PORT=${PORT:-3000} node server.js
