# BioMolExplorer - Ambiente Desktop & Distribuição

Este diretório contém todas as instruções para gerar uma interface Desktop do BioMolExplorer distribuível para os usuários finais.

---

## Estrutura do Diretório

```text
desktop/
├── BioMolExplorer-Launcher/        # Arquivos auxiliares incluídos no .deb
│   ├── biomolexplorer-src.tar.gz   # Código-fonte compactado (gerado automaticamente)
│   └── init-native.sh              # Motor Nativo para Linux/macOS (Conda + Node.js)
│
└── wrapper/                        # Código-fonte do executável Electron
    ├── main.js                     # Lógica principal (splash screen + ponte para o init-native.sh)
    ├── package.json                # Dependências e configuração do electron-builder
    ├── assets/                     # Ícones (.png para Linux, .icns para Mac)
    ├── scripts/
    │   └── pack-source.js          # Gera o biomolexplorer-src.tar.gz
    └── dist/                       # Saída do electron-builder (.deb, .dmg)
```

---

## Status por Plataforma

| Plataforma | Modo | Script | Status |
|---|---|---|---|
| Linux | Nativo (Conda + Node.js) | `init-native.sh` | ✅ Implementado e funcionando |
| macOS | Nativo (Conda + Node.js) | `init-native.sh` | 🟡 Script pronto, não testado em Mac |

> O build ativo e distribuído atualmente é o **`linux-native`**.

---

## Modo de Distribuição Atual: Nativo (Conda + Node.js)

O modo atual é o **Nativo**, sem Docker. O launcher instala automaticamente o Miniconda, Node.js e o ambiente científico na máquina do usuário. O usuário só precisa instalar o `.deb` e abrir o aplicativo.

> O Miniconda, Node.js, RDKit, OpenBabel, Vina, PyMOL e Flask são instalados automaticamente na primeira execução. Nenhum pré-requisito adicional é necessário.

---

## Guia do Desenvolvedor: Gerar uma Nova Versão

### Build Completo (comando único)

Sincroniza a versão, gera o tarball e compila o `.deb` em um único comando:

```bash
cd apps/desktop/wrapper

# Linux (único modo ativo atualmente)
npm run build:linux-native

# macOS — script pronto, requer máquina Mac para buildar
# npm run build:mac-native
```

Internamente, `build:linux-native` executa:
1. `npm run sync-version` → sincroniza a versão com o `package.json` raiz
2. `node scripts/pack-source.js` → gera `BioMolExplorer-Launcher/biomolexplorer-src.tar.gz`
3. `electron-builder --linux deb` → compila o Electron e gera o `.deb` em `dist/`

---

### Saída dos Pacotes

```text
wrapper/dist/biomolexplorer_amd64.deb   ← único artefato gerado
```

O `.deb` já contém tudo que o usuário precisa:
- O executável Electron (interface gráfica)
- O `init-native.sh` (motor de inicialização)
- O `biomolexplorer-src.tar.gz` (código-fonte extraído na primeira execução)