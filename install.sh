#!/bin/bash


# Links (Validate before executing)
ANACONDA_URL="https://repo.anaconda.com/archive/Anaconda3-2024.10-1-Linux-x86_64.sh"


if [ ! -d "./apps" ]; then
    echo "Criando a pasta 'apps'..."
    mkdir -p "./apps"
fi

ANACONDA_INSTALLER="./apps/Anaconda.sh"
CONDA_ENV_NAME="BioMolExplorer"
INSTALL_DIR="$HOME/progs"

#Aplicações baixadas / existêntes na pasta apps
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHIMERA_INSTALLER="${SCRIPT_DIR}/apps/chimera.bin"


install_anaconda() {

    if ! command -v conda &> /dev/null; then
        echo "Instalando Anaconda..."
        
        chmod +x "$ANACONDA_INSTALLER"
        bash "$ANACONDA_INSTALLER" -b -p "$INSTALL_DIR/anaconda3"
        if ! grep -q "export PATH=\"$INSTALL_DIR/anaconda3/bin:\$PATH\"" ~/.bashrc; then
            echo "Adicionando Anaconda ao PATH no ~/.bashrc..."
            echo "export PATH=\"$INSTALL_DIR/anaconda3/bin:\$PATH\"" >> ~/.bashrc
        fi
        source "$HOME/.bashrc"
        echo "Anaconda instalado com sucesso."
    fi

    # 2. RESOLUÇÃO DO ERRO: Aceitar os Termos de Serviço (ToS) de forma não interativa
    echo "Aceitando Termos de Serviço da Anaconda..."
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r

    if conda env list | grep -q "$CONDA_ENV_NAME"; then
        echo "O ambiente Conda '$CONDA_ENV_NAME' foi criado com sucesso."
    else
        export PATH="$INSTALL_DIR/anaconda3/bin:$PATH"
        echo "Criando ambiente Conda..."
        conda env create --file=requirements.yml -y

        if ! conda env list | grep -q "$CONDA_ENV_NAME"; then
            echo "Erro: O ambiente Conda '$CONDA_ENV_NAME' não foi encontrado."
        fi
    fi

}

install_chimera() {

    if ! command -v chimera &> /dev/null; then
        echo "[INFO] Chimera não detectado no PATH. Iniciando instalação..."

        if [ ! -f "$CHIMERA_INSTALLER" ]; then
            echo "[ERRO] Arquivo chimera.bin não encontrado em $CHIMERA_INSTALLER"
            exit 1
        fi

        chmod +x "$CHIMERA_INSTALLER"
        sudo "$CHIMERA_INSTALLER"

        if command -v chimera &> /dev/null; then
            echo "Chimera instalado com sucesso."
        else
            echo "[ERRO] Chimera não configurado no PATH após instalação."
        fi

    else
        echo "Chimera já está instalado."
    fi
}

if [ ! -d "$INSTALL_DIR" ]; then
    mkdir -p "$INSTALL_DIR"
fi

install_anaconda 
install_chimera
echo "Instalação completa."
