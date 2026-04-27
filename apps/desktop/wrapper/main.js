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
    <body style="background-color:%23121212; color:white; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center;">
      <h1 style="font-size: 40px; margin-bottom: 10px;">🧬 BioMolExplorer</h1>
      <div style="width: 50px; height: 50px; border: 5px solid %23333; border-top: 5px solid %233498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p style="color:%23888; margin-top: 20px;">Iniciando Docker e Servidores...<br>Isso pode levar um minuto na primeira execução.</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </body>`);

  // Ajuste do basePath: process.cwd() é muito mais seguro que __dirname no Windows
  let basePath = process.env.PORTABLE_EXECUTABLE_DIR;
  if (!basePath) {
    basePath = process.cwd(); 
  }
  
  const batPath = path.join(basePath, 'init.bat');

  // Devolvi o shell: true, ele é vital para o CMD abrir no Windows
  const batProcess = spawn('cmd.exe', ['/k', `"${batPath}"`], {
    windowsHide: false,
    cwd: basePath,
    shell: true
  });

  // CAPTURADOR DE ERROS FATAIS DO NODE (Se o CMD nem abrir, cai aqui)
  batProcess.on('error', (err) => {
    win.loadURL(`data:text/html;charset=utf-8,
      <body style="background-color:%23500; color:white; padding: 40px; font-family:sans-serif;">
        <h2>❌ Erro Interno (Node.js)</h2>
        <p>O aplicativo não conseguiu sequer iniciar o CMD.</p>
        <p><b>Erro:</b> ${err.message}</p>
        <p><b>Tentou abrir:</b> ${batPath}</p>
        <p><b>Na pasta:</b> ${basePath}</p>
      </body>`);
  });

  batProcess.stdout.on('data', (data) => {
    const log = data.toString();
    console.log('LOG:', log);

    if (log.includes('BioMolExplorer pronto')) {
      win.loadURL('http://localhost:3000');
    }
  });

  batProcess.stderr.on('data', (data) => {
    console.log('ERRO CMD:', data.toString());
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  exec('docker rm -f biomolexplorer_app', () => {
    app.quit();
  });
});