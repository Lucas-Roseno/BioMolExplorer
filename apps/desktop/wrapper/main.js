const { app, BrowserWindow } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Resolves the base path where init-native.sh and biomolexplorer-src.tar.gz are located.
// Linux AppImage exposes APPIMAGE; macOS uses process.execPath; dev uses process.cwd().
function resolveBasePath() {
  if (process.env.APPIMAGE) {
    return path.dirname(process.env.APPIMAGE);
  }
  if (app.isPackaged && process.platform === 'darwin') {
    return path.resolve(path.dirname(process.execPath), '..', '..', '..');
  }
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return process.cwd();
}

function resolveLauncher(basePath) {
  return {
    script: path.join(basePath, 'init-native.sh'),
    command: 'bash',
    args: (script) => [script],
    shell: false,
    isNative: true,
  };
}

// Tracked globally for use in cleanup on close
let isNativeMode = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    autoHideMenuBar: true,
  });

  const basePath = resolveBasePath();
  const launcher = resolveLauncher(basePath);
  isNativeMode = launcher.isNative;

  const modeLabel = launcher.isNative
    ? 'Activating Conda environment and starting local services...'
    : 'Loading Docker and local services...';

  const firstRunNote = launcher.isNative
    ? 'On the first run, setup may take a few minutes.'
    : 'This may take a moment on the first run.';

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

          <h2 style="color:%23333333; margin:0 0 10px 0; font-weight:500; font-size: 24px;">Starting Up</h2>
          <p style="color:%23666666; margin:0; font-size:16px; max-width: 400px; line-height: 1.5;">${modeLabel}<br>${firstRunNote}</p>
        </div>
      </div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </body>`);

  console.log(`[main] OS: ${process.platform} | basePath: ${basePath}`);
  console.log(`[main] Mode: ${launcher.isNative ? 'Native (Conda)' : 'Docker'}`);
  console.log(`[main] Engine script: ${launcher.script}`);

  let motorLogs = '';
  let appReady = false;
  let failMessage = null;
  let failHint = null;

  if (!fs.existsSync(launcher.script)) {
    showErrorScreen(win,
      `Initialization script not found: ${launcher.script}`,
      launcher.isNative
        ? 'Make sure the AppImage was extracted alongside init-native.sh and biomolexplorer-src.tar.gz in the same folder.'
        : 'Make sure the AppImage was extracted alongside init.sh and biomolexplorer.tar in the same folder.',
      `resolved basePath: ${basePath}\nprocess.execPath: ${process.execPath}\nprocess.env.APPIMAGE: ${process.env.APPIMAGE || '(not set)'}`
    );
    return;
  }

  const launcherProcess = spawn(
    launcher.command,
    launcher.args(launcher.script),
    { cwd: basePath, shell: launcher.shell }
  );

  let serverCheckInterval = setInterval(() => {
    fetch('http://localhost:3000')
      .then((res) => {
        if (res.ok) {
          clearInterval(serverCheckInterval);
          appReady = true;
          if (!win.getURL().includes('localhost:3000')) {
            console.log('[main] Server detected via polling.');
            win.loadURL('http://localhost:3000');
          }
        }
      })
      .catch(() => { /* server not up yet */ });
  }, 2000);

  const handleOutput = (data, channel = 'stdout') => {
    const log = data.toString();
    motorLogs += log;
    process.stdout.write(`[engine:${channel}] ${log}`);

    if (log.includes('BioMolExplorer ready')) {
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
      'Failed to execute the initialization script.',
      err.message,
      motorLogs
    );
  });

  launcherProcess.on('close', (code) => {
    clearInterval(serverCheckInterval);
    if (appReady) return;

    const title = failMessage || `The script exited unexpectedly (code ${code}).`;
    const hint = failHint || 'Make sure Node.js 18+ is installed and try again.';
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
        <h2 style="color:%23c0392b; margin-top:0;">Startup Error</h2>
        <p style="color:%23333; font-size:16px; line-height:1.5;">${escape(title)}</p>

        <div style="background:%23fff5e6; border-left:4px solid %23f39c12; padding: 15px 20px; margin: 25px 0; border-radius: 4px;">
          <strong style="color:%23d35400;">What to do:</strong>
          <p style="margin: 8px 0 0 0; color:%23333; line-height:1.5;">${escape(hint)}</p>
        </div>

        <details style="margin-top: 30px;">
          <summary style="cursor:pointer; color:%23666; font-size:13px; user-select:none;">View technical details</summary>
          <pre style="background:%23272822; color:%23f8f8f2; padding:15px; border-radius:6px; font-size:12px; max-height:300px; overflow:auto; margin-top:10px;">${escape(logs) || '(no logs available)'}</pre>
        </details>

        <p style="margin-top: 30px; color:%23999; font-size:13px;">After resolving the issue, close this window and reopen BioMolExplorer.</p>
      </div>
    </body>`);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  exec('fuser -k 3000/tcp 3001/tcp 5000/tcp 2>/dev/null || true', () => {
    app.quit();
  });
});
