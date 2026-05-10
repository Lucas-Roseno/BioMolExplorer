const { app, BrowserWindow } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');

// =============================================================================
//  Detecta o caminho base onde estao init.bat / init.sh / biomolexplorer.tar
//
//  IMPORTANTE: cada formato de empacotamento expoe o "diretorio do executavel"
//  de uma forma diferente:
//    - Windows portable -> PORTABLE_EXECUTABLE_DIR
//    - Linux AppImage   -> APPIMAGE (caminho do .AppImage)
//    - macOS .dmg/.app  -> process.execPath aponta para .../Contents/MacOS/
//    - Dev (npm start)  -> process.cwd()
// =============================================================================
function resolveBasePath() {
  // Windows portable
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }

  // Linux AppImage: variavel APPIMAGE = caminho do .AppImage em si
  if (process.env.APPIMAGE) {
    return path.dirname(process.env.APPIMAGE);
  }

  // macOS empacotado: subir do Contents/MacOS/ ate a pasta que contem o .app
  if (app.isPackaged && process.platform === 'darwin') {
    // process.execPath: .../BioMolExplorer.app/Contents/MacOS/BioMolExplorer
    return path.resolve(path.dirname(process.execPath), '..', '..', '..');
  }

  // Empacotado em geral (fallback)
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }

  // Modo dev
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

  // Acumulador de log completo do motor (para mostrar em caso de erro)
  let motorLogs = '';
  let appReady = false;
  let failMessage = null;
  let failHint = null;

  // Validacao prematura: se o script motor nao existe, falha cedo com mensagem util.
  const fs = require('fs');
  if (!fs.existsSync(launcher.script)) {
    showErrorScreen(win,
      `Script de inicializacao nao encontrado: ${launcher.script}`,
      'Verifique se o AppImage foi extraido junto com init.sh e biomolexplorer.tar na mesma pasta.',
      `basePath resolvido: ${basePath}\nprocess.execPath: ${process.execPath}\nprocess.env.APPIMAGE: ${process.env.APPIMAGE || '(nao definido)'}`
    );
    return;
  }

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
          appReady = true;
          if (!win.getURL().includes('localhost:3000')) {
            console.log('[main] Servidor detectado via polling.');
            win.loadURL('http://localhost:3000');
          }
        }
      })
      .catch(() => { /* servidor ainda nao subiu */ });
  }, 2000);

  const handleOutput = (data, channel = 'stdout') => {
    const log = data.toString();
    motorLogs += log;
    process.stdout.write(`[motor:${channel}] ${log}`);

    if (log.includes('BioMolExplorer pronto')) {
      clearInterval(serverCheckInterval);
      appReady = true;
      if (!win.getURL().includes('localhost:3000')) {
        win.loadURL('http://localhost:3000');
      }
    }

    const failMatch = log.match(/\[FAIL\]\s*(.+)/);
    if (failMatch) failMessage = failMatch[1].trim();

    const hintMatch = log.match(/\[HINT\]\s*(.+)/);
    if (hintMatch) failHint = hintMatch[1].trim();
  };

  launcherProcess.stdout.on('data', (data) => handleOutput(data, 'stdout'));
  launcherProcess.stderr.on('data', (data) => handleOutput(data, 'stderr'));

  launcherProcess.on('error', (err) => {
    clearInterval(serverCheckInterval);
    showErrorScreen(win,
      'Falha ao executar o script de inicializacao.',
      err.message,
      motorLogs
    );
  });

  launcherProcess.on('close', (code) => {
    clearInterval(serverCheckInterval);
    if (appReady) return;

    const title = failMessage || `O script encerrou inesperadamente (codigo ${code}).`;
    const hint = failHint || 'Tente novamente ou verifique se o Docker esta instalado e em execucao.';
    showErrorScreen(win, title, hint, motorLogs);
  });
}

function showErrorScreen(win, title, hint, logs) {
  const escape = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  win.loadURL(`data:text/html;charset=utf-8,
    <body style="margin:0; padding:0; background-color:%23F4F6F8; font-family:'Segoe UI', Roboto, sans-serif;">
      <div style="background-color:%235b4382; color:white; padding: 15px 30px; display:flex; align-items:center;">
        <div style="font-size:26px; font-weight:500; display:flex; align-items:center;">
          <span style="font-size:32px; margin-right: 12px;">⬡</span>BioMolExplorer
        </div>
      </div>
      <div style="padding: 40px; max-width: 800px; margin: 0 auto;">
        <h2 style="color:%23c0392b; margin-top:0;">Erro na Inicializacao</h2>
        <p style="color:%23333; font-size:16px; line-height:1.5;">${escape(title)}</p>

        <div style="background:%23fff5e6; border-left:4px solid %23f39c12; padding: 15px 20px; margin: 25px 0; border-radius: 4px;">
          <strong style="color:%23d35400;">O que fazer:</strong>
          <p style="margin: 8px 0 0 0; color:%23333; line-height:1.5;">${escape(hint)}</p>
        </div>

        <details style="margin-top: 30px;">
          <summary style="cursor:pointer; color:%23666; font-size:13px; user-select:none;">Ver detalhes tecnicos</summary>
          <pre style="background:%23272822; color:%23f8f8f2; padding:15px; border-radius:6px; font-size:12px; max-height:300px; overflow:auto; margin-top:10px;">${escape(logs) || '(sem logs disponiveis)'}</pre>
        </details>

        <p style="margin-top: 30px; color:%23999; font-size:13px;">Apos resolver o problema, feche esta janela e abra o BioMolExplorer novamente.</p>
      </div>
    </body>`);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  const cleanupCmd = process.platform === 'win32'
    ? 'docker rm -f biomolexplorer_app'
    : 'docker rm -f biomolexplorer_app || sudo docker rm -f biomolexplorer_app';

  exec(cleanupCmd, () => {
    app.quit();
  });
});