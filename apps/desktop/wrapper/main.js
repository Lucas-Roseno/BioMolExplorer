const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const RELEASES_API_URL = 'https://api.github.com/repos/Lucas-Roseno/BioMolExplorer/releases/latest';
const RELEASES_PAGE_URL = 'https://github.com/Lucas-Roseno/BioMolExplorer/releases';

// Fake scheme used by the "Retry" button on the error screen. Never actually
// navigated to — intercepted and re-run in-process by the will-navigate handler
// set up in createWindow(), the same trick used there for opening external links.
const RETRY_URL = 'bmx-action:retry';

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

async function checkForUpdates(win, currentVersion) {
  try {
    const res = await fetch(RELEASES_API_URL, {
      headers: { 'User-Agent': 'BioMolExplorer', Accept: 'application/vnd.github+json' },
    });
    // 404 means the repo has no published release yet — treat like any other
    // "can't check right now" case rather than surfacing it to the user.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const latest = String(data.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+/.test(latest)) throw new Error(`Invalid version format: ${latest}`);
    const isOutdated = latest !== currentVersion;

    const text = isOutdated
      ? `v${currentVersion} · Update available: v${latest}`
      : `v${currentVersion} · Up to date`;
    const color = isOutdated ? '%23e67e22' : '%2327ae60';

    win.webContents.executeJavaScript(`
      var el = document.getElementById('version-badge');
      if (el) { el.textContent = ${JSON.stringify(text)}; el.style.color = '${color}'; }
    `).catch(() => {});

    if (isOutdated) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update Available',
        message: `BioMolExplorer v${latest} is available`,
        detail: `You are currently running v${currentVersion}.\nWould you like to go to the download page?`,
        buttons: ['Download Update', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        shell.openExternal(data.html_url || RELEASES_PAGE_URL);
      }
    }
  } catch {
    // Network unavailable or API error — just show the current version silently
    win.webContents.executeJavaScript(`
      var el = document.getElementById('version-badge');
      if (el) { el.textContent = 'v${currentVersion}'; }
    `).catch(() => {});
  }
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on('will-navigate', (event, url) => {
    // "Retry" button on the error screen: re-run the launcher in place instead of
    // actually navigating (there's nothing real to navigate to).
    if (url === RETRY_URL) {
      event.preventDefault();
      startLauncher(win);
      return;
    }
    // Links in our own data: pages (e.g. the error screen) should open in the user's
    // default browser instead of navigating this window. Programmatic loadURL() calls
    // from the main process (below) don't trigger this, only renderer-side link clicks.
    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  startLauncher(win);
}

// Runs (or re-runs, on "Retry") the full init-native.sh sequence: shows the loading
// screen, spawns the script, and either loads the app or falls back to the error
// screen. Pulled out of createWindow() so the Retry button can call it again on the
// same window without a full app restart.
function startLauncher(win) {
  const basePath = resolveBasePath();
  const launcher = resolveLauncher(basePath);
  isNativeMode = launcher.isNative;

  const currentVersion = app.getVersion();

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

          <p id="version-badge" style="margin-top: 24px; font-size: 12px; color: %23aaaaaa;">v${currentVersion} · Checking for updates...</p>
        </div>
      </div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </body>`);

  console.log(`[main] OS: ${process.platform} | basePath: ${basePath}`);
  console.log(`[main] Mode: ${launcher.isNative ? 'Native (Conda)' : 'Docker'}`);
  console.log(`[main] Engine script: ${launcher.script}`);
  console.log(`[main] Version: ${currentVersion}`);

  win.webContents.once('did-finish-load', () => {
    checkForUpdates(win, currentVersion);
  });

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

ipcMain.handle('biomol:select-workspace-parent', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Escolha onde salvar o workspace',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

function showErrorScreen(win, title, hint, logs) {
  const escape = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  // Turns bare domains/URLs in hint text (e.g. "rbvi.ucsf.edu/chimera/download.html")
  // into clickable links; opened in the default browser via the will-navigate handler
  // set up in createWindow(). TLD is restricted to a known allowlist (rather than any
  // 2+ letter suffix) so filenames like "dms.zip" in install instructions aren't
  // mistaken for a domain and linkified.
  const linkify = (text) => escape(text).replace(
    /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|io|dev)(?:\/[^\s()<]*)?)/gi,
    (match) => {
      const href = /^https?:\/\//i.test(match) ? match : `https://${match}`;
      return `<a href="${href}" style="color:%235b4382;">${match}</a>`;
    }
  );

  // "Required external tool(s) not found: Chimera DOCK6 DMS." (from init-native.sh's
  // check_external_tools) reads better as one tool per line.
  const toolsPrefix = 'Required external tool(s) not found:';
  let titleHtml;
  if (title.startsWith(toolsPrefix)) {
    const tools = title.slice(toolsPrefix.length).replace(/\.\s*$/, '').trim().split(/\s+/).filter(Boolean);
    titleHtml = [escape(toolsPrefix), ...tools.map((t) => `- ${escape(t)}`)].join('<br>');
  } else {
    titleHtml = escape(title);
  }

  // The matching hint is "Tool: instructions | Tool: instructions ... — see technical
  // details ..." (1 to 3 "|"-joined tools, depending on how many are missing); split
  // into one bullet per tool plus the trailing note on its own line. Tied to this exact
  // suffix (unique to check_external_tools' fail() call) rather than to the presence of
  // "|", so it also triggers correctly when only a single tool is missing.
  let hintHtml;
  const noteMatch = hint.match(/\s+—\s*(see technical details below for full instructions\.?)$/i);
  if (noteMatch) {
    const items = hint.slice(0, noteMatch.index).split('|').map((s) => s.trim()).filter(Boolean);
    const note = noteMatch[1].trim().replace(/^./, (c) => c.toUpperCase());
    hintHtml = [...items.map((i) => `- ${linkify(i)}`), '', escape(note)].join('<br>');
  } else {
    hintHtml = linkify(hint);
  }

  win.loadURL(`data:text/html;charset=utf-8,
    <body style="margin:0; padding:0; background-color:%23F4F6F8; font-family:'Segoe UI', Roboto, sans-serif;">
      <div style="background-color:%235b4382; color:white; padding: 15px 30px; display:flex; align-items:center;">
        <div style="font-size:26px; font-weight:500; display:flex; align-items:center;">
          <span style="font-size:32px; margin-right: 12px;">⬡</span>BioMolExplorer
        </div>
      </div>
      <div style="padding: 40px; max-width: 800px; margin: 0 auto;">
        <h2 style="color:%23c0392b; margin-top:0;">Startup Error</h2>
        <p style="color:%23333; font-size:16px; line-height:1.5;">${titleHtml}</p>

        <div style="background:%23fff5e6; border-left:4px solid %23f39c12; padding: 15px 20px; margin: 25px 0; border-radius: 4px;">
          <strong style="color:%23d35400;">What to do:</strong>
          <p style="margin: 8px 0 0 0; color:%23333; line-height:1.5;">${hintHtml}</p>
        </div>

        <details style="margin-top: 30px;">
          <summary style="cursor:pointer; color:%23666; font-size:13px; user-select:none;">View technical details</summary>
          <pre style="background:%23272822; color:%23f8f8f2; padding:15px; border-radius:6px; font-size:12px; max-height:300px; overflow:auto; margin-top:10px;">${escape(logs) || '(no logs available)'}</pre>
        </details>

        <div style="margin-top: 30px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <a href="${RETRY_URL}" style="background:%235b4382; color:white; text-decoration:none; padding:10px 24px; border-radius:6px; font-size:14px; font-weight:500;">Retry</a>
          <p style="margin:0; color:%23999; font-size:13px;">Fixed the issue above? Click Retry. Otherwise, close this window and reopen BioMolExplorer.</p>
        </div>
      </div>
    </body>`);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  exec('fuser -k 3000/tcp 3001/tcp 5000/tcp 2>/dev/null || true', () => {
    app.quit();
  });
});
