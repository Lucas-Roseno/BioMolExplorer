# =============================================================================
#  BioMolExplorer - Inicializador Linux / macOS
#  Uso: chmod +x init.sh && ./init.sh
# =============================================================================

set -e

IMAGE_TAR="biomolexplorer.tar"
IMAGE_NAME="biomolexplorer"
CONTAINER_NAME="biomolexplorer_app"
PORT=3000

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detectar se precisa de sudo para docker
DOCKER_CMD="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then
    DOCKER_CMD="sudo docker"
  fi
fi

step() { printf '[->] %s\n' "$1"; }
ok()   { printf '[OK] %s\n' "$1"; }
warn() { printf '[!!] %s\n' "$1"; }
fail() { printf '[ERRO] %s\n' "$1"; exit 1; }

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
  warn "Docker nao encontrado no macOS."
  printf '\n'
  printf '  Instale o Docker Desktop manualmente:\n'
  printf '  -> https://www.docker.com/products/docker-desktop/\n'
  printf '\n'
  printf '  Apos instalar, abra o Docker Desktop e execute este script novamente.\n'
  read -p "  Pressione ENTER para abrir o site e sair..." _
  open "https://www.docker.com/products/docker-desktop/" 2>/dev/null || true
  exit 0
}

check_and_install_docker() {
  step "Verificando Docker..."
  if command -v docker >/dev/null 2>&1; then
    if ! docker info >/dev/null 2>&1; then
      if sudo docker info >/dev/null 2>&1; then
        DOCKER_CMD="sudo docker"
        warn "Usando sudo para comandos Docker."
      else
        fail "Docker instalado mas nao esta rodando. Inicie o servico e tente novamente."
      fi
    fi
    ok "Docker encontrado e funcionando!"
    return
  fi
  if [ "$OS" = "linux" ]; then
    install_docker_linux
  else
    install_docker_mac
  fi
}

load_image() {
  TAR_PATH="$SCRIPT_DIR/$IMAGE_TAR"
  step "Verificando imagem do aplicativo..."
  if [ ! -f "$TAR_PATH" ]; then
    fail "Arquivo '$IMAGE_TAR' nao encontrado na pasta do inicializador."
  fi
  if $DOCKER_CMD image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    ok "Imagem ja carregada. Pulando importacao."
  else
    step "Carregando imagem (pode levar 1 a 3 minutos)..."
    $DOCKER_CMD load -i "$TAR_PATH"
    ok "Imagem carregada!"
  fi
}

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
    --restart unless-stopped \
    "$IMAGE_NAME" >/dev/null
  ok "Container iniciado!"
}

wait_for_app() {
  step "Aguardando o aplicativo ficar pronto (max 120s)..."
  warn "O primeiro inicio pode demorar mais - aguarde..."
  sleep 10
  COUNT=0
  while true; do
    sleep 3
    COUNT=$((COUNT + 3))
    STATUS=$($DOCKER_CMD inspect --format='{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "gone")
    if [ "$STATUS" != "running" ]; then
      printf '\n'
      printf '[ERRO] O container encerrou inesperadamente. Ultimos logs:\n'
      $DOCKER_CMD logs --tail 30 "$CONTAINER_NAME" 2>&1
      exit 1
    fi
    if curl -s --max-time 2 "http://localhost:$PORT" >/dev/null 2>&1; then
      printf '\n'
      ok "BioMolExplorer pronto!"
      return
    fi
    if [ "$COUNT" -ge 120 ]; then
      printf '\n'
      warn "Tempo limite atingido. Abrindo navegador mesmo assim..."
      return
    fi
    printf '  ... %ds / 120s\r' "$COUNT"
  done
}

open_browser() {
  URL="http://localhost:$PORT"
  step "Abrindo o navegador em $URL ..."
  sleep 1
  if [ "$OS" = "mac" ]; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  else
    warn "Abra manualmente: $URL"
  fi
}

cleanup() {
  printf '\n'
  warn "Encerrando BioMolExplorer..."
  $DOCKER_CMD stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  $DOCKER_CMD rm   "$CONTAINER_NAME" >/dev/null 2>&1 || true
  ok "BioMolExplorer encerrado. Ate logo!"
  exit 0
}
trap cleanup INT TERM

# MAIN
clear
banner
detect_os

printf '[1/4] Verificando Docker...\n'
check_and_install_docker
printf '\n'

printf '[2/4] Carregando imagem...\n'
load_image
printf '\n'

printf '[3/4] Iniciando container...\n'
start_container
printf '\n'

printf '[4/4] Aguardando app...\n'
wait_for_app
open_browser

printf '\n'
printf '  ----------------------------------------------------\n'
printf '  [OK] BioMolExplorer esta rodando!\n'
printf '  ----------------------------------------------------\n'
printf '  Acesse: http://localhost:%s\n' "$PORT"
printf '\n'
printf '  NAO feche esta janela enquanto usar o aplicativo.\n'
printf '  Pressione ENTER para encerrar.\n'
printf '  ----------------------------------------------------\n'
printf '\n'

read -r _

cleanup
