#!/bin/bash

# =============================================================================
# BioMolExplorer — Setup Automático de Ambiente Nativo
# =============================================================================
# Este script instala todas as dependências necessárias para rodar o projeto
# em modo de desenvolvimento nativo (sem Docker).
#
# Uso: bash setup.sh
# =============================================================================

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

CONDA_ENV_NAME="BioMolExplorer"
REQUIREMENTS_FILE="apps/python-service/BioMolExplorer/requirements.yml"
CHIMERA_EXPECTED_PATH="apps/python-service/BioMolExplorer/apps/chimera.bin"

print_step() { echo -e "\n${CYAN}${BOLD}==> $1${RESET}"; }
print_ok()   { echo -e "${GREEN}✔ $1${RESET}"; }
print_warn() { echo -e "${YELLOW}⚠ $1${RESET}"; }
print_err()  { echo -e "${RED}✖ $1${RESET}"; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║          🧬 BioMolExplorer — Setup Inicial           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# ─── Verificar se estamos na raiz do projeto ─────────────────────────────────
if [ ! -f "package.json" ] || [ ! -d "apps" ]; then
    print_err "Execute este script a partir da raiz do repositório BioMolExplorer."
    exit 1
fi

# ─── Passo 1: Verificar Node.js ──────────────────────────────────────────────
print_step "Verificando Node.js..."
if ! command -v node &>/dev/null; then
    print_err "Node.js não encontrado. Instale a versão 18+ em: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_err "Node.js versão $NODE_VERSION detectada. É necessário Node.js 18+."
    exit 1
fi
print_ok "Node.js $(node --version) encontrado."

# ─── Passo 2: Verificar/Instalar Conda ───────────────────────────────────────
print_step "Verificando Conda (Anaconda/Miniconda)..."
if ! command -v conda &>/dev/null; then
    print_warn "Conda não encontrado. Baixando e instalando Miniconda..."

    MINICONDA_URL="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh"
    MINICONDA_INSTALLER="/tmp/Miniconda3-latest.sh"

    curl -fsSL "$MINICONDA_URL" -o "$MINICONDA_INSTALLER"
    bash "$MINICONDA_INSTALLER" -b -p "$HOME/miniconda3"
    rm -f "$MINICONDA_INSTALLER"

    export PATH="$HOME/miniconda3/bin:$PATH"

    # Adiciona ao .bashrc se ainda não estiver lá
    if ! grep -q "miniconda3/bin" ~/.bashrc; then
        echo 'export PATH="$HOME/miniconda3/bin:$PATH"' >> ~/.bashrc
    fi

    print_ok "Miniconda instalado em $HOME/miniconda3"
else
    print_ok "Conda $(conda --version) encontrado."
fi

# Inicializar o shell do conda para este script
CONDA_BASE=$(conda info --base 2>/dev/null)
source "$CONDA_BASE/etc/profile.d/conda.sh"

# ─── Passo 3: Criar o ambiente Conda com todas as dependências Python ─────────
print_step "Configurando ambiente Conda '$CONDA_ENV_NAME'..."

if conda env list | grep -q "^$CONDA_ENV_NAME "; then
    print_warn "Ambiente '$CONDA_ENV_NAME' já existe. Pulando criação."
    print_warn "Para recriar do zero, rode: conda env remove -n $CONDA_ENV_NAME"
else
    echo "Criando ambiente com todas as dependências científicas..."
    echo "(RDKit, OpenBabel, AutoDock Vina, PyMOL, Pandas, Biopython, NetworkX, etc.)"
    echo "Isso pode levar alguns minutos..."
    conda env create -f "$REQUIREMENTS_FILE" -y
    print_ok "Ambiente '$CONDA_ENV_NAME' criado com sucesso."
fi

# ─── Passo 4: Aviso sobre UCSF Chimera ───────────────────────────────────────
print_step "Verificando UCSF Chimera..."
if command -v chimera &>/dev/null; then
    print_ok "UCSF Chimera já está instalado."
elif [ -f "$CHIMERA_EXPECTED_PATH" ]; then
    print_warn "Arquivo chimera.bin encontrado. Executando instalador..."
    chmod +x "$CHIMERA_EXPECTED_PATH"
    sudo "$CHIMERA_EXPECTED_PATH"
    print_ok "UCSF Chimera instalado."
else
    print_warn "UCSF Chimera NÃO foi encontrado."
    echo ""
    echo -e "  ${YELLOW}O Chimera é necessário apenas para o pipeline de Redocking.${RESET}"
    echo -e "  Para instalá-lo manualmente:"
    echo -e "  ${CYAN}1.${RESET} Acesse: https://www.rbvi.ucsf.edu/chimera/download.html"
    echo -e "  ${CYAN}2.${RESET} Baixe o instalador ${BOLD}.bin${RESET} para Linux"
    echo -e "  ${CYAN}3.${RESET} Coloque o arquivo em: ${BOLD}$CHIMERA_EXPECTED_PATH${RESET}"
    echo -e "  ${CYAN}4.${RESET} Rode este script novamente ${BOLD}OU${RESET} execute:"
    echo -e "     ${BOLD}chmod +x $CHIMERA_EXPECTED_PATH && sudo $CHIMERA_EXPECTED_PATH${RESET}"
    echo ""
    print_warn "Continuando sem Chimera (o resto do projeto funciona normalmente)."
fi

# ─── Passo 5: Instalar dependências JavaScript (npm workspaces) ───────────────
print_step "Instalando dependências JavaScript (npm workspaces)..."
npm install
print_ok "Dependências JavaScript instaladas."

# ─── Concluído ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║               ✅ Setup Concluído!                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "Para iniciar o projeto, rode:"
echo -e "  ${CYAN}${BOLD}bash dev.sh${RESET}"
echo ""
echo -e "Acesse em: ${BOLD}http://localhost:3000${RESET}"
echo ""
