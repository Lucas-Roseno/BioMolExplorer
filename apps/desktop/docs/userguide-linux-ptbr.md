# BioMolExplorer — Guia do Usuário (Linux)

## Requisitos

- Ubuntu 20.04+ ou qualquer distribuição baseada em Debian (64-bit)
- Conexão com a internet na primeira execução
- Pelo menos **10 GB** de espaço livre em disco (para o Miniconda e o ambiente científico)

---

## Instalação

### Opção 1 — Instalador gráfico (recomendado)

1. Baixe o arquivo `biomolexplorer_amd64.deb`.
2. Dê duplo-clique no arquivo para abri-lo no **App Center** (ou **Instalar Software**).
3. Clique em **Instalar** e digite sua senha quando solicitado.

### Opção 2 — Terminal

```bash
sudo dpkg -i biomolexplorer_amd64.deb
```

Se houver dependências faltando, execute:

```bash
sudo apt-get install -f
```

---

## Executando o Aplicativo

Abra o **BioMolExplorer** pelo menu de aplicativos, ou pelo terminal:

```bash
biomolexplorer
```

---

## Primeira Execução

Na **primeira abertura**, o aplicativo realiza automaticamente as seguintes etapas de configuração (sem nenhuma ação do usuário):

| Etapa | Descrição | Tempo aproximado |
|-------|-----------|-----------------|
| 1 | Baixar e instalar o Miniconda em `~/.biomolexplorer/miniconda/` | 2–5 min |
| 2 | Instalar o Node.js via NVM em `~/.biomolexplorer/nvm/` | 1–2 min |
| 3 | Criar o ambiente Conda (RDKit, OpenBabel, Vina, PyMOL, Flask etc.) | 5–10 min |
| 4 | Instalar as dependências JavaScript | 1–2 min |

> **Tempo total da primeira execução: 5 a 15 minutos**, dependendo da sua conexão com a internet.

Após a configuração, a interface do BioMolExplorer abrirá automaticamente na janela do aplicativo.

As execuções seguintes são rápidas — o launcher apenas inicia os serviços já instalados.

---

## Desinstalação

```bash
sudo dpkg -r biomolexplorer
```

Para também remover o ambiente científico instalado no seu diretório pessoal:

```bash
rm -rf ~/.biomolexplorer
```

---

## Solução de Problemas

**O aplicativo abre, mas mostra uma tela em branco**
Aguarde alguns segundos — o backend pode ainda estar iniciando.

**A configuração da primeira execução falha no meio**
Verifique sua conexão com a internet e reabra o aplicativo. O processo de configuração é retomável.

**"dpkg: error" durante a instalação**
Execute `sudo apt-get install -f` para resolver dependências faltantes.
