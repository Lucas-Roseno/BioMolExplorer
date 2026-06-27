#!/usr/bin/env bash
# =============================================================================
#  BioMolExplorer - Inicializador Nativo Linux / macOS
#  Chamado pelo Electron. Gerencia extração, Miniconda, Conda env e serviços.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_TAR="$SCRIPT_DIR/biomolexplorer-src.tar.gz"

# Electron não carrega ~/.bashrc, então são injetados diretórios comuns no PATH.
_prepend_path() { case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac; }
for _nd in "$HOME/.local/bin" "$HOME/.biomolexplorer/miniconda/bin" \
           "$HOME/miniconda3/bin" "$HOME/anaconda3/bin" "/usr/local/bin"; do
  [ -d "$_nd" ] && _prepend_path "$_nd"
done
unset -f _prepend_path 2>/dev/null; unset _nd

# Ativa nvm se já foi instalado anteriormente
export NVM_DIR="$HOME/.biomolexplorer/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true

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

# Wrapper de download: usa curl ou wget
_download() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$dest"
  else
    fail "Nenhuma ferramenta de download encontrada (curl/wget)." \
      "Reinstale o BioMolExplorer via .deb para corrigir dependências."
  fi
}

# Wrapper de health check HTTP
_http_ok() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -s --max-time 2 "$url" >/dev/null 2>&1
  else
    wget -q --timeout=2 "$url" -O /dev/null >/dev/null 2>&1
  fi
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
    "Tente reinstalar o BioMolExplorer via .deb."
  step "Instalando BioMolExplorer em $INSTALL_DIR..."
  mkdir -p "$APP_DIR"
  tar -xzf "$SRC_TAR" -C "$APP_DIR" --strip-components=1 \
    || fail "Falha ao extrair o código-fonte." "O arquivo pode estar corrompido. Reinstale o .deb."
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
  _download "$url" "$installer" \
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
  # Aceita os Termos de Serviço da Anaconda (exigido desde 2024 em modo não-interativo)
  conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main 2>/dev/null || true
  conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r 2>/dev/null || true
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
#  [3.5] Instalar Node.js via nvm se ausente (sem sudo)
# =============================================================================
install_node() {
  # Verifica se já tem node >= 18 no PATH (sistema ou nvm)
  if command -v node >/dev/null 2>&1; then
    local ver; ver=$(node --version | sed 's/v//' | cut -d. -f1)
    [ "$ver" -ge 18 ] && { ok "Node.js $(node --version) encontrado."; return; }
  fi

  step "Instalando Node.js 20 via nvm..."
  export NVM_DIR="$HOME/.biomolexplorer/nvm"
  mkdir -p "$NVM_DIR"
  local nvm_install="/tmp/nvm-install-$$.sh"
  _download "https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh" "$nvm_install" \
    || fail "Falha ao baixar nvm." "Verifique sua conexão com a internet."
  PROFILE=/dev/null bash "$nvm_install" >/dev/null 2>&1
  rm -f "$nvm_install"
  [ -s "$NVM_DIR/nvm.sh" ] || fail "Falha ao instalar nvm." "Verifique sua conexão com a internet."
  source "$NVM_DIR/nvm.sh"
  nvm install 20 \
    || fail "Falha ao instalar Node.js 20." "Verifique sua conexão com a internet."
  ok "Node.js $(node --version) instalado via nvm!"
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
    || fail "Node.js não encontrado." "Reinstale o BioMolExplorer via .deb para corrigir dependências."
  local node_ver
  node_ver=$(node --version | sed 's/v//' | cut -d. -f1)
  [ "$node_ver" -lt 18 ] && fail "Node.js $node_ver detectado. É necessário Node.js 18+." \
    "Reinstale o BioMolExplorer via .deb para atualizar o Node.js."
  local npm_bin
  npm_bin=$(command -v npm 2>/dev/null) \
    || fail "npm não encontrado." "Reinstale o BioMolExplorer via .deb para corrigir dependências."
  step "Instalando dependências JavaScript..."
  (cd "$APP_DIR" && "$npm_bin" install) \
    || fail "Falha ao instalar dependências JavaScript." "Verifique sua conexão com a internet."
  ok "Dependências JavaScript instaladas!"
}

# =============================================================================
#  Integrar ícone no sistema do usuário (apenas primeira execução)
# =============================================================================
integrate_desktop() {
  local icon_src="$APP_DIR/apps/desktop/wrapper/assets/icons/256x256.png"
  local icon_dst="$HOME/.local/share/icons/hicolor/256x256/apps/biomolexplorer.png"

  [ -f "$icon_dst" ] && return
  [ ! -f "$icon_src" ] && return

  step "Integrando ícone no sistema..."
  mkdir -p "$(dirname "$icon_dst")"
  cp "$icon_src" "$icon_dst"
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
  ok "Ícone integrado!"
}

# =============================================================================
#  [5/5] Iniciar os 3 serviços nativos
# =============================================================================
start_services() {
  local CONDA_ENV_DIR="$CONDA_DIR/envs/$CONDA_ENV_NAME"
  local PYTHON_BIN="$CONDA_ENV_DIR/bin/python"

  [ -f "$PYTHON_BIN" ] || fail "Python não encontrado em $PYTHON_BIN." \
    "O ambiente conda pode não ter sido criado. Delete ~/.biomolexplorer e reabra o app."

  # Ativa o ambiente conda manualmente (sem depender de conda activate em subshell)
  export CONDA_PREFIX="$CONDA_ENV_DIR"
  export CONDA_DEFAULT_ENV="$CONDA_ENV_NAME"
  export PATH="$CONDA_ENV_DIR/bin:$PATH"
  export LD_LIBRARY_PATH="$CONDA_ENV_DIR/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

  local NPM_BIN
  NPM_BIN=$(command -v npm 2>/dev/null) || fail "npm não encontrado no PATH."

  local LOG_DIR="$INSTALL_DIR/logs"
  mkdir -p "$LOG_DIR"

  step "Liberando portas 3000, 3001 e 5000..."
  fuser -k -9 3000/tcp 3001/tcp 5000/tcp >/dev/null 2>&1 || true

  step "Iniciando Flask (porta 5000)..."
  (cd "$APP_DIR/apps/python-service" && "$PYTHON_BIN" app.py) > "$LOG_DIR/flask.log" 2>&1 &
  local FLASK_PID=$!

  step "Iniciando API Node.js (porta 3001)..."
  (cd "$APP_DIR" && "$NPM_BIN" run start --workspace=api) > "$LOG_DIR/api.log" 2>&1 &

  step "Aguardando backends ficarem prontos..."
  local count=0
  while [ $count -lt 90 ]; do
    sleep 1
    count=$((count + 1))

    # Verifica se Flask morreu com erro
    if ! kill -0 "$FLASK_PID" 2>/dev/null; then
      warn "Flask encerrou inesperadamente. Últimas linhas do log:"
      tail -20 "$LOG_DIR/flask.log" | while IFS= read -r line; do printf '  [flask] %s\n' "$line"; done
      fail "Flask falhou ao iniciar." "Verifique o log em $LOG_DIR/flask.log"
    fi

    FLASK_OK=$(_http_ok http://127.0.0.1:5000/pdb_files && echo 1 || echo 0)
    NODE_OK=$(_http_ok http://127.0.0.1:3001/api/files/list/PDB && echo 1 || echo 0)
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
    _http_ok "http://localhost:$PORT" && break
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

printf '  [3.5/5] Verificando Node.js...\n'
install_node
printf '\n'

printf '  [4/5] Instalando dependências JavaScript...\n'
setup_npm
printf '\n'

printf '  [5/5] Iniciando serviços...\n'
integrate_desktop
start_services
