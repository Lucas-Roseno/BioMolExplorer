#!/usr/bin/env bash
# =============================================================================
#  BioMolExplorer - Native Launcher for Linux / macOS
#  Called by Electron. Manages extraction, Miniconda, Conda env and services.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_TAR="$SCRIPT_DIR/biomolexplorer-src.tar.gz"

# Electron does not load ~/.bashrc, so common directories are injected into PATH.
_prepend_path() { case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac; }
for _nd in "$HOME/.local/bin" "$HOME/.biomolexplorer/miniconda/bin" \
           "$HOME/miniconda3/bin" "$HOME/anaconda3/bin" "/usr/local/bin"; do
  [ -d "$_nd" ] && _prepend_path "$_nd"
done
unset -f _prepend_path 2>/dev/null; unset _nd

# Activate nvm if already installed
export NVM_DIR="$HOME/.biomolexplorer/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true

INSTALL_DIR="$HOME/.biomolexplorer"
APP_DIR="$INSTALL_DIR/app"
CONDA_DIR="$INSTALL_DIR/miniconda"
CONDA_ENV_NAME="BioMolExplorer"
PORT=3000

# -------- Log helpers --------
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
  printf '  |      BioMolExplorer 2.0  --  Native Launcher     |\n'
  printf '  |        Molecular Analysis Platform                |\n'
  printf '  +--------------------------------------------------+\n'
  printf '\n'
}

# Download wrapper: uses curl or wget
_download() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$dest"
  else
    fail "No download tool found (curl/wget)." \
      "Reinstall BioMolExplorer via .deb to fix dependencies."
  fi
}

# HTTP health check wrapper
_http_ok() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -s --max-time 2 "$url" >/dev/null 2>&1
  else
    wget -q --timeout=2 "$url" -O /dev/null >/dev/null 2>&1
  fi
}

# =============================================================================
#  [1/5] Extract source code (first run only)
# =============================================================================
extract_source() {
  if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/package.json" ]; then
    ok "Installation found at $APP_DIR"
    return
  fi
  [ ! -f "$SRC_TAR" ] && fail "Package not found: $SRC_TAR" \
    "Try reinstalling BioMolExplorer via .deb."
  step "Installing BioMolExplorer at $INSTALL_DIR..."
  mkdir -p "$APP_DIR"
  tar -xzf "$SRC_TAR" -C "$APP_DIR" --strip-components=1 \
    || fail "Failed to extract source code." "The file may be corrupted. Reinstall the .deb."
  ok "Source code installed!"
}

# =============================================================================
#  [2/5] Install Miniconda (first run only)
# =============================================================================
install_miniconda() {
  if [ -f "$CONDA_DIR/bin/conda" ]; then
    ok "Miniconda already installed."
    return
  fi
  step "Downloading Miniconda..."
  local url
  case "$(uname -sm)" in
    "Linux x86_64")  url="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh" ;;
    "Linux aarch64") url="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-aarch64.sh" ;;
    "Darwin x86_64") url="https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh" ;;
    "Darwin arm64")  url="https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh" ;;
    *) fail "Unsupported architecture: $(uname -sm)" ;;
  esac
  local installer="/tmp/biomol-miniconda-$$.sh"
  _download "$url" "$installer" \
    || fail "Failed to download Miniconda." "Check your internet connection."
  bash "$installer" -b -p "$CONDA_DIR" \
    || fail "Failed to install Miniconda."
  rm -f "$installer"
  ok "Miniconda installed at $CONDA_DIR!"
}

# =============================================================================
#  [3/5] Create Conda environment with scientific dependencies (first run only)
# =============================================================================
setup_conda_env() {
  source "$CONDA_DIR/etc/profile.d/conda.sh"
  # Accept Anaconda Terms of Service (required since 2024 in non-interactive mode)
  conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main 2>/dev/null || true
  conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r 2>/dev/null || true
  if conda env list | grep -q "^$CONDA_ENV_NAME "; then
    ok "Conda environment '$CONDA_ENV_NAME' already exists."
    return
  fi
  step "Creating Conda environment with scientific dependencies..."
  warn "This step may take 5 to 15 minutes on the first run..."
  local req_file="$APP_DIR/apps/python-service/BioMolExplorer/requirements.yml"
  [ ! -f "$req_file" ] && fail "requirements.yml file not found: $req_file"
  conda env create -f "$req_file" -y \
    || fail "Failed to create Conda environment." "Check your internet connection and try again."
  ok "Environment '$CONDA_ENV_NAME' created!"
}

# =============================================================================
#  [3.5] Install Node.js via nvm if missing (no sudo)
# =============================================================================
install_node() {
  # Check if node >= 18 is already in PATH (system or nvm)
  if command -v node >/dev/null 2>&1; then
    local ver; ver=$(node --version | sed 's/v//' | cut -d. -f1)
    [ "$ver" -ge 18 ] && { ok "Node.js $(node --version) found."; return; }
  fi

  step "Installing Node.js 20 via nvm..."
  export NVM_DIR="$HOME/.biomolexplorer/nvm"
  mkdir -p "$NVM_DIR"
  local nvm_install="/tmp/nvm-install-$$.sh"
  _download "https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh" "$nvm_install" \
    || fail "Failed to download nvm." "Check your internet connection."
  PROFILE=/dev/null bash "$nvm_install" >/dev/null 2>&1
  rm -f "$nvm_install"
  [ -s "$NVM_DIR/nvm.sh" ] || fail "Failed to install nvm." "Check your internet connection."
  source "$NVM_DIR/nvm.sh"
  nvm install 20 \
    || fail "Failed to install Node.js 20." "Check your internet connection."
  ok "Node.js $(node --version) installed via nvm!"
}

# =============================================================================
#  [4/5] Install JavaScript dependencies (first run only)
# =============================================================================
setup_npm() {
  if [ -d "$APP_DIR/node_modules" ]; then
    ok "JavaScript dependencies already installed."
    return
  fi
  command -v node >/dev/null 2>&1 \
    || fail "Node.js not found." "Reinstall BioMolExplorer via .deb to fix dependencies."
  local node_ver
  node_ver=$(node --version | sed 's/v//' | cut -d. -f1)
  [ "$node_ver" -lt 18 ] && fail "Node.js $node_ver detected. Node.js 18+ is required." \
    "Reinstall BioMolExplorer via .deb to update Node.js."
  local npm_bin
  npm_bin=$(command -v npm 2>/dev/null) \
    || fail "npm not found." "Reinstall BioMolExplorer via .deb to fix dependencies."
  step "Installing JavaScript dependencies..."
  (cd "$APP_DIR" && "$npm_bin" install) \
    || fail "Failed to install JavaScript dependencies." "Check your internet connection."
  ok "JavaScript dependencies installed!"
}

# =============================================================================
#  Integrate icon into user's system (first run only)
# =============================================================================
integrate_desktop() {
  local icon_src="$APP_DIR/apps/desktop/wrapper/assets/icons/256x256.png"
  local icon_dst="$HOME/.local/share/icons/hicolor/256x256/apps/biomolexplorer.png"

  [ -f "$icon_dst" ] && return
  [ ! -f "$icon_src" ] && return

  step "Integrating icon into the system..."
  mkdir -p "$(dirname "$icon_dst")"
  cp "$icon_src" "$icon_dst"
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
  ok "Icon integrated!"
}

# =============================================================================
#  [5/5] Start the 3 native services
# =============================================================================
start_services() {
  local CONDA_ENV_DIR="$CONDA_DIR/envs/$CONDA_ENV_NAME"
  local PYTHON_BIN="$CONDA_ENV_DIR/bin/python"

  [ -f "$PYTHON_BIN" ] || fail "Python not found at $PYTHON_BIN." \
    "The conda environment may not have been created. Delete ~/.biomolexplorer and reopen the app."

  # Manually activate conda environment (without relying on conda activate in subshell)
  export CONDA_PREFIX="$CONDA_ENV_DIR"
  export CONDA_DEFAULT_ENV="$CONDA_ENV_NAME"
  export PATH="$CONDA_ENV_DIR/bin:$PATH"
  export LD_LIBRARY_PATH="$CONDA_ENV_DIR/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

  local NPM_BIN
  NPM_BIN=$(command -v npm 2>/dev/null) || fail "npm not found in PATH."

  local LOG_DIR="$INSTALL_DIR/logs"
  mkdir -p "$LOG_DIR"

  step "Freeing ports 3000, 3001 and 5000..."
  fuser -k -9 3000/tcp 3001/tcp 5000/tcp >/dev/null 2>&1 || true

  step "Starting Flask (port 5000)..."
  (cd "$APP_DIR/apps/python-service" && "$PYTHON_BIN" app.py) > "$LOG_DIR/flask.log" 2>&1 &
  local FLASK_PID=$!

  step "Starting Node.js API (port 3001)..."
  (cd "$APP_DIR" && "$NPM_BIN" run start --workspace=api) > "$LOG_DIR/api.log" 2>&1 &

  step "Waiting for backends to be ready..."
  local count=0
  while [ $count -lt 90 ]; do
    sleep 1
    count=$((count + 1))

    # Check if Flask died with an error
    if ! kill -0 "$FLASK_PID" 2>/dev/null; then
      warn "Flask exited unexpectedly. Last log lines:"
      tail -20 "$LOG_DIR/flask.log" | while IFS= read -r line; do printf '  [flask] %s\n' "$line"; done
      fail "Flask failed to start." "Check the log at $LOG_DIR/flask.log"
    fi

    FLASK_OK=$(_http_ok http://127.0.0.1:5000/pdb_files && echo 1 || echo 0)
    NODE_OK=$(_http_ok http://127.0.0.1:3001/api/files/list/PDB && echo 1 || echo 0)
    if [ "$FLASK_OK" = "1" ] && [ "$NODE_OK" = "1" ]; then
      ok "Backends ready!"
      break
    fi
  done

  step "Starting Next.js (port 3000)..."
  (cd "$APP_DIR" && "$NPM_BIN" run dev --workspace=web) &

  count=0
  while true; do
    sleep 2
    count=$((count + 2))
    _http_ok "http://localhost:$PORT" && break
    [ "$count" -ge 120 ] && fail "Frontend took too long to respond." \
      "Check the terminal logs for more details."
    printf '  ... Next.js starting %ds / 120s\n' "$count"
  done

  printf '  [OK] BioMolExplorer ready!\n'
  wait
}

# =============================================================================
#  MAIN
# =============================================================================
banner
printf '  [INFO] Mode: Native (Conda + Node.js)\n\n'

printf '  [1/5] Checking installation...\n'
extract_source
printf '\n'

printf '  [2/5] Checking Miniconda...\n'
install_miniconda
printf '\n'

printf '  [3/5] Setting up scientific environment...\n'
setup_conda_env
printf '\n'

printf '  [3.5/5] Checking Node.js...\n'
install_node
printf '\n'

printf '  [4/5] Installing JavaScript dependencies...\n'
setup_npm
printf '\n'

printf '  [5/5] Starting services...\n'
integrate_desktop
start_services
