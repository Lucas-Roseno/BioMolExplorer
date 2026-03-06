#!/bin/bash
set -e

echo "=== BioMolExplorer Production Server ==="

# Ativar Conda Environment
source /opt/conda/etc/profile.d/conda.sh
conda activate BioMolExplorer

echo "Preparando arquivos estáticos do Next.js standalone..."

# O Next.js standalone NÃO inclui as pastas 'public' e '.next/static'.
# Precisamos copiá-las manualmente para o diretório standalone.
STANDALONE_DIR="/app/apps/web/.next/standalone"

# Copia a pasta public (imagens, ícones, etc.)
cp -r /app/apps/web/public "${STANDALONE_DIR}/apps/web/public"

# Copia os chunks estáticos (CSS, JS)
mkdir -p "${STANDALONE_DIR}/apps/web/.next"
cp -r /app/apps/web/.next/static "${STANDALONE_DIR}/apps/web/.next/static"

echo "Iniciando os 3 serviços (Next.js + API Node + Python Flask)..."

# Inicia a API Node.js em background (porta 3001 interna)
cd /app && node_modules/.bin/ts-node apps/api/src/server.ts &

# Inicia o Python Flask em background (porta 5000 interna)
cd /app/apps/python-service && python app.py &

# Aguarda um pouco para os serviços de backend subirem
sleep 3

# Inicia o Next.js standalone na porta principal (definida pelo Render via $PORT)
cd "${STANDALONE_DIR}/apps/web"
HOSTNAME="0.0.0.0" PORT=${PORT:-3000} node server.js
