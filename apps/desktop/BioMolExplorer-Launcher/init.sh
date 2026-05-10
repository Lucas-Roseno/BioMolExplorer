#!/usr/bin/env bash
# =============================================================================
#  BioMolExplorer - Inicializador Linux / macOS
#  Uso: chmod +x init.sh && ./init.sh
# =============================================================================

set -e

IMAGE_TAR="biomolexplorer.tar"
IMAGE_NAME="biomolexplorer"
CONTAINER_NAME="biomolexplorer_app"
PORT=3000

# Tempos limite (em segundos)
DOCKER_TIMEOUT=180
APP_TIMEOUT=240

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detectar se precisa de sudo para docker
DOCKER_CMD="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER_CMD="sudo docker"
  fi
fi

# -------- Helpers de log --------
step() { printf '  [..] %s\n' "$1"; }
ok()   { printf '  [OK] %s\n' "$1"; }
warn() { printf '  [!!] %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; exit 1; }

banner() {
  printf '\n'
  printf '  +--------------------------------------------------+\n'
  printf '  |        BioMolExplorer 2.0  --  Launcher          |\n'
  printf '  |        Plataforma de Analise Molecular            |\n'
  printf '  +--------------------------------------------------+\n'
  printf '\n'
}

detect_os() {
  case "$(uname -s)" in
    Linux*)  OS="linux" ;;
    Darwin*) OS="mac"   ;;
    *)       fail "Sistema operacional nao suportado: $(uname -s)" ;;
  esac
}

# =============================================================================
#  [1/4] Verificar e instalar Docker
# =============================================================================
install_docker_linux() {
  warn "Docker nao encontrado. Instalando (requer internet apenas nesta etapa)..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf -y install dnf-plugins-core
    sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm docker
  else
    fail "Gerenciador de pacotes nao reconhecido. Instale manualmente: https://docs.docker.com/engine/install/"
  fi
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  ok "Docker instalado!"
  warn "Reiniciando script com permissoes do grupo docker..."
  exec sg docker "$0"
}

install_docker_mac() {
  fail "Docker Desktop nao encontrado. Instale: https://www.docker.com/products/docker-desktop/"
}

wait_docker_ready() {
  step "Aguardando Docker ficar pronto (max ${DOCKER_TIMEOUT}s)..."
  local count=0
  while true; do
    sleep 5
    count=$((count + 5))
    if $DOCKER_CMD info >/dev/null 2>&1; then
      ok "Docker esta pronto!"
      return
    fi
    if [ "$count" -ge "$DOCKER_TIMEOUT" ]; then
      fail "Docker nao ficou pronto em ${DOCKER_TIMEOUT}s. Inicie o Docker e tente novamente."
    fi
    printf '  ... Docker carregando %ds / %ds\n' "$count" "$DOCKER_TIMEOUT"
  done
}

check_and_install_docker() {
  step "Verificando Docker..."
  if ! command -v docker >/dev/null 2>&1; then
    if [ "$OS" = "linux" ]; then
      install_docker_linux
    else
      install_docker_mac
    fi
  fi
  if $DOCKER_CMD info >/dev/null 2>&1; then
    ok "Docker encontrado e funcionando!"
    return
  fi
  warn "Docker instalado mas nao esta rodando."
  if [ "$OS" = "mac" ]; then
    open -a Docker 2>/dev/null || true
  elif command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start docker 2>/dev/null || true
  fi
  wait_docker_ready
}

# =============================================================================
#  [2/4] Carregar imagem
# =============================================================================
load_image() {
  TAR_PATH="$SCRIPT_DIR/$IMAGE_TAR"
  step "Verificando imagem do aplicativo..."
  if [ ! -f "$TAR_PATH" ]; then
    fail "Arquivo '$IMAGE_TAR' nao encontrado na pasta do inicializador."
  fi
  if $DOCKER_CMD image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    ok "Imagem ja carregada. Pulando importacao."
    return
  fi
  step "Carregando imagem (pode levar 1 a 3 minutos)..."
  $DOCKER_CMD load -i "$TAR_PATH" || fail "Falha ao carregar a imagem."
  ok "Imagem carregada!"
}

# =============================================================================
#  [3/4] Iniciar container
# =============================================================================
start_container() {
  step "Iniciando o BioMolExplorer..."
  if $DOCKER_CMD ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    $DOCKER_CMD rm -f "$CONTAINER_NAME" >/dev/null 2>&1
  fi
  $DOCKER_CMD run -d \
    --name "$CONTAINER_NAME" \
    -p 3000:3000 \
    -p 3001:3001 \
    -p 5000:5000 \
    -e HOSTNAME="0.0.0.0" \
    --restart unless-stopped \
    "$IMAGE_NAME" >/dev/null || fail "Falha ao iniciar o container."
  ok "Container iniciado!"
}

# =============================================================================
#  [4/4] Aguardar app responder
# =============================================================================
wait_for_app() {
  step "Aguardando o aplicativo ficar pronto (max ${APP_TIMEOUT}s)..."
  warn "O primeiro inicio pode demorar - aguarde..."
  local count=0
  while true; do
    sleep 3
    count=$((count + 3))

    local status
    status=$($DOCKER_CMD inspect --format='{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "gone")
    if [ "$status" = "exited" ] || [ "$status" = "dead" ] || [ "$status" = "gone" ]; then
      printf '\n  [FAIL] O container encerrou inesperadamente. Ultimos logs:\n'
      $DOCKER_CMD logs --tail 30 "$CONTAINER_NAME" 2>&1 || true
      exit 1
    fi

    if curl -s --max-time 2 "http://localhost:$PORT" >/dev/null 2>&1; then
      return
    fi

    if [ "$count" -ge "$APP_TIMEOUT" ]; then
      printf '\n  [!!] Tempo limite atingido. Logs do container:\n'
      $DOCKER_CMD logs --tail 20 "$CONTAINER_NAME" 2>&1 || true
      fail "Servidor demorou demais para responder."
    fi
    printf '  ... %ds / %ds\n' "$count" "$APP_TIMEOUT"
  done
}

# =============================================================================
#  MAIN
# =============================================================================
banner
detect_os

printf '  [1/4] Verificando Docker...\n'
check_and_install_docker
printf '\n'

printf '  [2/4] Carregando imagem...\n'
load_image
printf '\n'

printf '  [3/4] Iniciando container...\n'
start_container
printf '\n'

printf '  [4/4] Aguardando app...\n'
wait_for_app

# Sinal final que o Electron escuta para trocar a tela de splash:
printf '  [OK] BioMolExplorer pronto!\n'
exit 0