# ==========================================
# Etapa 1: Build do Next.js
# ==========================================
FROM node:20-slim AS builder

WORKDIR /app

# Copia tudo (respeitando .dockerignore)
COPY . .

# Instala dependências e faz build do Next.js
RUN npm install
RUN npm run build --workspace=web

# Copia os arquivos estáticos para dentro do standalone (Next.js não faz isso automaticamente)
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public && \
    mkdir -p apps/web/.next/standalone/apps/web/.next && \
    cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

# ==========================================
# Etapa 2: Produção (Python + Node.js)
# ==========================================
FROM continuumio/miniconda3:latest

# Instala o Node.js 20 e ts-node globalmente
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g ts-node typescript && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia TODO o projeto do builder (incluindo .next build, node_modules e static assets)
COPY --from=builder /app /app/

# Configura o ambiente Conda para o Python Service
RUN conda env create -f apps/python-service/BioMolExplorer/requirements.yml && \
    conda clean -a -y

# Dá permissão ao script de inicialização
RUN chmod +x init.sh

# A porta principal do Render
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Executa o script que ativa o Conda e roda o projeto
CMD ["bash", "./init.sh"]
