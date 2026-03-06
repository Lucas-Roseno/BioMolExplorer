# ==========================================
# Etapa 1: Build do Next.js
# ==========================================
FROM node:20-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/

RUN npm install

COPY . .

RUN npm run build --workspace=web

# ==========================================
# Etapa 2: Produção (Python + Node.js)
# ==========================================
FROM continuumio/miniconda3:latest

# Instala o Node.js 20
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia TODO o projeto do builder (incluindo o .next build e node_modules)
COPY --from=builder /app /app/

# Configura o ambiente Conda para o Python Service
RUN conda env create -f apps/python-service/BioMolExplorer/requirements.yml && \
    conda clean -a -y

# Dá permissão ao script de inicialização
RUN chmod +x init.sh

# A porta principal do Render (Next.js)
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Executa o script que ativa o Conda e roda o projeto
CMD ["bash", "./init.sh"]
