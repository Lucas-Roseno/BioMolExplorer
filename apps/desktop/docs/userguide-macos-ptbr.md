# BioMolExplorer — Guia do Usuário (macOS)

> **Aviso:** O suporte a macOS está em andamento. O script de instalação suporta macOS, mas nenhuma build oficial foi validada ainda. Proceda com cautela e reporte qualquer problema encontrado.

## Requisitos

- macOS 11 (Big Sur) ou superior
- Conexão com a internet na primeira execução
- Pelo menos **10 GB** de espaço livre em disco (para o Miniconda e o ambiente científico)

---

## Instalação

1. Baixe o arquivo `BioMolExplorer.dmg`.
2. Dê duplo-clique no `.dmg` para montá-lo.
3. Arraste o ícone do **BioMolExplorer** para a pasta **Aplicativos**.
4. Ejete a imagem de disco.

---

## Executando o Aplicativo

1. Abra a pasta **Aplicativos** e localize o **BioMolExplorer**.
2. **Na primeira abertura**, o macOS pode bloquear o aplicativo por ser de um desenvolvedor não identificado. Para autorizar:
   - Clique com o botão direito (ou Control-clique) no ícone → **Abrir**.
   - Clique em **Abrir** no diálogo de confirmação.

   > Esta etapa é necessária apenas uma vez. Nas próximas vezes, o aplicativo pode ser aberto normalmente.

3. A partir da segunda abertura, abra o BioMolExplorer normalmente pela pasta Aplicativos ou via Spotlight (`Cmd + Espaço` → digite "BioMolExplorer").

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

1. Arraste o **BioMolExplorer** da pasta Aplicativos para a Lixeira.
2. Para também remover o ambiente científico instalado no seu diretório pessoal:

```bash
rm -rf ~/.biomolexplorer
```

---

## Solução de Problemas

**"BioMolExplorer não pode ser aberto por ser de um desenvolvedor não identificado"**
Clique com o botão direito no ícone e escolha **Abrir** em vez de dar duplo-clique. Isso ignora o Gatekeeper para aplicativos não confiáveis.

**O aplicativo abre, mas mostra uma tela em branco**
Aguarde alguns segundos — o backend pode ainda estar iniciando.

**A configuração da primeira execução falha no meio**
Verifique sua conexão com a internet e reabra o aplicativo. O processo de configuração é retomável.
