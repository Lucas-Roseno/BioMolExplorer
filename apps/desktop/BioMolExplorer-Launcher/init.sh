#!/usr/bin/env bash
# =============================================================================
#  BioMolExplorer - Inicializador Linux / macOS (modo motor)
#  Chamado pelo Electron. Usa pkexec (PolicyKit) para privilegios graficos.
# =============================================================================

IMAGE_TAR="biomolexplorer.tar"
IMAGE_NAME="biomolexplorer"
CONTAINER_NAME="biomolexplorer_app"
PORT=3000

DOCKER_TIMEOUT=180
APP_TIMEOUT=240

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HAS_TTY=false
[ -t 0 ] && HAS_TTY=true

# Detecta o comando docker (com ou sem sudo)
DOCKER_CMD="docker"
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  sudo -n docker info >/dev/null 2>&1 && DOCKER_CMD="sudo docker"
fi

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
#  Executa comando com privilegios (sudo no TTY, pkexec no Electron)
# =============================================================================
run_privileged() {
  local description="$1"
  local cmd="$2"

  step "$description"

  if [ "$HAS_TTY" = "true" ]; then
    sudo bash -c "$cmd"
    return $?
  fi

  if ! command -v pkexec >/dev/null 2>&1; then
    fail "pkexec nao encontrado." "Instale policykit-1: sudo apt-get install policykit-1"
  fi

  pkexec bash -c "$cmd"
  local rc=$?
  if [ $rc -eq 126 ] || [ $rc -eq 127 ]; then
    fail "Autorizacao cancelada pelo usuario." "Reabra o BioMolExplorer e autorize a operacao."
  fi
  return $rc
}

# =============================================================================
#  [1/4] Verificar e (se necessario) instalar/reparar Docker
#
#  Esta funcao e ROBUSTA a instalacoes parciais (ex: usuario cancelou popup
#  no meio do apt-get). Sempre executa: reparo de pacote + reinstall + start
#  + chmod no socket, tudo em um unico pkexec, para que uma autorizacao
#  resolva o estado mesmo que esteja corrompido de tentativas anteriores.
# =============================================================================
build_install_cmd() {
  local target_user="${USER:-$(whoami)}"

  if command -v apt-get >/dev/null 2>&1; then
    # Repara estado parcial, completa instalacao, configura servico
    cat <<EOF
set -e
# Repara qualquer pacote parcialmente instalado
dpkg --configure -a 2>/dev/null || true
apt-get install -f -y -qq 2>/dev/null || true
# Instala (idempotente: se ja estiver, so atualiza estado)
apt-get update -qq
apt-get install -y -qq --reinstall docker.io
# Configura e inicia
systemctl enable docker
systemctl start docker
usermod -aG docker '$target_user' 2>/dev/null || true
chmod 666 /var/run/docker.sock 2>/dev/null || true
EOF
  elif command -v dnf >/dev/null 2>&1; then
    cat <<EOF
set -e
dnf install -y docker
systemctl enable docker
systemctl start docker
usermod -aG docker '$target_user' 2>/dev/null || true
chmod 666 /var/run/docker.sock 2>/dev/null || true
EOF
  elif command -v pacman >/dev/null 2>&1; then
    cat <<EOF
set -e
pacman -Sy --noconfirm docker
systemctl enable docker
systemctl start docker
usermod -aG docker '$target_user' 2>/dev/null || true
chmod 666 /var/run/docker.sock 2>/dev/null || true
EOF
  else
    echo ""
  fi
}

install_or_repair_docker() {
  local install_cmd
  install_cmd=$(build_install_cmd)

  if [ -z "$install_cmd" ]; then
    fail "Gerenciador de pacotes nao reconhecido." "Instale o Docker manualmente: https://docs.docker.com/engine/install/"
  fi

  run_privileged "Instalar e configurar Docker" "$install_cmd" || fail "Falha ao instalar o Docker."
  ok "Docker instalado e configurado!"
  DOCKER_CMD="docker"
}

wait_docker_ready() {
  step "Aguardando Docker ficar pronto (max ${DOCKER_TIMEOUT}s)..."
  local count=0
  while true; do
    sleep 5
    count=$((count + 5))
    if $DOCKER_CMD info >/dev/null 2>&1; then
      ok "Docker esta pronto!"
      return 0
    fi
    [ "$count" -ge "$DOCKER_TIMEOUT" ] && fail "Docker nao ficou pronto em ${DOCKER_TIMEOUT}s." "Inicie o Docker manualmente e tente novamente."
    printf '  ... Docker carregando %ds / %ds\n' "$count" "$DOCKER_TIMEOUT"
  done
}

check_and_install_docker() {
  step "Verificando Docker..."

  # Caminho feliz: Docker instalado E funcionando
  if command -v docker >/dev/null 2>&1 && $DOCKER_CMD info >/dev/null 2>&1; then
    ok "Docker encontrado e funcionando!"
    return
  fi

  # Caso macOS: Docker Desktop
  if [ "$OS" = "mac" ]; then
    if ! command -v docker >/dev/null 2>&1; then
      fail "Docker Desktop nao encontrado." "Instale: https://www.docker.com/products/docker-desktop/"
    fi
    warn "Docker instalado mas nao esta rodando. Iniciando..."
    open -a Docker 2>/dev/null || true
    wait_docker_ready
    return
  fi

  # Linux:
  # - Docker ausente OU
  # - Docker presente mas servico nao roda (possivel install parcial) OU
  # - Docker presente mas usuario sem permissao
  # Em qualquer um desses casos, rodamos install_or_repair que e idempotente:
  # repara pacote (se necessario), reinstala (se necessario), inicia o servico
  # e libera permissao do socket. Tudo em UM pkexec.
  warn "Docker nao esta pronto. Solicitando permissao para instalar/reparar/iniciar..."
  install_or_repair_docker
  wait_docker_ready

  # Sanity check final
  if ! docker info >/dev/null 2>&1; then
    if sudo -n docker info >/dev/null 2>&1; then
      DOCKER_CMD="sudo docker"
    else
      fail "Docker rodando mas usuario sem permissao." "Adicione seu usuario ao grupo: sudo usermod -aG docker \$USER, depois faca logout e login."
    fi
  fi
}

# =============================================================================
#  [2/4] Carregar imagem
# =============================================================================
load_image() {
  TAR_PATH="$SCRIPT_DIR/$IMAGE_TAR"
  step "Verificando imagem do aplicativo..."
  [ ! -f "$TAR_PATH" ] && fail "Arquivo '$IMAGE_TAR' nao encontrado em $SCRIPT_DIR." "Verifique se o AppImage foi extraido junto com init.sh e biomolexplorer.tar."

  if $DOCKER_CMD image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    ok "Imagem ja carregada. Pulando importacao."
    return
  fi
  step "Carregando imagem (pode levar 1 a 3 minutos)..."
  $DOCKER_CMD load -i "$TAR_PATH" || fail "Falha ao carregar a imagem Docker." "Verifique se o arquivo .tar nao esta corrompido."
  ok "Imagem carregada!"
}

# =============================================================================
#  [3/4] Iniciar container
# =============================================================================
start_container() {
  step "Iniciando o BioMolExplorer..."
  $DOCKER_CMD ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$" && \
    $DOCKER_CMD rm -f "$CONTAINER_NAME" >/dev/null 2>&1

  $DOCKER_CMD run -d \
    --name "$CONTAINER_NAME" \
    -p 3000:3000 \
    -p 3001:3001 \
    -p 5000:5000 \
    -e HOSTNAME="0.0.0.0" \
    --restart unless-stopped \
    "$IMAGE_NAME" >/dev/null || fail "Falha ao iniciar o container Docker."

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

    curl -s --max-time 2 "http://localhost:$PORT" >/dev/null 2>&1 && return

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

[ "$HAS_TTY" = "false" ] && printf '  [INFO] Executando em modo nao-interativo (chamado pelo Electron).\n'

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

printf '  [OK] BioMolExplorer pronto!\n'
exit 0