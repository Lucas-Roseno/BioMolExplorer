# BioMolExplorer
## Manual do Usuário
**Análise estrutural e descoberta de fármacos**

**Um guia prático, etapa por etapa**
Da obtenção da proteína-alvo à análise de similaridade, validação, triagem virtual e avaliação ADMET.

**Desenvolvedores**
Lucas Roseno Medeiros Araújo
Pedro Henrique Pires Dias

**Professor**
Michel Pires da Silva

**Edição 1.0 • Agosto de 2026**

---

## Guia de Instalação e Pré-requisitos

Para utilizar o **BioMolExplorer**, é necessário primeiro instalar suas duas ferramentas de apoio (UCSF Chimera e Dock6) e, em seguida, o próprio aplicativo. 

> 💡 **Dica para iniciantes:** Durante a instalação, usaremos o **Terminal** do Linux. Para abri-lo, pressione as teclas `Ctrl` + `Alt` + `T` juntas. 
> Para executar os comandos, basta copiar os textos dentro das caixas escuras (código), colar no seu terminal e apertar a tecla `Enter`. Quando o sistema pedir sua senha, digite-a e aperte `Enter` (é normal que a tela não mostre nenhum caractere enquanto você digita a senha).

Se preferir um guia visual, assista ao nosso [vídeo complementar de instalação clicando aqui](https://www.youtube.com/watch?v=9DSkGptjKgw).

---

### 1. Instalação do UCSF Chimera

O UCSF Chimera é utilizado pelo BioMolExplorer para processar as estruturas das moléculas e proteínas.

1. Faça o download do instalador do Chimera clicando neste [link oficial de downloads](https://www.rbvi.ucsf.edu/chimera/download.html) (escolha a versão para Linux que termina em `.bin`).
2. Após terminar o download, vá até a sua pasta de Downloads e renomeie o arquivo baixado para apenas **`chimera.bin`** (isso facilitará os próximos passos).
3. Abra o seu Terminal (`Ctrl` + `Alt` + `T`) e copie e cole o comando abaixo para entrar na pasta de Downloads:
   ```bash
   cd ~/Downloads
   ```
4. Agora, cole o comando abaixo e aperte `Enter` para dar permissão ao arquivo:
   ```bash
   chmod +x chimera.bin
   ```
5. Finalmente, cole o comando abaixo e aperte `Enter` para iniciar a instalação:
   ```bash
   sudo ./chimera.bin
   ```
6. O instalador fará algumas perguntas na tela de texto:
   - Toda vez que ele perguntar algo e parar, apenas pressione a tecla **Enter** para aceitar a opção padrão. 
   - **Nota Importante:** Quando ele perguntar onde criar o link simbólico ("*Install symbolic link...*"), apertar **Enter** é fundamental. Isso garante que o BioMolExplorer encontre o Chimera automaticamente depois.

---

### 2. Instalação do Dock6

O Dock6 é o "motor" que fará os cálculos pesados de encaixe molecular (Docking).

1. No seu terminal, cole o comando abaixo e aperte `Enter` para baixar algumas ferramentas básicas do sistema necessárias para a instalação (isso pode demorar alguns minutos):
   ```bash
   sudo apt update
   sudo apt install -y git build-essential zlib1g-dev flex bison gfortran yacc
   ```
2. O próximo comando criará uma pasta chamada "progs" no seu computador e fará o download do Dock6 direto do repositório oficial na internet:
   ```bash
   mkdir -p ~/progs
   cd ~/progs
   git clone https://github.com/docking-org/dock6.git
   ```
3. Agora, vamos preparar (compilar) o Dock6. Cole os comandos abaixo, um por vez, apertando `Enter` após cada um. O último comando (`make all`) vai gerar muito texto na tela e demorar alguns minutos. Apenas aguarde terminar:
   ```bash
   cd ~/progs/dock6/install
   chmod +x configure
   ./configure gnu
   make all
   ```
4. Por fim, precisamos avisar ao seu computador onde o Dock6 foi instalado. Copie e cole estas duas linhas de uma vez no terminal e aperte `Enter`:
   ```bash
   echo 'export PATH="$PATH:$HOME/progs/dock6/bin"' >> ~/.bashrc
   source ~/.bashrc
   ```

---

### 3. Instalação do BioMolExplorer

Com as ferramentas de apoio prontas, agora é hora de instalar o aplicativo principal!

Você já deve ter recebido o arquivo de instalação do BioMolExplorer (exemplo: `biomolexplorer_amd64.deb`).

**Método 1: Interface Gráfica (Mais simples)**
- Abra o seu gerenciador de arquivos e vá até a pasta onde está o arquivo `.deb`.
- Dê um clique duplo nele. O gerenciador de programas do sistema (como a "Loja" do Ubuntu) será aberto.
- Clique no botão **"Instalar"** e digite sua senha.

**Método 2: Pelo Terminal**
- Salve o arquivo `.deb` na sua pasta de Downloads e renomeie-o para **`biomolexplorer.deb`**.
- No terminal, digite os comandos:
  ```bash
  cd ~/Downloads
  sudo dpkg -i biomolexplorer.deb
  ```
  *(Se aparecer algum erro de dependência, cole e rode o comando `sudo apt-get install -f` logo em seguida).*

Pronto! Após a instalação, o **BioMolExplorer** estará disponível no menu de aplicativos do seu sistema, assim como qualquer outro programa.
---

## 1 Introdução

Bem-vindo ao **BioMolExplorer**.

Este manual apresenta, de forma clara e direta, as principais funcionalidades da plataforma. O guia acompanha o fluxo de uma pesquisa e foi elaborado para que usuários de diferentes áreas consigam utilizar as ferramentas de análise estrutural e descoberta de fármacos.

> **Visão geral**
> O fluxo recomendado começa com a obtenção da estrutura da proteína-alvo, passa pela coleta ou importação de moléculas e termina com análises computacionais de similaridade, validação, propriedades farmacocinéticas e docking.

## 2 Página Inicial (Home)

![Página inicial do BioMolExplorer](prints/home1.png)
*Figura 1: Página inicial do BioMolExplorer.*

A **Página Inicial** é o painel central da plataforma. Ela oferece uma visão geral das etapas sugeridas para conduzir a pesquisa.

*   **Menu Superior:** localizado no topo da página, contém os links de navegação para as principais seções: **Home**, **PDB**, **ChEMBL**, **ZINC** e **Analysis**.
*   **Fluxo de Trabalho Esperado (Expected End-to-End Discovery Workflow):** apresenta o processo recomendado para organizar a pesquisa.

### Fluxo de trabalho recomendado

1. Aquisição da estrutura da proteína-alvo no PDB.
2. Extração de moléculas bioativas no ChEMBL.
3. Uso de bibliotecas adicionais de compostos por meio do ZINC.
4. Análise de similaridade em rede.
5. Triagem virtual e perfilamento das moléculas por docking e ADMET.

---

## 3 PDB Loader: aquisição da proteína-alvo

![Tela do PDB Loader](prints/pdb.png)
*Figura 2: Tela do PDB Loader.*

A seção **PDB** é utilizada para baixar estruturas tridimensionais de proteínas. Essas estruturas servirão como os alvos da pesquisa.

### Descrição dos campos

*   **Target Name (Nome do Alvo):** informe o nome da proteína de interesse. Exemplo: *Acetylcholinesterase*.
*   **PDB EC Number:** código de classificação da enzima. O campo é opcional e pode ficar em branco quando a informação for desconhecida.
*   **Polymer Entity Type:** tipo de molécula-alvo. Na maioria dos casos, selecione **Protein**.
*   **Experimental Method:** método científico utilizado para determinar a estrutura. Uma opção comum é **X-Ray Diffraction** (difração de raios X).
*   **Max Resolution (Å):** define a resolução máxima aceita. Valores menores, normalmente entre 1,8 e 2,5 Å, indicam estruturas mais detalhadas.
*   **Must Have Ligand:** quando selecionado, restringe a busca a estruturas que já possuem uma molécula ligada. Isso pode ajudar a localizar o sítio de ligação no alvo.
*   **Botão “Download”:** inicia a busca e o download das estruturas no banco de dados.
*   **Painel Downloaded PDB Files:** exibe os arquivos baixados. Nele, é possível visualizar detalhes da estrutura, salvar o arquivo no computador ou removê-lo da lista.

---

## 4 ChEMBL Loader: busca de moléculas bioativas

![Tela do ChEMBL Loader](prints/chembl.png)
*Figura 3: Tela do ChEMBL Loader.*

A página **ChEMBL** permite buscar pequenas moléculas com potencial de interação com a proteína alvo selecionada na etapa anterior.

### Descrição dos campos

*   **Target Search (Target Name):** informe novamente o nome da proteína. A plataforma buscará moléculas cuja interação com esse alvo já esteja documentada.
*   **Target Parameters (Organism):** selecione o organismo-alvo do estudo. Para estudos em seres humanos, utilize **Homo sapiens**.
*   **Bioactivity (Bioatividade):**
    *   **Standard Type:** tipo de medida biológica. **Ki** e **IC50** são indicadores comuns da intensidade da interação da molécula com o alvo.
    *   **Max Value (nM):** maior valor aceito para essa medida. Valores menores, como 100 nM, costumam indicar moléculas mais potentes.
*   **Molecules (Natural Product):** selecione esta opção para restringir a pesquisa a produtos de origem natural.
*   **Similar Mols:**
    *   **Similarity (%):** busca moléculas com determinado nível de semelhança estrutural em relação a compostos conhecidos; por exemplo, 80%.
    *   **Max Weight:** limita o peso molecular. Um limite de até 500 favorece compostos com características frequentemente associadas a fármacos.
*   **Botão “Download”:** executa a busca no banco de dados e carrega os resultados no painel lateral.

---

## 5 ZINC Loader: inserção de coleções personalizadas

![Tela do ZINC Loader](prints/zinc.png)
*Figura 4: Tela do ZINC Loader.*

A seção **ZINC** é destinada ao envio de arquivos de moléculas para a plataforma, incluindo listas personalizadas e coleções provenientes de bancos de dados externos.

### Descrição dos campos

*   **URI File:** selecione, no computador, o arquivo que contém os dados das moléculas.
*   **Verbose Mode:** exibe mensagens técnicas detalhadas durante a leitura do arquivo. Essa opção é útil para acompanhar o processamento e identificar eventuais problemas.
*   **Botão “Download”:** confirma o envio do arquivo. As moléculas importadas são exibidas no painel à direita.

---

## 6 Analysis: simulações e avaliação

A área de **Analysis** reúne quatro ferramentas dedicadas ao processamento e à interpretação dos dados das moléculas em relação à proteína-alvo.

> **Ferramentas disponíveis**
> **Similarity Network** organiza compostos por semelhança estrutural; **Redocking** valida o método; **ADMET** avalia propriedades farmacocinéticas; e **Docking** estima como as moléculas se ligam à proteína-alvo.

### 6.1 Similarity Network Analysis

![Tela da análise de redes de similaridade](prints/analysis%20-%3E%20similarity%20network.png)
*Figura 5: Tela da análise de redes de similaridade.*

Essa ferramenta constrói um grafo interativo para representar as relações entre as moléculas.

*   **Funcionalidade:** cada nó (círculo) representa uma molécula; as conexões indicam semelhança estrutural. A rede ajuda a identificar famílias de compostos que compartilham características e auxilia na seleção de candidatos a fármacos.
*   **Uso prático:** escolha o alvo em **Select Target** e selecione o tipo de dado desejado. Após o processamento, a plataforma exibe a rede. Moléculas com mais conexões podem representar pontos centrais de interesse estrutural.

### 6.2 Docking: triagem virtual

![Tela de configuração e resultados do docking](prints/analysis%20-%3E%20docking.png)
*Figura 6: Tela de configuração e resultados do docking.*

O **docking** (atracamento molecular) simula como as moléculas da biblioteca se encaixam na proteína alvo e estima a força dessas interações.

> **Antes de executar o docking**
> Realize primeiro o **redocking**, para validar a confiabilidade do método na estrutura da proteína, e a análise **ADMET**, para priorizar moléculas com perfil farmacocinético adequado.

**Descrição dos campos**

*   **Select Target:** selecione a proteína-alvo obtida anteriormente.
*   **Select Binding Site:** escolha o local específico da proteína em que a ligação será testada.
*   **Select Library:** escolha o conjunto de moléculas que será testado contra a proteína.
*   **Charge Type:** método de cálculo das cargas elétricas. A opção **AM1 (Recommended)** oferece um equilíbrio entre eficiência e precisão.
*   **Prepare Complex:** mantenha esta opção selecionada para realizar o tratamento prévio dos dados, incluindo a adição de hidrogênios ausentes.
*   **Botão “Run Virtual Screening”:** inicia o processamento computacional.
*   **Interpretação dos resultados:** a tabela inferior apresenta a pontuação **vina (kcal/mol)**. Valores mais negativos indicam uma estimativa de ligação mais forte e estável entre a molécula e a proteína.

### 6.3 Redocking: validação do método

![Tela de execução do redocking](prints/analysis%20-%3E%20redocking.png)
*Figura 7: Tela de execução do redocking.*

O **redocking** é um procedimento de controle de qualidade. Nele, uma molécula presente na estrutura original da proteína é retirada computacionalmente e reposicionada pelo algoritmo no mesmo local.

*   **Uso prático:** selecione a pasta do alvo e o tipo de carga elétrica; depois, clique em **Run Redocking**.
*   **Interpretação:** o sucesso da validação é medido pelo **RMSD**. Um RMSD inferior a 2,0 Å indica que o modelo computacional reproduziu com boa precisão a posição experimental, sustentando o uso do método nos testes seguintes.

### 6.4 ADMET Analysis: perfil farmacocinético

![Tela da análise ADMET](prints/analysis%20-%3E%20admet.png)
*Figura 8: Tela da análise ADMET.*

A análise **ADMET** avalia propriedades relacionadas a absorção, distribuição, metabolismo, excreção e toxicidade. Ela ajuda a verificar se uma molécula possui características compatíveis com o desenvolvimento de um medicamento para uso humano.

*   **Uso prático:** selecione o alvo desejado e clique em **Run ADMET Analysis**.
*   **Painel de resultados:** apresenta classificações diretas sobre o comportamento previsto da molécula:
    *   **BBB:** indica a capacidade de atravessar a barreira hematoencefálica. **BBB+** indica penetração prevista; **BBB–**, ausência de penetração prevista.
    *   **HIA:** estima a absorção intestinal humana. **HIA+** indica boa absorção prevista.
*   **BOILED-Egg Plots:** fornecem uma predição visual do perfil da molécula:
    *   a região **branca** sugere alta probabilidade de absorção passiva pelo intestino humano;
    *   a região interna **amarela** sugere alta probabilidade de atravessar a barreira hematoencefálica e alcançar o sistema nervoso central.

---

## 7 Sequência recomendada de uso

Para uma análise completa, siga esta ordem:

1. Obtenha a estrutura da proteína-alvo no **PDB Loader**.
2. Busque moléculas bioativas no **ChEMBL Loader** e, se necessário, importe bibliotecas adicionais no **ZINC Loader**.
3. Explore os agrupamentos de compostos em **Similarity Network Analysis**.
4. Valide o protocolo de atracamento por meio do **Redocking**.
5. Avalie e priorize as moléculas com a análise **ADMET**.
6. Execute o **Docking** com os alvos, sítios de ligação e bibliotecas selecionados.
7. Compare a pontuação de docking com os demais resultados antes de escolher os candidatos prioritários.

> **Interpretação responsável**
> Os resultados da plataforma são predições computacionais. Eles devem ser avaliados em conjunto e, quando aplicável, confirmados por análise especializada e validação experimental.

---

## Sobre os Autores (Equipe BioMolExplorer)

**Alex Gutterres Taranto**  
<img src="apps/web/public/img/team/alex.png" width="100" style="border-radius: 50%;" />  
*D.Sc. in Chemistry*  
Departamento de Biotecnologia (DBTEC) - Universidade Federal de São João Del-Rei (UFSJ)  
E-mail: [taranto@ufsj.edu.br](mailto:taranto@ufsj.edu.br) | [Lattes](http://lattes.cnpq.br/4759006674013596)

**Alisson Marques da Silva**  
<img src="apps/web/public/img/team/alisson.png" width="100" style="border-radius: 50%;" />  
*D.Sc. in Electrical Engineering*  
Departamento de Computação (DECOM-DV) - Centro Federal de Educação Tecnológica (CEFET-MG)  
E-mail: [alisson@cefetmg.br](mailto:alisson@cefetmg.br) | [Lattes](http://lattes.cnpq.br/3856358583630209)

**Michel Pires da Silva**  
<img src="apps/web/public/img/team/michel.png" width="100" style="border-radius: 50%;" />  
*D.Sc. in Bioengineering*  
Departamento de Computação (DECOM-DV) - Centro Federal de Educação Tecnológica (CEFET-MG)  
E-mail: [michel@cefetmg.br](mailto:michel@cefetmg.br) | [Lattes](http://lattes.cnpq.br/1449902596670082)

**Lucas Roseno Medeiros Araujo**  
<img src="apps/web/public/img/team/lucas.jpg" width="100" style="border-radius: 50%;" />  
*Student in Computer Engineering*  
Centro Federal de Educação Tecnológica (CEFET-MG)  
E-mail: [lucas.araujo5938@gmail.com](mailto:lucas.araujo5938@gmail.com) | [Lattes](http://lattes.cnpq.br/6864847850207492)

**Pedro Henrique Pires Dias**  
<img src="apps/web/public/img/team/pedro.jpeg" width="100" style="border-radius: 50%;" />  
*Student in Computer Engineering*  
Centro Federal de Educação Tecnológica (CEFET-MG)  
E-mail: [pedro.dias@aluno.cefetmg.br](mailto:pedro.dias@aluno.cefetmg.br) | [Lattes](http://lattes.cnpq.br/5560963304395345)

---

## Citação Recomendada (Recommended Citation)

PIRES DA SILVA, M.; ALVES DE OLIVEIRA, T.; HABIB BECHELANE MAIA, E.; OLIVEIRA MENDES, G.; CRISTINA MOREIRA DAMÁZIO, L.; BRITO BARBOSA, D.; ANDRADE LEITE, F. H.; FALKOSKI, L.; FLORES DE SOUZA MARRA, I.; SIQUEIRA VALLE, M.; SILVA MATOS ANDRADE, L.; ČMELO, I.; FAYNE, D.; BATISTA DE CARVALHO, P.; MARQUES DA SILVA, A.; GUTTERRES TARANTO, A.; ARAÚJO, L. R. M.; DIAS, P. H. P. **Molecular Data Exploration for Intelligent Drug Discovery: BioMolExplorer v2.0**. Mendeley Data, 2025. Available at: <https://doi.org/10.17632/5njg46dfj4.3>.
