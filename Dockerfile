FROM mambaorg/micromamba:1.5.8-bullseye-slim

USER root

WORKDIR /app

COPY backend/BioMolExplorer/requirements.yml /tmp/requirements.yml

RUN micromamba env create -f /tmp/requirements.yml -y && \
    micromamba clean --all --yes

COPY . .

WORKDIR /app/backend

RUN mkdir -p /app/backend/logs && chmod -R 777 /app/backend/logs

EXPOSE 5000

CMD ["micromamba", "run", "-n", "BioMolExplorer", "python", "app.py"]
