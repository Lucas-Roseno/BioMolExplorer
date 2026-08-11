# BioMolExplorer — Guia do Usuário (Linux)

## Requisitos

- Ubuntu 20.04+ ou qualquer distribuição baseada em Debian (64-bit)
- Conexão com a internet na primeira execução
- Pelo menos **10 GB** de espaço livre em disco (para o Miniconda e o ambiente científico)
- **UCSF Chimera** e **DOCK6** instalados previamente e disponíveis no `PATH` — são ferramentas de terceiros licenciadas e não podem ser empacotadas junto com o app. O aplicativo verifica os dois (além do DMS, que já vem empacotado) toda vez que é aberto e **não inicia** se algum estiver faltando:
  - **Chimera**: baixe o instalador `.bin` em [rbvi.ucsf.edu/chimera](https://www.rbvi.ucsf.edu/chimera/download.html), execute-o e garanta que o comando `chimera` fique disponível no `PATH`.
  - **DOCK6**: solicite/baixe em [dock.compbio.ucsf.edu](http://dock.compbio.ucsf.edu/), compile-o e depois adicione a pasta `bin/` ao `PATH`, defina a variável de ambiente `DOCK6_PATH` apontando para o diretório de instalação, ou instale-o em `~/progs/dock6/`.

---

## Instalação

### Opção 1 — Instalador gráfico (recomendado)

1. Baixe o arquivo `biomolexplorer_amd64.deb`.
2. Dê duplo-clique no arquivo para abri-lo no **App Center** (ou **Instalar Software**).
3. Clique em **Instalar** e digite sua senha quando solicitado.

### Opção 2 — Terminal

Instale com o `apt` (recomendado — resolve as dependências automaticamente):

```bash
sudo apt install ./biomolexplorer_amd64.deb
```

> Execute o comando na pasta onde você baixou o arquivo. O `./` antes do nome é obrigatório para o `apt` tratá-lo como um arquivo local.

Alternativamente, com o `dpkg`:

```bash
sudo dpkg -i biomolexplorer_amd64.deb
sudo apt-get install -f   # resolve dependências faltantes
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
| 1 | Verificar Chimera, DOCK6 e DMS — **interrompe aqui com instruções se algum estiver faltando** | instantâneo |
| 2 | Baixar e instalar o Miniconda em `~/.biomolexplorer/miniconda/` | 2–5 min |
| 3 | Instalar o Node.js via NVM em `~/.biomolexplorer/nvm/` | 1–2 min |
| 4 | Criar o ambiente Conda (RDKit, OpenBabel, Vina, PyMOL, Flask etc.) | 5–10 min |
| 5 | Instalar as dependências JavaScript | 1–2 min |

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

**"Required external tool(s) not found: Chimera, DOCK6" ao abrir o app**
O aplicativo verifica Chimera, DOCK6 e DMS antes de iniciar e recusa abrir se algum estiver faltando. Instale a(s) ferramenta(s) indicada(s) na tela de erro (veja os links em [Requisitos](#requisitos) acima) e reabra o BioMolExplorer.
