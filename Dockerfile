# Usa a imagem oficial reduzida do Node 20
FROM node:20-slim AS builder

WORKDIR /app
COPY . .

# Build Next.js
RUN npm install
RUN npm run build --workspace=web

# ==========================================
# Etapa Final (Produção com Python + Node.js)
# ==========================================
FROM continuumio/miniconda3:latest

# Instala o Node.js no ambiente hibrido
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app

# Copia dependências Node do builder (apenas essenciais)
COPY --from=builder /app /app/

# Configura o ambiente Conda para o Python Service
RUN conda env create -f apps/python-service/BioMolExplorer/requirements.yml && \
    conda clean -a -y

# Dá permissão ao script de inicialização
RUN chmod +x init.sh

# Exportando portas da Web (3000), Api (3001) e Backend Python (5000)
EXPOSE 3000 3001 5000

ENV PORT=3000

# Executa o script que ativa o Conda e roda o projeto
CMD ["./init.sh"]
