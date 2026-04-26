# 🧬 BioMolExplorer - Pacote de Distribuição

## Para o Desenvolvedor

### Passo 1 - Gerar o arquivo de imagem Docker

Depois do build normal do projeto, execute **uma vez**:

```bash
# 1. Buildar a imagem normalmente (se ainda não fez)
docker build -t biomolexplorer .

# 2. Exportar a imagem para um arquivo .tar
docker save -o apps/BioMolExplorer-Launcher/biomolexplorer.tar biomolexplorer
```

> O arquivo `biomolexplorer.tar` pode ter quase 1GB dependendo das dependências.
> Garanta que ele esteja na mesma pasta que os scripts de inicialização.
### Passo 2 - Montar o pacote final

A pasta que a ser entregue ao usuário final deve ter exatamente esta estrutura:

```
BioMolExplorer-Launcher/
├── init.sh              ← Linux / macOS
├── init.bat             ← Windows (duplo clique)
└── biomolexplorer.tar   ← Imagem Docker (gerada no Passo 1)
```

Comprima em `.zip` e estará pronto para distribuir.

---

## Para o Usuário Final

### Windows
1. Descompacte a pasta em qualquer lugar
2. Clique com o botão **direito** em `init.bat`
3. Selecione **"Executar como Administrador"**
4. O navegador abrirá automaticamente em `http://localhost:3000`

### macOS
1. Descompacte a pasta
2. Abra o **Terminal** (Cmd + Espaço → "Terminal")
3. Arraste o arquivo `init.sh` para o terminal e pressione ENTER
4. Na primeira execução, precisará de internet para instalar o Docker Desktop

### Linux
1. Descompacte a pasta
2. Abra o terminal na pasta
3. Execute:
   ```bash
   chmod +x init.sh
   ./init.sh
   ```