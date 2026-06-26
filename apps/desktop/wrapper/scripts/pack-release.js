// =============================================================================
//  pack-release.js
//  Monta o .zip final de distribuicao do BioMolExplorer.
//
//  Uso: node scripts/pack-release.js <linux-native|mac-native>
//
//  Saida: ../BioMolExplorer-Launcher-<plataforma>.zip
// =============================================================================

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PLATFORM = process.argv[2];
const VALID_PLATFORMS = ['linux-native', 'mac-native'];

if (!VALID_PLATFORMS.includes(PLATFORM)) {
  console.error(`[pack-release] ERRO: plataforma invalida ou ausente.`);
  console.error(`[pack-release]        Uso: node pack-release.js <${VALID_PLATFORMS.join('|')}>`);
  process.exit(1);
}

const WRAPPER_DIR = path.resolve(__dirname, '..');
const DESKTOP_DIR = path.resolve(WRAPPER_DIR, '..');
const DIST_DIR = path.join(WRAPPER_DIR, 'dist');
const LAUNCHER_DIR = path.join(DESKTOP_DIR, 'BioMolExplorer-Launcher');

const ZIP_ROOT = 'BioMolExplorer-Launcher';
const OUTPUT_ZIP = path.join(DESKTOP_DIR, `BioMolExplorer-Launcher-${PLATFORM}.zip`);

const isNative = PLATFORM.endsWith('-native');

// Configuracao por plataforma
const PLATFORM_CONFIG = {
  'linux-native': {
    executable: { from: path.join(DIST_DIR, 'BioMolExplorer.AppImage'), name: 'BioMolExplorer.AppImage', mode: 0o755 },
    aux: ['init-native.sh', 'biomolexplorer-src.tar.gz'],
    missingMsg: 'Garanta que o biomolexplorer-src.tar.gz foi gerado (node scripts/pack-source.js).',
  },
  'mac-native': {
    executable: { from: path.join(DIST_DIR, 'BioMolExplorer.dmg'), name: 'BioMolExplorer.dmg' },
    aux: ['init-native.sh', 'biomolexplorer-src.tar.gz'],
    missingMsg: 'Garanta que o biomolexplorer-src.tar.gz foi gerado (node scripts/pack-source.js).',
  },
};

const config = PLATFORM_CONFIG[PLATFORM];

function log(msg)  { console.log(`[pack-release:${PLATFORM}] ${msg}`); }
function fail(msg) { console.error(`[pack-release:${PLATFORM}] ERRO: ${msg}`); process.exit(1); }

// 1. Validar executavel
log('Validando executavel gerado pelo electron-builder...');
if (!fs.existsSync(config.executable.from)) {
  fail(`Nao encontrei: ${config.executable.from}\n        Verifique 'artifactName' no package.json e se o build foi concluido.`);
}

// 2. Validar auxiliares
log('Validando arquivos auxiliares...');
const auxFiles = config.aux.map((name) => ({
  from: path.join(LAUNCHER_DIR, name),
  name,
}));
for (const f of auxFiles) {
  if (!fs.existsSync(f.from)) {
    fail(`Arquivo ausente: ${f.from}\n        ${config.missingMsg}`);
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
  if (err.code === 'ENOENT') console.warn(`[pack-release:${PLATFORM}] Aviso:`, err.message);
  else fail(err.message);
});

archive.on('error', (err) => fail(err.message));

archive.pipe(output);

// Executavel principal (com permissao de execucao em Linux/Mac)
const execEntry = { name: `${ZIP_ROOT}/${config.executable.name}` };
if (config.executable.mode) execEntry.mode = config.executable.mode;
archive.file(config.executable.from, execEntry);

// Auxiliares
for (const f of auxFiles) {
  const entry = { name: `${ZIP_ROOT}/${f.name}` };
  if (f.name.endsWith('.sh')) entry.mode = 0o755;
  archive.file(f.from, entry);
}

archive.finalize();
