## Instruções para o Usuário Final

### Linux — Modo Nativo

1. Baixe o arquivo `biomolexplorer_amd64.deb`.
2. Dê duplo-clique no arquivo para abrir no **App Center** e clique em **Instalar**.

   Ou via terminal:
   ```bash
   sudo dpkg -i biomolexplorer_amd64.deb
   ```

3. Abra o **BioMolExplorer** pelo menu de aplicativos ou pelo terminal:
   ```bash
   biomolexplorer
   ```

**Na primeira execução**, o launcher irá (automaticamente, sem ação do usuário):
- Instalar o Miniconda em `~/.biomolexplorer/miniconda/`
- Instalar o Node.js em `~/.biomolexplorer/nvm/`
- Criar o ambiente Conda com RDKit, OpenBabel, Vina, PyMOL, Flask etc. *(5 a 15 minutos)*
- Instalar as dependências JavaScript

As execuções seguintes são rápidas — apenas inicia os serviços.

---

### macOS — Modo Nativo

> Ainda não testado. O script `init-native.sh` suporta macOS (bash + Conda), mas nenhuma build foi validada em Mac.

1. Baixe o arquivo `BioMolExplorer.dmg`.
2. Abra o `.dmg` e arraste o ícone do BioMolExplorer para a pasta **Aplicativos**.
3. Na primeira abertura: clique com o botão direito no ícone → **Abrir** para autorizar a execução.