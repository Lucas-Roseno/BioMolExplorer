# =============================================================================
#  BioMolExplorer - Inicializador Nativo Linux / macOS
#  Chamado pelo Electron. Gerencia extração, Miniconda, Conda env e serviços.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_TAR="$SCRIPT_DIR/biomolexplorer-src.tar.gz"

# Quando iniciado a partir do Electron, o bash é executado sem carregar o perfil do usuário (~/.bashrc),
# portanto, o miniconda não consta no PATH. Insere aqui locais comuns para garantir que o Node.js >= 18
# so miniconda is not in PATH. We inject common locations here to ensure Node.js >= 18
# e o npm sejam encontrados, em vez do antigo /usr/bin/node (v12) do sistema.
_prepend_path() { case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac; }
for _nd in "$HOME/.local/bin" "$HOME/miniconda3/bin" "$HOME/anaconda3/bin" "/usr/local/bin"; do
  [ -d "$_nd" ] && _prepend_path "$_nd"
done
unset -f _prepend_path 2>/dev/null; unset _nd

INSTALL_DIR="$HOME/.biomolexplorer"
APP_DIR="$INSTALL_DIR/app"
CONDA_DIR="$INSTALL_DIR/miniconda"
CONDA_ENV_NAME="BioMolExplorer"
PORT=3000

# -------- Helpers de log --------
step() { printf '  [..] %s\n' "$1"; }
ok()   { printf '  [OK] %s\n' "$1"; }
warn() { printf '  [!!] %s\n' "$1"; }
fail() {
  printf '  [FAIL] %s\n' "$1"
  [ -n "$2" ] && printf '  [HINT] %s\n' "$2"
  exit 1
}

banner() {
  printf '\n'
  printf '  +--------------------------------------------------+\n'
  printf '  |      BioMolExplorer 2.0  --  Launcher Nativo     |\n'
  printf '  |        Plataforma de Analise Molecular            |\n'
  printf '  +--------------------------------------------------+\n'
  printf '\n'
}

# =============================================================================
#  [1/5] Extrair código-fonte (apenas primeira execução)
# =============================================================================
extract_source() {
  if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/package.json" ]; then
    ok "Instalação encontrada em $APP_DIR"
    return
  fi
  [ ! -f "$SRC_TAR" ] && fail "Pacote não encontrado: $SRC_TAR" \
    "Verifique se o AppImage foi extraído junto com biomolexplorer-src.tar.gz na mesma pasta."
  step "Instalando BioMolExplorer em $INSTALL_DIR..."
  mkdir -p "$APP_DIR"
  tar -xzf "$SRC_TAR" -C "$APP_DIR" --strip-components=1 \
    || fail "Falha ao extrair o código-fonte." "O arquivo .tar.gz pode estar corrompido."
  ok "Código-fonte instalado!"
}

# =============================================================================
#  [2/5] Instalar Miniconda (apenas primeira execução)
# =============================================================================
install_miniconda() {
  if [ -f "$CONDA_DIR/bin/conda" ]; then
    ok "Miniconda já instalado."
    return
  fi
  step "Baixando Miniconda..."
  local url
  case "$(uname -sm)" in
    "Linux x86_64")  url="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh" ;;
    "Linux aarch64") url="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-aarch64.sh" ;;
    "Darwin x86_64") url="https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh" ;;
    "Darwin arm64")  url="https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh" ;;
    *) fail "Arquitetura não suportada: $(uname -sm)" ;;
  esac
  local installer="/tmp/biomol-miniconda-$$.sh"
  curl -fsSL "$url" -o "$installer" \
    || fail "Falha ao baixar Miniconda." "Verifique sua conexão com a internet."
  bash "$installer" -b -p "$CONDA_DIR" \
    || fail "Falha ao instalar o Miniconda."
  rm -f "$installer"
  ok "Miniconda instalado em $CONDA_DIR!"
}

# =============================================================================
#  [3/5] Criar ambiente Conda com dependências científicas (apenas primeira vez)
# =============================================================================
setup_conda_env() {
  source "$CONDA_DIR/etc/profile.d/conda.sh"
  if conda env list | grep -q "^$CONDA_ENV_NAME "; then
    ok "Ambiente Conda '$CONDA_ENV_NAME' já existe."
    return
  fi
  step "Criando ambiente Conda com dependências científicas..."
  warn "Esta etapa pode levar de 5 a 15 minutos na primeira execução..."
  local req_file="$APP_DIR/apps/python-service/BioMolExplorer/requirements.yml"
  [ ! -f "$req_file" ] && fail "Arquivo requirements.yml não encontrado: $req_file"
  conda env create -f "$req_file" -y \
    || fail "Falha ao criar o ambiente Conda." "Verifique sua conexão com a internet e tente novamente."
  ok "Ambiente '$CONDA_ENV_NAME' criado!"
}

# =============================================================================
#  [4/5] Instalar dependências JavaScript (apenas primeira execução)
# =============================================================================
setup_npm() {
  if [ -d "$APP_DIR/node_modules" ]; then
    ok "Dependências JavaScript já instaladas."
    return
  fi
  command -v node >/dev/null 2>&1 \
    || fail "Node.js não encontrado." "Instale Node.js 18+ em https://nodejs.org/ e reabra o app."
  local npm_bin
  npm_bin=$(command -v npm 2>/dev/null) \
    || fail "npm não encontrado." "Instale Node.js 18+ em https://nodejs.org/ e reabra o app."
  local node_ver
  node_ver=$(node --version | sed 's/v//' | cut -d. -f1)
  [ "$node_ver" -lt 18 ] && fail "Node.js $node_ver detectado. É necessário Node.js 18+." \
    "Atualize em https://nodejs.org/"
  step "Instalando dependências JavaScript..."
  (cd "$APP_DIR" && "$npm_bin" install) \
    || fail "Falha ao instalar dependências JavaScript."
  ok "Dependências JavaScript instaladas!"
}

# =============================================================================
#  [5/5] Integrar ícone e .desktop no sistema (apenas primeira execução)
# =============================================================================
integrate_desktop() {
  local icon_src="$APP_DIR/apps/desktop/wrapper/assets/icons/256x256.png"
  local icon_dst="$HOME/.local/share/icons/hicolor/256x256/apps/biomolexplorer.png"
  local desktop_dst="$HOME/.local/share/applications/biomolexplorer.desktop"

  [ -f "$icon_dst" ] && return  # já integrado

  [ ! -f "$icon_src" ] && return  # ícone não disponível, pula silenciosamente

  step "Integrando ícone no sistema..."
  mkdir -p "$(dirname "$icon_dst")" "$(dirname "$desktop_dst")"

  cp "$icon_src" "$icon_dst"

  cat > "$desktop_dst" <<EOF
[Desktop Entry]
Name=BioMolExplorer
Comment=Plataforma de Análise Molecular
Exec=${APPIMAGE:-$0}
Icon=biomolexplorer
Type=Application
Categories=Science;Education;
Terminal=false
EOF

  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
  update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
  ok "Ícone integrado!"
}

# =============================================================================
#  [5/5] Iniciar os 3 serviços nativos
# =============================================================================
start_services() {
  source "$CONDA_DIR/etc/profile.d/conda.sh"
  conda activate "$CONDA_ENV_NAME"

  local PYTHON_BIN
  PYTHON_BIN=$(which python) || fail "Python não encontrado no ambiente Conda."

  local NPM_BIN NPX_BIN
  NPM_BIN=$(command -v npm 2>/dev/null) || fail "npm não encontrado no PATH."
  NPX_BIN=$(command -v npx 2>/dev/null) || fail "npx não encontrado no PATH."

  step "Liberando portas 3000, 3001 e 5000..."
  fuser -k -9 3000/tcp 3001/tcp 5000/tcp >/dev/null 2>&1 || true

  step "Iniciando Flask (porta 5000)..."
  "$PYTHON_BIN" "$APP_DIR/apps/python-service/app.py" &

  step "Iniciando API Node.js (porta 3001)..."
  (cd "$APP_DIR" && "$NPM_BIN" run start --workspace=api) &

  step "Aguardando backends ficarem prontos..."
  local count=0
  while [ $count -lt 60 ]; do
    sleep 1
    count=$((count + 1))
    FLASK_OK=$(curl -s --max-time 1 http://127.0.0.1:5000/pdb_files >/dev/null 2>&1 && echo 1 || echo 0)
    NODE_OK=$(curl -s --max-time 1 http://127.0.0.1:3001/api/files/list/PDB >/dev/null 2>&1 && echo 1 || echo 0)
    if [ "$FLASK_OK" = "1" ] && [ "$NODE_OK" = "1" ]; then
      ok "Backends prontos!"
      break
    fi
  done

  step "Iniciando Next.js (porta 3000)..."
  (cd "$APP_DIR" && "$NPM_BIN" run dev --workspace=web) &

  count=0
  while true; do
    sleep 2
    count=$((count + 2))
    curl -s --max-time 2 "http://localhost:$PORT" >/dev/null 2>&1 && break
    [ "$count" -ge 120 ] && fail "Frontend demorou demais para responder." \
      "Verifique os logs do terminal para mais detalhes."
    printf '  ... Next.js iniciando %ds / 120s\n' "$count"
  done

  printf '  [OK] BioMolExplorer pronto!\n'
  wait
}

# =============================================================================
#  MAIN
# =============================================================================
banner
printf '  [INFO] Modo: Nativo (Conda + Node.js)\n\n'

printf '  [1/5] Verificando instalação...\n'
extract_source
printf '\n'

printf '  [2/5] Verificando Miniconda...\n'
install_miniconda
printf '\n'

printf '  [3/5] Configurando ambiente científico...\n'
setup_conda_env
printf '\n'

printf '  [4/5] Instalando dependências JavaScript...\n'
setup_npm
printf '\n'

printf '  [5/5] Iniciando serviços...\n'
integrate_desktop
start_services
