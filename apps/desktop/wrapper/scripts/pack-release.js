// =============================================================================
//  pack-release.js
//  Monta o .zip final de distribuicao do BioMolExplorer.
//
//  Pre-requisitos (gerados antes deste script):
//    - dist/BioMolExplorer.exe              (do electron-builder portable)
//    - ../BioMolExplorer-Launcher/init.bat
//    - ../BioMolExplorer-Launcher/init.sh
//    - ../BioMolExplorer-Launcher/biomolexplorer.tar
//
//  Saida: dist/BioMolExplorer-Launcher.zip
// =============================================================================

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const WRAPPER_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(WRAPPER_DIR, 'dist');
const LAUNCHER_DIR = path.resolve(WRAPPER_DIR, '..', 'BioMolExplorer-Launcher');

const EXE_PATH = path.join(DIST_DIR, 'BioMolExplorer.exe');
const DESKTOP_DIR = path.resolve(WRAPPER_DIR, '..');
const OUTPUT_ZIP = path.join(DESKTOP_DIR, 'BioMolExplorer-Launcher.zip');

// Pasta-raiz dentro do zip (para "Extrair aqui" produzir uma pasta organizada)
const ZIP_ROOT = 'BioMolExplorer-Launcher';

// Arquivos auxiliares: { caminho_origem, nome_no_zip }
const AUX_FILES = [
  { from: path.join(LAUNCHER_DIR, 'init.bat'),           name: 'init.bat' },
  { from: path.join(LAUNCHER_DIR, 'init.sh'),            name: 'init.sh' },
  { from: path.join(LAUNCHER_DIR, 'biomolexplorer.tar'), name: 'biomolexplorer.tar' },
];

function log(msg)  { console.log(`[pack-release] ${msg}`); }
function fail(msg) { console.error(`[pack-release] ERRO: ${msg}`); process.exit(1); }

// 1. Validar que o .exe foi gerado
log('Validando .exe gerado pelo electron-builder...');
if (!fs.existsSync(EXE_PATH)) {
  fail(`Nao encontrei: ${EXE_PATH}\n        O electron-builder rodou com sucesso? Verifique 'artifactName' no package.json.`);
}

// 2. Validar que os auxiliares existem na pasta do Launcher
log('Validando arquivos auxiliares...');
for (const f of AUX_FILES) {
  if (!fs.existsSync(f.from)) {
    fail(`Arquivo ausente: ${f.from}\n        Garanta que o biomolexplorer.tar foi gerado (Passo 1 do README).`);
  }
}
log('Todos os arquivos estao presentes.');

// 3. Remover zip antigo
if (fs.existsSync(OUTPUT_ZIP)) {
  fs.unlinkSync(OUTPUT_ZIP);
  log('Zip anterior removido.');
}

// 4. Compactar
log('Compactando release...');
const output = fs.createWriteStream(OUTPUT_ZIP);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1);
  log(`OK! Pacote gerado: ${OUTPUT_ZIP}`);
  log(`Tamanho final: ${sizeMB} MB`);
  log('Pronto para enviar ao cliente.');
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') console.warn('[pack-release] Aviso:', err.message);
  else fail(err.message);
});

archive.on('error', (err) => fail(err.message));

archive.pipe(output);

// .exe na raiz do zip
archive.file(EXE_PATH, { name: `${ZIP_ROOT}/BioMolExplorer.exe` });

// Auxiliares na raiz do zip
for (const f of AUX_FILES) {
  archive.file(f.from, { name: `${ZIP_ROOT}/${f.name}` });
}

archive.finalize();