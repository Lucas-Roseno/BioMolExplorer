#!/bin/bash


# Links (Validate before executing)
ANACONDA_URL="https://repo.anaconda.com/archive/Anaconda3-2024.10-1-Linux-x86_64.sh"


if [ ! -d "./apps" ]; then
    echo "Criando a pasta 'apps'..."
    mkdir -p "./apps"
fi

ANACONDA_INSTALLER="./apps/Anaconda-latest-Linux-x86_64.sh"
CONDA_ENV_NAME="BioMolExplorer"
INSTALL_DIR="$HOME/progs"

install_anaconda() {

    if ! command -v conda &> /dev/null; then
        echo "Instalando Anaconda..."
        if [ ! -f "$ANACONDA_INSTALLER" ]; then
            echo "Baixando Anaconda..."
            wget "$ANACONDA_URL" -O "$ANACONDA_INSTALLER"
        fi
        chmod +x "$ANACONDA_INSTALLER"
        bash "$ANACONDA_INSTALLER" -b -p "$INSTALL_DIR/anaconda3"
        if ! grep -q "export PATH=\"$INSTALL_DIR/anaconda3/bin:\$PATH\"" ~/.bashrc; then
            echo "Adicionando Anaconda ao PATH no ~/.bashrc..."
            echo "export PATH=\"$INSTALL_DIR/anaconda3/bin:\$PATH\"" >> ~/.bashrc
        fi
        source "$HOME/.bashrc"
        echo "Anaconda instalado com sucesso."
    fi

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


if [ ! -d "$INSTALL_DIR" ]; then
    mkdir -p "$INSTALL_DIR"
fi

install_anaconda 
echo "Instalação completa."
