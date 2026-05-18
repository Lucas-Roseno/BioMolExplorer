# 🧬 BioMolExplorer - Ambiente Desktop & Distribuição

Este diretório contém todas as instruções necessárias para gerar um **Aplicativo Desktop** do BioMolExplorer instalável e distribuível para os usuários finais.

---

## 📂 Estrutura do Diretório

```text
desktop/
├── BioMolExplorer-Launcher/        # Arquivos auxiliares incluídos em toda release
│   ├── biomolexplorer.tar          # Imagem Docker exportada (gerada no Passo 1)
│   ├── init.bat                    # Motor de inicialização para Windows
│   └── init.sh                     # Motor de inicialização para Linux/macOS
│
└── wrapper/                        # Código-fonte do executável visual (Electron)
    ├── main.js                     # Lógica do Electron (splash + ponte com os scripts)
    ├── package.json                # Dependências e configuração do electron-builder
    ├── assets/                     # Ícones (.ico, .icns, .png)
    ├── scripts/
    │   └── pack-release.js         # Script que monta o .zip final por plataforma
    └── dist/                       # Saída intermediária do electron-builder
```

Após o build, o `.zip` final de distribuição é gerado **na raiz de `desktop/`**, fora da pasta `wrapper/`.

---

## ⚙️ Setup Inicial (apenas a primeira vez)

Antes da primeira build, instale as dependências do wrapper:

```bash
cd apps/desktop/wrapper
npm install --no-workspaces
```

Repita esse passo apenas se:
- Você clonar o repositório em uma nova máquina.
- Adicionar/atualizar dependências no `package.json`.

---

## 👨‍💻 Guia do Desenvolvedor: Gerar uma nova versão

Sempre que houver alterações no sistema (Frontend/Backend) e for preciso liberar uma nova versão, siga estes **2 passos**:

### Passo 1: Gerar a Imagem Docker

Vá até a raiz do projeto principal (`~/BioMolExplorer`):

```bash
cd ../../../
```

Gere a versão mais recente da imagem e exporte para a pasta do Launcher:

```bash
# 1. Build da imagem
docker build -t biomolexplorer .

# 2. Exporte para .tar
docker save -o apps/desktop/BioMolExplorer-Launcher/biomolexplorer.tar biomolexplorer
```

### Passo 2: Gerar o Pacote da Plataforma Desejada

```bash
cd apps/desktop/wrapper

# Para Windows
npm run build:win

# Para Linux
npm run build:linux

# Para macOS (precisa ser executado em um Mac)
npm run build:mac
```

Cada comando faz **tudo de uma vez**: compila o Electron, valida os auxiliares e produz o `.zip` final pronto para entrega.

O pacote final é gerado em:

```text
desktop/BioMolExplorer-Launcher-win.zip
desktop/BioMolExplorer-Launcher-linux.zip
desktop/BioMolExplorer-Launcher-mac.zip
```

Cada `.zip` contém uma pasta `BioMolExplorer-Launcher/` com a estrutura correta para "Extrair aqui":

```text
BioMolExplorer-Launcher-win.zip
└── BioMolExplorer-Launcher/
    ├── BioMolExplorer.exe
    ├── biomolexplorer.tar
    └── init.bat

BioMolExplorer-Launcher-linux.zip
└── BioMolExplorer-Launcher/
    ├── BioMolExplorer.AppImage
    ├── biomolexplorer.tar
    └── init.sh

BioMolExplorer-Launcher-mac.zip
└── BioMolExplorer-Launcher/
    ├── BioMolExplorer.dmg
    ├── biomolexplorer.tar
    └── init.sh
```

> ⚠️ **Pré-requisito:** o `biomolexplorer.tar` (Passo 1) precisa estar em `apps/desktop/BioMolExplorer-Launcher/` antes de rodar o build, senão o script falha com mensagem clara.

> ℹ️ **Sobre builds cross-platform:** `build:win` e `build:linux` rodam em qualquer SO. `build:mac` **só funciona em macOS** (limitação da Apple). Para Linux a partir de Windows, recomenda-se usar WSL2 para evitar problemas de permissões.

---

## 📖 Instruções para o Usuário Final

(Copie e envie ao cliente junto com o `.zip` correspondente ao SO dele.)

### 🪟 Windows

1. Extraia o `.zip` em seu computador (ex: Área de Trabalho).
2. Entre na pasta `BioMolExplorer-Launcher/`.
3. Dê duplo-clique em **`BioMolExplorer.exe`**.
4. Se o Windows pedir permissão de Administrador, clique em "Sim".
5. Aguarde a tela de carregamento: o Docker e os servidores serão iniciados em segundo plano e a aplicação abrirá em seguida.

> Na primeira execução, é necessária conexão com a internet caso o Docker ainda não esteja instalado.

---

### 🐧 Linux

1. Extraia o `.zip` em seu computador.
2. Entre na pasta `BioMolExplorer-Launcher/`.
3. Dê duplo-clique em **`BioMolExplorer.AppImage`**.

Se o sistema reclamar de permissão, abra o terminal na pasta extraída e rode:

```bash
chmod +x BioMolExplorer.AppImage
./BioMolExplorer.AppImage
```

> Em algumas distros (Ubuntu 22.04+), pode ser necessário instalar `libfuse2` para o AppImage funcionar:
> ```bash
> sudo apt install libfuse2
> ```

---

### 🍎 macOS

1. Extraia o `.zip`.
2. Abra **`BioMolExplorer.dmg`** com duplo-clique.
3. Arraste o ícone do BioMolExplorer para a pasta **Aplicativos**.
4. Abra o app pela primeira vez (pode ser necessário clicar com o botão direito → "Abrir" para autorizar, já que o app não é assinado).

> Na primeira execução, é necessária conexão com a internet caso o Docker Desktop ainda não esteja instalado.