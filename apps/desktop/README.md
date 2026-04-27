# 🧬 BioMolExplorer - Ambiente Desktop & Distribuição

Este diretório contém todas instruções necessária para transformar a plataforma web do BioMolExplorer em um **Aplicativo Desktop** instalável e distribuível para os usuários finais.

Uniu-se o **Docker** (para rodar os servidores e o banco de dados de forma isolada) com o **Electron** (para fornecer uma interface de janela nativa).

---

## 📂 Estrutura do Diretório

```text
desktop/
├── BioMolExplorer-Launcher/   # (A pasta que será entregue ao cliente)
│   ├── biomolexplorer.tar     # A imagem Docker exportada
│   ├── init.bat               # Motor de inicialização para Windows
│   └── init.sh                # Motor de inicialização para Mac/Linux
│
└── wrapper/                   # (O código-fonte do executável visual)
    ├── main.js                # Lógica do Electron (Loading e ponte com o .bat)
    ├── package.json           # Dependências do empacotador
    └── dist/                  # Onde o .exe gerado vai parar após o build
```

## 👨‍💻 Guia do Desenvolvedor: Como gerar uma nova versão

Sempre que fizer alterações no código do sistema (Frontend/Backend) e quiser liberar uma nova versão para o cliente, siga esses 3 passos:

### Passo 1: Gerar a Imagem Docker

No terminal, na raiz do projeto principal, gere a versão mais recente da imagem e exporte para a pasta do Launcher:

```text
# 1. Faça o build da imagem do projeto
docker build -t biomolexplorer .

# 2. Exporte a imagem para um arquivo .tar (Pode demorar alguns minutos e ter ~1GB)
docker save -o apps/desktop/BioMolExplorer-Launcher/biomolexplorer.tar biomolexplorer
```

### Passo 2: Gerar o Executável

No terminal, entre na pasta do wrapper e gere o .exe:

```text
# 1. Entre na pasta do wrapper
cd apps/desktop/wrapper

# 2. Instale as dependências (necessário apenas na primeira vez)
npm install 7zip-bin electron@32 electron-builder --save-dev --no-workspaces

# 3. Gere o executável (Clean Build)
npm run build:win
```

O arquivo gerado estará em `wrapper/dist/BioMolExplorer.exe`.

### Passo 3: Montar o Pacote Final (Release)

Para entregar ao usuário, a pasta final comprimida em .zip deve conter exatamente esta estrutura:

```text
BioMolExplorer-Launcher.zip/
├── BioMolExplorer.exe       ← (Copiado da pasta wrapper/dist)
├── biomolexplorer.tar       ← (Gerado no Passo 1)
├── init.bat                 ← (Script base do Windows)
└── init.sh                  ← (Script base do Linux/Mac)
```

⚠️ Atenção: O .exe e o init.bat devem obrigatoriamente estar na mesma pasta para que a integração funcione.

## 📖 Instruções para o Usuário Final

(Pode copiar as instruções abaixo e enviar para o cliente junto com o .zip)

### 🪟 Windows (Recomendado)
Extraia a pasta .zip em seu computador (Ex: Área de Trabalho).

Dê um duplo-clique no arquivo BioMolExplorer.exe.

Se o Windows pedir permissão de Administrador, clique em "Sim".

Aguarde a tela de carregamento. O Docker e os servidores serão iniciados silenciosamente em segundo plano e a aplicação abrirá em seguida.

---

### 🍎 macOS
Extraia a pasta .zip.

Abra o Terminal (Cmd + Espaço → digite "Terminal").

Arraste o arquivo init.sh para dentro do terminal e pressione ENTER.

Na primeira execução, será necessária conexão com a internet para instalar dependências.

---

### 🐧 Linux

Extraia a pasta .zip.

Abra o terminal dentro da pasta extraída.

Dê permissão de execução e rode o script:

```bash
chmod +x init.sh
./init.sh
```