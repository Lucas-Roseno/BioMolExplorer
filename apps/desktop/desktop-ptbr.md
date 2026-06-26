# BioMolExplorer - Ambiente Desktop & Distribuição

Este diretório contém todas as instruções para gerar uma interface Desktop do BioMolExplorer distribuível para os usuários finais.

---

## Estrutura do Diretório

```text
desktop/
├── BioMolExplorer-Launcher/        # Arquivos auxiliares incluídos na release
│   ├── biomolexplorer-src.tar.gz   # Código-fonte compactado (gerado automaticamente)
│   └── init-native.sh              # Motor Nativo para Linux/macOS (Conda + Node.js)
│
└── wrapper/                        # Código-fonte do executável Electron
    ├── main.js                     # Lógica principal (splash screen + ponte para o init-native.sh)
    ├── package.json                # Dependências e configuração do electron-builder
    ├── assets/                     # Ícones (.png para Linux, .icns para Mac)
    ├── scripts/
    │   ├── pack-source.js          # Gera o biomolexplorer-src.tar.gz
    │   └── pack-release.js         # Monta o .zip final de distribuição
    └── dist/                       # Saída do electron-builder (AppImage, .dmg)
```

O `.zip` final de distribuição é gerado na raiz de `desktop/`, fora de `wrapper/`.

---

## Status por Plataforma

| Plataforma | Modo | Script | Status |
|---|---|---|---|
| Linux | Nativo (Conda + Node.js) | `init-native.sh` | ✅ Implementado e funcionando |
| macOS | Nativo (Conda + Node.js) | `init-native.sh` | 🟡 Script pronto, não testado em Mac |

> O build ativo e distribuído atualmente é o **`linux-native`**.

---

## Modo de Distribuição Atual: Nativo (Conda + Node.js)

O modo atual é o **Nativo**, sem Docker. O launcher instala automaticamente o Miniconda e o ambiente científico na máquina do usuário. O usuário só precisa clicar no executável.

> **Pré-requisito do usuário final:** Node.js 18+ instalado (`node --version` deve retornar 18+).
> O Miniconda, RDKit, OpenBabel, Vina, PyMOL e Flask são instalados automaticamente na primeira execução.

---

## Guia do Desenvolvedor: Gerar uma Nova Versão

### Build Completo (comando único)

Gera o tarball, compila o Electron e monta o `.zip` final em um único comando:

```bash
cd apps/desktop/wrapper

# Linux (único modo ativo atualmente)
npm run build:linux-native

# macOS — script pronto, requer máquina Mac para buildar
# npm run build:mac-native
```

Internamente, `build:linux-native` executa:
1. `node scripts/pack-source.js` → gera `BioMolExplorer-Launcher/biomolexplorer-src.tar.gz`
2. `electron-builder --linux AppImage` → compila o Electron em `dist/BioMolExplorer.AppImage`
3. `node scripts/pack-release.js linux-native` → monta o `.zip` final

---

### Saída dos Pacotes

```text
desktop/BioMolExplorer-Launcher-linux-native.zip   ← único ativo atualmente
```

Conteúdo do `.zip` (modo nativo Linux):

```text
BioMolExplorer-Launcher-linux-native.zip
└── BioMolExplorer-Launcher/
    ├── BioMolExplorer.AppImage      ← executável — o usuário clica aqui
    ├── init-native.sh               ← motor de inicialização (chamado pelo AppImage)
    └── biomolexplorer-src.tar.gz    ← código-fonte extraído na primeira execução
```

---

## Instruções para o Usuário Final

### Linux — Modo Nativo

**Pré-requisito:** Node.js 18+ instalado. Para verificar:
```bash
node --version   # deve retornar v18.x.x ou superior
```
Caso não tenha, instale em [nodejs.org](https://nodejs.org/) ou via seu gerenciador de pacotes.

**Passos:**

1. Extraia o arquivo `.zip` em qualquer pasta do seu computador.
2. Abra a pasta `BioMolExplorer-Launcher/`.
3. Dê duplo-clique em **`BioMolExplorer.AppImage`** para iniciar o programa.

Se o sistema reclamar de permissão, abra o terminal na pasta e execute:
```bash
chmod +x BioMolExplorer.AppImage
./BioMolExplorer.AppImage
```

**Na primeira execução**, o launcher irá (automaticamente, sem ação do usuário):
- Instalar o Miniconda em `~/.biomolexplorer/miniconda/`
- Criar o ambiente Conda com RDKit, OpenBabel, Vina, PyMOL, Flask etc. *(5 a 15 minutos)*
- Instalar as dependências JavaScript

As execuções seguintes são rápidas — apenas inicia os serviços.

> **Ubuntu 22.04+ / Debian:** pode ser necessário instalar o `libfuse2` para executar AppImages:
> ```bash
> sudo apt install libfuse2
> ```

---

### macOS — Modo Nativo

> Ainda não testado. O script `init-native.sh` suporta macOS (bash + Conda), mas nenhuma build foi validada em Mac.

1. Extraia o arquivo `.zip`.
2. Abra a pasta `BioMolExplorer-Launcher/`.
3. Dê duplo-clique em **`BioMolExplorer.dmg`**.
4. Arraste o ícone do BioMolExplorer para a pasta **Aplicativos**.
5. Na primeira abertura: clique com o botão direito no ícone → **Abrir** para autorizar a execução.

