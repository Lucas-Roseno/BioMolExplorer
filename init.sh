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

# Aguarda o Node.js API estar pronto (porta 3001)
echo "Aguardando API Node.js na porta 3001..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3001/ > /dev/null 2>&1 || curl -s http://localhost:3001/api/files/list/PDB > /dev/null 2>&1; then
    echo "API Node.js pronta!"
    break
  fi
  sleep 1
done

# Aguarda o Flask estar pronto (porta 5000)
echo "Aguardando Flask na porta 5000..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5000/pdb_files > /dev/null 2>&1; then
    echo "Flask pronto!"
    break
  fi
  sleep 1
done

# Inicia o Next.js standalone na porta principal (definida pelo Render via $PORT)
cd /app/apps/web/.next/standalone/apps/web
HOSTNAME="0.0.0.0" PORT=${PORT:-3000} node server.js
