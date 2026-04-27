const { app, BrowserWindow } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');

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

  let basePath = process.env.PORTABLE_EXECUTABLE_DIR;
  if (!basePath) {
    basePath = process.cwd(); 
  }
  
  const batPath = path.join(basePath, 'init.bat');

  const batProcess = spawn('cmd.exe', ['/c', `"${batPath}"`], {
    windowsHide: true,
    cwd: basePath,
    shell: true
  });

  let serverCheckInterval = setInterval(() => {
    fetch('http://localhost:3000')
      .then(res => {
        if (res.ok) {
          clearInterval(serverCheckInterval);
          if (!win.getURL().includes('localhost:3000')) {
            console.log('Radar detectou o servidor online!');
            win.loadURL('http://localhost:3000');
          }
        }
      })
      .catch(() => {
      });
  }, 2000);

  batProcess.stdout.on('data', (data) => {
    const log = data.toString();
    if (log.includes('BioMolExplorer pronto')) {
      clearInterval(serverCheckInterval);
      if (!win.getURL().includes('localhost:3000')) {
        win.loadURL('http://localhost:3000');
      }
    }
  });

  batProcess.on('error', (err) => {
    win.loadURL(`data:text/html;charset=utf-8,
      <body style="background-color:%235b4382; color:white; padding: 40px; font-family:sans-serif; text-align:center;">
        <h2>Erro Interno</h2>
        <p>O aplicativo não conseguiu iniciar o motor do Docker.</p>
      </body>`);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  exec('docker rm -f biomolexplorer_app', () => {
    app.quit();
  });
});