#!/bin/bash
set -e

# Links
ANACONDA_URL="https://repo.anaconda.com/archive/Anaconda3-2024.10-1-Linux-x86_64.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/progs"
CONDA_ENV_NAME="BioMolExplorer"

# Local installers
ANACONDA_INSTALLER="${SCRIPT_DIR}/apps/Anaconda.sh"
CHIMERA_INSTALLER="${SCRIPT_DIR}/apps/chimera.bin"


if [ ! -d "${SCRIPT_DIR}/apps" ]; then
    echo "Criando a pasta 'apps'..."
    mkdir -p "${SCRIPT_DIR}/apps"
fi

if [ ! -d "$INSTALL_DIR" ]; then
    mkdir -p "$INSTALL_DIR"
fi

install_sys_deps() {
    echo "Verificando dependências de sistema (Docker, Dock6 tools, etc)..."
    if command -v dpkg &> /dev/null && dpkg -s git zlib1g-dev flex bison gfortran docker.io wget curl &> /dev/null 2>&1; then
        echo "Dependências de sistema já estão instaladas."
    else
        echo "Instalando dependências de sistema via apt-get (pode solicitar senha sudo)..."
        sudo apt-get update || true
        sudo apt-get install -y git zlib1g-dev flex bison gfortran docker.io docker-compose wget curl || true
    fi
}

install_npm_deps() {
    echo "Instalando dependências do Node.js..."
    cd "$SCRIPT_DIR"
    if command -v npm &> /dev/null; then
        npm install
    else
        echo "Aviso: npm não encontrado no PATH. Instale o Node.js."
    fi
}

install_anaconda() {
    if ! command -v conda &> /dev/null && [ ! -x "$INSTALL_DIR/anaconda3/bin/conda" ] && [ ! -x "$HOME/anaconda3/bin/conda" ]; then
        echo "Conda não encontrado. Instalando Anaconda..."
        if [ ! -f "$ANACONDA_INSTALLER" ]; then
            echo "Baixando Anaconda..."
            wget -qO "$ANACONDA_INSTALLER" "$ANACONDA_URL"
        fi
        chmod +x "$ANACONDA_INSTALLER"
        bash "$ANACONDA_INSTALLER" -b -p "$INSTALL_DIR/anaconda3"
        
        if ! grep -q "export PATH=\"$INSTALL_DIR/anaconda3/bin:\$PATH\"" ~/.bashrc; then
            echo "Adicionando Anaconda ao PATH no ~/.bashrc..."
            echo "export PATH=\"$INSTALL_DIR/anaconda3/bin:\$PATH\"" >> ~/.bashrc
        fi
        export PATH="$INSTALL_DIR/anaconda3/bin:$PATH"
        eval "$("$INSTALL_DIR/anaconda3/bin/conda" shell.bash hook)"
    else
        echo "Anaconda/Conda detectado."
        for C_BIN in $(command -v conda 2>/dev/null) "$INSTALL_DIR/anaconda3/bin/conda" "$HOME/anaconda3/bin/conda" "$HOME/miniconda3/bin/conda"; do
            if [ -x "$C_BIN" ]; then
                export PATH="$(dirname "$C_BIN"):$PATH"
                eval "$("$C_BIN" shell.bash hook)"
                break
            fi
        done
    fi

    echo "Aceitando Termos de Serviço da Anaconda..."
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main || true
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r || true

    cd "$SCRIPT_DIR"
    if conda env list | grep -q "$CONDA_ENV_NAME"; then
        echo "Atualizando ambiente Conda '$CONDA_ENV_NAME'..."
        conda env update --file requirements.yml --prune
    else
        echo "Criando ambiente Conda '$CONDA_ENV_NAME'..."
        conda env create --file requirements.yml -y
    fi
}

install_chimera() {
    if ! command -v chimera &> /dev/null; then
        echo "Chimera não detectado no PATH. Iniciando instalação..."
        if [ ! -f "$CHIMERA_INSTALLER" ]; then
            echo "[AVISO] Arquivo chimera.bin não encontrado em $CHIMERA_INSTALLER. Baixe-o manualmente se precisar."
        else
            chmod +x "$CHIMERA_INSTALLER"
            sudo "$CHIMERA_INSTALLER"
        fi
    else
        echo "Chimera já está instalado."
    fi
}

install_dock6() {
    if ! command -v dock6 &> /dev/null && [ ! -x "$INSTALL_DIR/dock6/bin/dock6" ]; then
        if [ ! -d "$INSTALL_DIR/dock6" ]; then
            echo "Clonando o repositório do Dock6 via Git..."
            git clone https://github.com/docking-org/dock6.git "$INSTALL_DIR/dock6"
        fi
        echo "Compilando e instalando Dock6..."
        cd "$INSTALL_DIR/dock6/install"
        chmod +x configure
        ./configure gnu
        make all
        echo "Dock6 compilado e instalado em $INSTALL_DIR/dock6"
        
        if ! grep -q "export PATH=\"\$PATH:\$HOME/progs/dock6/bin\"" ~/.bashrc; then
            echo "Adicionando Dock6 ao PATH no ~/.bashrc..."
            echo 'export PATH="$PATH:$HOME/progs/dock6/bin"' >> ~/.bashrc
        fi
        export PATH="$PATH:$HOME/progs/dock6/bin"
    else
        echo "Dock6 já existe e está instalado."
    fi
}

echo "=== Iniciando Instalação do BioMolExplorer ==="
install_sys_deps
install_npm_deps
install_anaconda 
install_chimera
install_dock6
echo "=== Instalação completa! ==="
