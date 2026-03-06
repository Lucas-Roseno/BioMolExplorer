#!/bin/bash
set -e

echo "Inicializando BioMolExplorer Serverless Environment..."

# Ativar Conda Environment
source /opt/conda/etc/profile.d/conda.sh
conda activate BioMolExplorer

echo "Iniciando serviços Node.js e Python simultaneamente..."
# Passando a vara pro NPM Workspaces com o concurrently configurado
npm run start
