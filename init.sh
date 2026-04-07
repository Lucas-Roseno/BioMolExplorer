#!/bin/bash
set -e

echo "=== BioMolExplorer Production Server ==="

# Ativar Conda Environment
CONDA_BASE=$(conda info --base 2>/dev/null)
if [ -n "$CONDA_BASE" ]; then
    source "$CONDA_BASE/etc/profile.d/conda.sh"
    conda activate BioMolExplorer
else
    echo "Conda não encontrado no PATH. Tentando carregar o ambiente manualmente..."
    # Fallback se o conda não estiver no PATH mas o ambiente estiver instalado
    export PATH="/home/lucas-roseno/anaconda3/bin:$PATH"
    source "/home/lucas-roseno/anaconda3/etc/profile.d/conda.sh"
    conda activate BioMolExplorer
fi

echo "Iniciando os 3 serviços (Next.js + API Node + Python Flask)..."

# Limpar processos antigos nas portas 3001 e 5000 (opcional, mas evita erro de porta em uso)
echo "Limpando processos nas portas 3001 e 5000..."
fuser -k 3001/tcp 5000/tcp || true

# Inicia a API Node.js em background (porta 3001 interna)
npx ts-node apps/api/src/server.ts &

# Inicia o Python Flask em background (porta 5000 interna)
python apps/python-service/app.py &

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

# Build do Front-end (necessário para Next.js start)
echo "Construindo aplicação web..."
npm run build --workspace=web

# Inicia o Next.js na porta principal (definida pelo Render via $PORT)
HOSTNAME="0.0.0.0" PORT=${PORT:-3000} npm start --workspace=web
