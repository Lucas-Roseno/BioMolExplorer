// =============================================================================
//  pack-source.js
//  Gera biomolexplorer-src.tar.gz a partir da raiz do projeto,
//  excluindo arquivos desnecessários para distribuição.
//
//  Saída: apps/desktop/BioMolExplorer-Launcher/biomolexplorer-src.tar.gz
//
//  Uso: node scripts/pack-source.js
// =============================================================================

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WRAPPER_DIR = path.resolve(__dirname, '..');
const DESKTOP_DIR = path.resolve(WRAPPER_DIR, '..');
const PROJECT_ROOT = path.resolve(DESKTOP_DIR, '..', '..');
const LAUNCHER_DIR = path.join(DESKTOP_DIR, 'BioMolExplorer-Launcher');
const OUTPUT_TAR = path.join(LAUNCHER_DIR, 'biomolexplorer-src.tar.gz');

function log(msg)  { console.log(`[pack-source] ${msg}`); }
function fail(msg) { console.error(`[pack-source] ERRO: ${msg}`); process.exit(1); }

if (!fs.existsSync(path.join(PROJECT_ROOT, 'package.json'))) {
  fail(`Raiz do projeto não encontrada em: ${PROJECT_ROOT}`);
}

if (fs.existsSync(OUTPUT_TAR)) {
  fs.unlinkSync(OUTPUT_TAR);
  log('Tarball anterior removido.');
}

log(`Gerando tarball do projeto em: ${OUTPUT_TAR}`);
log('(Excluindo: .git, node_modules, uploads, logs, .next, dist, *.tar, *.zip, *.AppImage)');

const excludes = [
  '.git',
  'node_modules',
  'uploads',
  'logs',
  '.next',
  'dist',
  '*.tar',
  '*.tar.gz',
  '*.zip',
  '*.AppImage',
  '*.exe',
  '*.dmg',
].map((p) => `--exclude="${p}"`).join(' ');

const projectName = path.basename(PROJECT_ROOT);
const parentDir = path.dirname(PROJECT_ROOT);

try {
  execSync(
    `tar -czf "${OUTPUT_TAR}" ${excludes} -C "${parentDir}" "${projectName}"`,
    { stdio: 'inherit' }
  );
} catch (err) {
  fail(`Falha ao gerar o tarball: ${err.message}`);
}

const sizeMB = (fs.statSync(OUTPUT_TAR).size / 1024 / 1024).toFixed(1);
log(`OK! Tarball gerado: ${OUTPUT_TAR}`);
log(`Tamanho: ${sizeMB} MB`);
