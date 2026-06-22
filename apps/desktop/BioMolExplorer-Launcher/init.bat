@echo off
REM =============================================================================
REM  BioMolExplorer - Inicializador para Windows
REM  Uso: Clique com botao direito -> Executar como Administrador
REM =============================================================================
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title BioMolExplorer 2.0 - Inicializador

set IMAGE_TAR=biomolexplorer.tar
set IMAGE_NAME=biomolexplorer
set CONTAINER_NAME=biomolexplorer_app
set PORT=3000

REM Tempos limite (em segundos)
set DOCKER_TIMEOUT=180
set APP_TIMEOUT=240

cd /d "%~dp0"
set SCRIPT_DIR=%~dp0

cls
echo.
echo   +--------------------------------------------------+
echo   ^|   BioMolExplorer 2.0  --  Launcher              ^|
echo   ^|   Plataforma de Analise Molecular                ^|
echo   +--------------------------------------------------+
echo.

REM =============================================================================
REM  [1/4] Verificar Docker
REM =============================================================================
echo   [1/4] Verificando Docker...
docker --version >nul 2>&1
if %errorLevel% neq 0 goto :install_docker

docker info >nul 2>&1
if %errorLevel% equ 0 (
    echo   [OK] Docker encontrado e funcionando!
    goto :load_image
)

echo   [!!] Docker instalado mas nao esta rodando. Iniciando...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
goto :wait_docker_ready

:install_docker
echo.
echo   [!!] Docker nao encontrado. Instalando automaticamente...
echo   [!!] Necessaria conexao com a internet apenas nesta etapa.
echo.

winget --version >nul 2>&1
if %errorLevel% neq 0 goto :docker_download_direto

echo   [!!] Instalando Docker Desktop via winget...
winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
if %errorLevel% neq 0 goto :docker_download_direto
echo   [OK] Docker Desktop instalado!
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
goto :wait_docker_ready

:docker_download_direto
echo   [!!] Baixando Docker Desktop - instalador oficial...
set DOCKER_INSTALLER=%TEMP%\DockerDesktopInstaller.exe
curl -L "https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe" -o "%DOCKER_INSTALLER%"
if not exist "%DOCKER_INSTALLER%" goto :docker_manual_install

echo   [!!] Executando instalador...
"%DOCKER_INSTALLER%" install --quiet --accept-license
del "%DOCKER_INSTALLER%" >nul 2>&1
echo   [OK] Docker Desktop instalado!
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
goto :wait_docker_ready

:docker_manual_install
echo.
echo   [FAIL] Nao foi possivel instalar o Docker automaticamente.
echo   [!!]   Acesse: https://www.docker.com/products/docker-desktop/
echo   [!!]   Instale manualmente e execute este arquivo novamente.
echo.
start "" "https://www.docker.com/products/docker-desktop/"
pause
exit /b 1

REM =============================================================================
REM  Aguarda Docker ficar pronto ate DOCKER_TIMEOUT segundos
REM =============================================================================
:wait_docker_ready
echo   [!!] Aguardando Docker Desktop ficar pronto (max %DOCKER_TIMEOUT%s)...
echo   [!!] Na primeira execucao, isso pode demorar (WSL2, VM, engine)...
set DCOUNT=0

:wait_docker_loop
set /a DCOUNT+=5
timeout /t 5 /nobreak >nul

docker info >nul 2>&1
if %errorLevel% equ 0 goto :docker_pronto

if %DCOUNT% geq %DOCKER_TIMEOUT% goto :docker_timeout
echo   ... Docker carregando !DCOUNT!s / %DOCKER_TIMEOUT%s
goto :wait_docker_loop

:docker_timeout
echo.
echo   [FAIL] Docker nao ficou pronto em %DOCKER_TIMEOUT% segundos.
echo   [!!]   Abra o Docker Desktop manualmente, espere o icone ficar verde
echo   [!!]   na bandeja do sistema, e execute este arquivo novamente.
pause
exit /b 1

:docker_pronto
echo   [OK] Docker esta pronto!

REM =============================================================================
REM  [2/4] Carregar imagem
REM =============================================================================
:load_image
echo.
echo   [2/4] Verificando imagem do aplicativo...
set TAR_PATH=%SCRIPT_DIR%%IMAGE_TAR%
if exist "%TAR_PATH%" goto :check_image_loaded

echo   [FAIL] Arquivo '%IMAGE_TAR%' nao encontrado na pasta.
echo   [!!]   Verifique se o arquivo foi incluido no pacote.
pause
exit /b 1

:check_image_loaded
docker image inspect %IMAGE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
    echo   [OK] Imagem ja carregada. Pulando importacao.
    goto :start_container
)

echo   [!!] Carregando imagem - pode levar 1 a 3 minutos...
docker load -i "%TAR_PATH%"
if %errorLevel% neq 0 (
    echo   [FAIL] Falha ao carregar a imagem.
    pause
    exit /b 1
)
echo   [OK] Imagem carregada!

REM =============================================================================
REM  [3/4] Iniciar container
REM =============================================================================
:start_container
echo.
echo   [3/4] Iniciando o BioMolExplorer...
docker rm -f %CONTAINER_NAME% >nul 2>&1

docker run -d ^
    --name %CONTAINER_NAME% ^
    -p 3000:3000 ^
    -p 3001:3001 ^
    -p 5000:5000 ^
    -e HOSTNAME="0.0.0.0" ^
    --restart unless-stopped ^
    %IMAGE_NAME%

if %errorLevel% neq 0 (
    echo   [FAIL] Falha ao iniciar o container.
    pause
    exit /b 1
)
echo   [OK] Container iniciado!

REM =============================================================================
REM  [4/4] Aguardar app responder
REM =============================================================================
echo.
echo   [4/4] Aguardando o aplicativo ficar pronto (max %APP_TIMEOUT%s)...
echo   [!!]  O primeiro inicio pode demorar - aguarde...
set COUNT=0

:wait_loop
set /a COUNT+=3
timeout /t 3 /nobreak >nul

for /f "tokens=*" %%S in ('docker inspect --format "{{.State.Status}}" %CONTAINER_NAME%') do set CSTATUS=%%S
if "!CSTATUS!"=="exited" goto :container_crashed
if "!CSTATUS!"=="dead"   goto :container_crashed

curl -s --max-time 2 "http://localhost:%PORT%" >nul 2>&1
if %errorLevel% equ 0 goto :app_ready

if %COUNT% geq %APP_TIMEOUT% goto :timeout_atingido
echo   ... !COUNT!s / %APP_TIMEOUT%s
goto :wait_loop

:container_crashed
echo.
echo   [FAIL] O container encerrou inesperadamente.
echo   [!!]   Ultimos logs:
echo.
docker logs --tail 30 %CONTAINER_NAME%
echo.
echo   Dica: Converta o init.sh para LF e rebuilde a imagem Docker.
echo.
pause
exit /b 1

:timeout_atingido
echo.
echo   [!!] Tempo limite atingido. Exibindo logs:
docker logs --tail 20 %CONTAINER_NAME%
echo.
echo   [FAIL] Servidor demorou demais para responder.
exit /b 1

:app_ready
echo   [OK] BioMolExplorer pronto!
REM -- O Electron vai ver a linha acima e assumir o controle --