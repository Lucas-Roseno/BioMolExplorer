const { app, BrowserWindow } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');

// =============================================================================
//  Detecta o caminho base onde estao init.bat / init.sh / biomolexplorer.tar
//  Funciona tanto em modo dev (npm start) quanto empacotado (portable/AppImage/dmg)
// =============================================================================
function resolveBasePath() {
  // Windows portable: variavel de ambiente exclusiva do electron-builder
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  // Empacotado (AppImage, dmg, etc): pasta onde esta o executavel
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  // Modo dev (npm start): cwd
  return process.cwd();
}

// =============================================================================
//  Escolhe o script motor de acordo com o OS
// =============================================================================
function resolveLauncher(basePath) {
  if (process.platform === 'win32') {
    return {
      script: path.join(basePath, 'init.bat'),
      command: 'cmd.exe',
      args: (script) => ['/c', `"${script}"`],
      shell: true,
    };
  }
  // Linux e macOS
  return {
    script: path.join(basePath, 'init.sh'),
    command: 'bash',
    args: (script) => [script],
    shell: false,
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    autoHideMenuBar: true,
  });

  win.loadURL(`data:text/html;charset=utf-8,
    <body style="margin:0; padding:0; background-color:%23F4F6F8; display:flex; flex-direction:column; height:100vh; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      
      <div style="background-color:%235b4382; color:white; padding: 15px 30px; display:flex; align-items:center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="font-size:26px; font-weight:500; letter-spacing: 0.5px; display:flex; align-items:center;">
          <span style="font-size:32px; margin-right: 12px; margin-bottom: 4px;">⬡</span>BioMolExplorer
        </div>
      </div>

      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding: 20px;">
        <div style="background:white; padding: 50px 80px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display:flex; flex-direction:column; align-items:center;">
          
          <div style="width: 50px; height: 50px; border: 5px solid %23e0e0e0; border-top: 5px solid %235b4382; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 25px;"></div>
          
          <h2 style="color:%23333333; margin:0 0 10px 0; font-weight:500; font-size: 24px;">Iniciando o Sistema</h2>
          <p style="color:%23666666; margin:0; font-size:16px; max-width: 400px; line-height: 1.5;">Carregando o Docker e os serviços locais...<br>Isso pode levar alguns instantes na primeira execução.</p>
        </div>
      </div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </body>`);

  const basePath = resolveBasePath();
  const launcher = resolveLauncher(basePath);

  console.log(`[main] OS: ${process.platform} | basePath: ${basePath}`);
  console.log(`[main] Script motor: ${launcher.script}`);

  const launcherProcess = spawn(
    launcher.command,
    launcher.args(launcher.script),
    {
      windowsHide: true,
      cwd: basePath,
      shell: launcher.shell,
    }
  );

  let serverCheckInterval = setInterval(() => {
    fetch('http://localhost:3000')
      .then((res) => {
        if (res.ok) {
          clearInterval(serverCheckInterval);
          if (!win.getURL().includes('localhost:3000')) {
            console.log('[main] Servidor detectado via polling.');
            win.loadURL('http://localhost:3000');
          }
        }
      })
      .catch(() => { /* servidor ainda nao subiu */ });
  }, 2000);

  // Sinal primario: sai do .bat/.sh
  launcherProcess.stdout.on('data', (data) => {
    const log = data.toString();
    process.stdout.write(`[motor] ${log}`);

    if (log.includes('BioMolExplorer pronto')) {
      clearInterval(serverCheckInterval);
      if (!win.getURL().includes('localhost:3000')) {
        win.loadURL('http://localhost:3000');
      }
    }

    if (log.includes('[FAIL]')) {
      clearInterval(serverCheckInterval);
      showErrorScreen(win, log);
    }
  });

  launcherProcess.stderr.on('data', (data) => {
    process.stderr.write(`[motor:err] ${data.toString()}`);
  });

  launcherProcess.on('error', (err) => {
    clearInterval(serverCheckInterval);
    showErrorScreen(win, `Falha ao executar o script motor: ${err.message}`);
  });
}

function showErrorScreen(win, message) {
  // escapar caracteres pra inserir no data URL com seguranca
  const safe = String(message).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  win.loadURL(`data:text/html;charset=utf-8,
    <body style="background-color:%235b4382; color:white; padding: 40px; font-family:sans-serif;">
      <h2 style="margin-top:0;">Erro na Inicializacao</h2>
      <p>O BioMolExplorer nao conseguiu iniciar.</p>
      <pre style="background:rgba(0,0,0,0.3); padding:15px; border-radius:6px; white-space:pre-wrap;">${safe}</pre>
      <p style="margin-top:30px; opacity:0.8;">Verifique se o Docker esta instalado e funcionando, e tente novamente.</p>
    </body>`);
}

app.whenReady().then(createWindow);

// Cleanup do container ao fechar a janela (cross-platform)
app.on('window-all-closed', () => {
  const cleanupCmd = process.platform === 'win32'
    ? 'docker rm -f biomolexplorer_app'
    : 'docker rm -f biomolexplorer_app || sudo docker rm -f biomolexplorer_app';

  exec(cleanupCmd, () => {
    app.quit();
  });
});