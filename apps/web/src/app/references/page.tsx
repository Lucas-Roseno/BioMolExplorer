import './references.css';

export default function ReferencesPage() {
  return (
    <div className="container">
      <div className="references-container">
        <header className="references-header">
          <h1 className="references-title">Relatório de Pesquisa: BioMolExplorer</h1>
          <p className="subtitle">Interface Integrada para Extração e Visualização de Dados Biológicos</p>
        </header>

        <section>
          <h2 className="section-title">Objetivos de Desenvolvimento Sustentável (Agenda 2030)</h2>
          <ul className="ods-list">
            <li>Assegurar uma vida saudável e promover o bem-estar para todos, em todas as idades.</li>
            <li>Construir infraestruturas resilientes, promover a industrialização inclusiva e sustentável e fomentar a inovação.</li>
          </ul>
        </section>

        <section>
          <h2 className="section-title">Resumo</h2>
          <div className="abstract-box">
            <p>
              O desenvolvimento de fármacos para doenças neurodegenerativas, como o Alzheimer, enfrenta desafios significativos devido ao alto custo e tempo demandado. A modelagem molecular assistida por computador (CADD) e a triagem virtual são abordagens promissoras para otimizar essas etapas iniciais. O presente plano de trabalho, inserido no projeto NeuroPharmIA, teve como objetivo desenvolver o BioMolExplorer, uma interface computacional integrada para automatizar a extração, mineração e visualização de dados biológicos estruturais e químicos. A metodologia baseou-se no desenvolvimento de uma aplicação web (Front-end em HTML/JS/CSS e Back-end em Python), integrando scripts de coleta de dados (crawlers) de bases renomadas como PDB, ChEMBL e ZINC. Ao longo do projeto, foram implementados módulos interativos que permitem aos pesquisadores buscar alvos terapêuticos e compostos, visualizar moléculas em 2D e 3D utilizando a biblioteca RDKit, e gerenciar arquivos através de uma interface amigável com tratamento de erros, telas de carregamento e downloads em lote. Por fim, a aplicação foi conteinerizada utilizando Docker, garantindo fácil reprodutibilidade do ambiente. Os resultados obtidos demonstram que a plataforma reduz a barreira técnica para pesquisadores da área de bioinformática, centralizando o fluxo de trabalho e acelerando a seleção inicial de compostos multi-alvo com potencial terapêutico.
            </p>
            <div className="keywords">
              Palavras-chave: Bioinformática; Triagem Virtual; Automação; Doença de Alzheimer.
            </div>
          </div>
        </section>

        <section>
          <h2 className="section-title">Abstract</h2>
          <div className="abstract-box">
            <h3 className="subsection-title">NeuroPharmIA: Automation and Web Integration for Multi-Target Compound Selection and Virtual Screening</h3>
            <p>
              Developing drugs for neurodegenerative diseases, such as Alzheimer's, faces significant challenges due to high costs and time demands. Computer-Aided Drug Design (CADD) and virtual screening are promising approaches to optimize these early stages. This work, part of the NeuroPharmIA project, aimed to develop BioMolExplorer, an integrated computational interface to automate the extraction, mining, and visualization of structural and chemical biological data. The methodology was based on developing a web application (HTML/JS/CSS Frontend and Python Backend), integrating data collection scripts (crawlers) from renowned databases such as PDB, ChEMBL and ZINC. Throughout the project, interactive modules were implemented allowing researchers to search for therapeutic targets and compounds, visualize molecules in 2D and 3D using the RDKit library, and manage files through a user-friendly interface with error handling, loading screens, and batch downloads. Finally, the application was containerized using Docker, ensuring easy environment reproducibility. The results demonstrate that the platform lowers the technical barrier for bioinformatics researchers, centralizing the workflow and accelerating the initial selection of multi-target compounds with therapeutic potential.
            </p>
            <div className="keywords">
              Keywords: Bioinformatics; Virtual Screening; Automation; Alzheimer's Disease.
            </div>
          </div>
        </section>

        <section className="report-content">
          <h2 className="section-title">Corpo do Relatório</h2>
          
          <h3 className="subsection-title">Introdução</h3>
          <p>
            A compreensão das condições neuronais e das alterações associadas ao envelhecimento exige uma análise detalhada do cérebro humano. Alterações funcionais ou estruturais frequentemente conduzem ao desenvolvimento de diferentes formas de demência, com a doença de Alzheimer (AD) destacando-se como a forma mais prevalente. A elevada prevalência da doença, aliada à sua complexa fisiopatologia, motiva esforços intensos para o desenvolvimento de estratégias terapêuticas eficazes.
          </p>
          <p>
            Contudo, a descoberta e o reposicionamento de fármacos são processos marcados por elevados custos e baixa taxa de sucesso. Uma estratégia promissora para contornar tais desafios é a aplicação de técnicas computacionais na fase exploratória, como a modelagem molecular assistida por computador (CADD) e a triagem virtual de alto desempenho (HTVS). Estas metodologias avaliam propriedades críticas, como afinidade de ligação, toxicidade e biodisponibilidade em bancos de dados vastos.
          </p>
          <p>
            O desafio prático, no entanto, reside na fragmentação das ferramentas de bioinformática. A extração de dados de bancos como PDB, ChEMBL e ZINC exige frequentemente a execução manual de scripts complexos. Nesse contexto, o presente plano de trabalho visou projetar e implementar a interface do BioMolExplorer, um módulo central do projeto NeuroPharmIA. O objetivo foi desenvolver uma plataforma web amigável que automatizasse as etapas de extração, análise prévia e visualização de compostos e enzimas, democratizando o acesso a essas ferramentas computacionais e otimizando o fluxo de trabalho na busca por inibidores voltados a alvos como AChE, BChE e BACE1.
          </p>

          <h3 className="subsection-title">Metodologia</h3>
          <p>
            O desenvolvimento do BioMolExplorer adotou um processo ágil e iterativo, com reuniões semanais de acompanhamento e definição de metas. A arquitetura do projeto foi estruturada na separação entre uma interface de usuário (Front-end) e um servidor de processamento (Back-end).
          </p>
          <p>
            <strong>Ambiente e Ferramentas:</strong> Inicialmente, o ambiente de desenvolvimento foi configurado utilizando o gerenciador de pacotes Anaconda, permitindo a instalação de dependências isoladas a partir do arquivo requirements.yml. O back-end foi desenvolvido em linguagem Python, servindo como ponte para a execução dos scripts de coleta de dados (crawlers). O front-end foi estruturado em HTML, CSS e JavaScript.
          </p>
          <p>
            <strong>Desenvolvimento de Módulos (Crawlers):</strong> Foram integrados sequencialmente três grandes módulos de mineração de dados:
          </p>
          <ul className="ods-list">
            <li><strong>PDB Loader (11-pdb.py):</strong> Módulo para extração de dados do Protein Data Bank. Foi implementada lógica para exigir parâmetros específicos do usuário (como o PDB EC number), evitando buscas genéricas e custosas.</li>
            <li><strong>ChEMBL Loader (12-chembl.py):</strong> Integração com o banco ChEMBL para busca de bioativos.</li>
            <li><strong>ZINC Loader (13-zinc.py):</strong> Módulo para captura de moléculas similares e expansão da biblioteca de compostos.</li>
          </ul>
          <p>
            <strong>Interface e Experiência do Usuário (UX):</strong> Para garantir o bom funcionamento durante tarefas assíncronas (downloads demorados de dados biológicos), foram implementadas telas de bloqueio temporário (lock screens) informando ao usuário o progresso da requisição, além de pop-ups para tratamento de erros. Tabelas dinâmicas foram desenvolvidas para apresentar arquivos .csv processados, permitindo a exclusão ou download em lote (.zip) de arquivos gerados.
          </p>
          <p>
            <strong>Visualização Molecular e Infraestrutura:</strong> Para agregação de valor analítico, a biblioteca RDKit foi acoplada ao sistema para renderização gráfica de moléculas em 2D e 3D diretamente no navegador. Por fim, visando a portabilidade e escalabilidade do software, todo o ambiente da aplicação foi encapsulado em contêineres utilizando a tecnologia Docker.
          </p>

          <h3 className="subsection-title">Resultados e Discussões</h3>
          <p>
            Os resultados obtidos refletem a concretização de uma plataforma funcional e integrada. A evolução do projeto demonstrou um ganho significativo na usabilidade das ferramentas de triagem virtual do NeuroPharmIA.
          </p>
          <p>
            A integração do módulo PDB permitiu que os dados estruturais de proteínas fossem baixados de forma organizada, exibidos em uma interface em formato de tabela colapsável, facilitando a visualização por alvo terapêutico. O sistema de gerenciamento de arquivos provou ser eficiente, permitindo que o usuário apague pastas e arquivos desnecessários com feedback imediato em tela, ou realize o download completo do projeto em um arquivo compactado.
          </p>
          <p>
            Na aba do ChEMBL, a adição de telas de carregamento (lock screens) resolveu problemas de concorrência onde múltiplos cliques do usuário causavam sobrecarga nos scripts de requisição. Além disso, as rotinas de tratamento de exceção (try/except) acopladas a alertas em tela garantiram que erros de conexão com os bancos biológicos não causassem falhas silenciosas na aplicação.
          </p>
          <p>
            O módulo ZINC foi implementado com sucesso para a busca de ligantes. Um dos principais diferenciais alcançados na interface final foi a integração com o RDKit, que viabilizou a exibição interativa das estruturas tridimensionais (3D) das enzimas e das configurações 2D das moléculas pequenas diretamente no front-end.
          </p>
          <p>
            A conteinerização via Docker consolidou o sistema, empacotando o back-end em Python e os assets web em uma única imagem. Isso elimina a complexidade da instalação do ambiente e dependências (como RDKit e bibliotecas científicas) por novos pesquisadores, bastando executar o contêiner para que o sistema esteja operante e pronto para conduzir as etapas de avaliação in silico.
          </p>

          <h3 className="subsection-title">Conclusões</h3>
          <p>
            O desenvolvimento do BioMolExplorer cumpriu os objetivos estabelecidos no plano de trabalho, entregando uma plataforma computacional robusta, modular e de fácil utilização. A criação da interface eliminou a necessidade de interação direta via linha de comando para a coleta e o pré-processamento de dados de repositórios como PDB, ChEMBL e ZINC.
          </p>
          <p>
            Durante o percurso, superaram-se desafios de integração entre linguagens web e rotinas pesadas de back-end em Python. A implementação de visualizações moleculares 2D/3D e a posterior conteinerização via Docker agregaram valor considerável, tornando a ferramenta não apenas um utilitário de download, mas um verdadeiro painel de controle (dashboard) para biologia computacional.
          </p>
          <p>
            Do ponto de vista acadêmico e profissional, o plano de trabalho propiciou o amadurecimento técnico do discente no ecossistema de desenvolvimento de software aplicado à bioinformática, solidificando conhecimentos em versionamento, arquitetura web e tratamento de dados biológicos. Como trabalhos futuros, espera-se que a plataforma integre os módulos subsequentes de inteligência artificial propostos pelo projeto NeuroPharmIA, fechando o ciclo automatizado de seleção e classificação de inibidores para doenças neurodegenerativas.
          </p>
        </section>

        <section>
          <h2 className="section-title">Referências</h2>
          <ul className="bib-list">
            <li className="bib-item">Cereto-Massagué, A., Ojeda, M. J., Valls, C., Mulero, M., Garcia-Vallvé, S., & Pujadas, G. (2015). Molecular fingerprint similarity search in virtual screening. Methods, 71, 58–63. https://doi.org/10.1016/j.ymeth.2014.09.014</li>
            <li className="bib-item">Lipinski, C. A. (2000). Drug-like properties and the causes of poor solubility and poor permeability. Journal of Pharmacological and Toxicological Methods, 44(1), 235–249. https://doi.org/10.1016/S1056-8719(00)00011-X</li>
            <li className="bib-item">Moriwaki, H., Tian, Y.-S., Kawashita, N., & Takagi, T. (2018). Mordred: A molecular descriptor calculator. Journal of Cheminformatics, 10(1), 1–14. https://doi.org/10.1186/s13321-018-0319-1</li>
            <li className="bib-item">Rácz, A., Bajusz, D., & Héberger, K. (2018). Life beyond the Tanimoto coefficient: Similarity measures for interaction fingerprints. Journal of Cheminformatics, 10(1), 1–12. https://doi.org/10.1186/s13321-018-0322-6</li>
            <li className="bib-item">Landrum, G. (2006). RDKit: Open-source cheminformatics. Journal of Chemical Information and Modeling, 26(7), 1183–1194. https://doi.org/10.1021/ci050046e</li>
            <li className="bib-item">Scalfani, V. F., Patel, V. D., & Fernandez, A. M. (2022). Visualizing chemical space networks with RDKit and NetworkX. Journal of Cheminformatics, 14(1), 1–87. https://doi.org/10.1186/s13321-022-00518-1</li>
            <li className="bib-item">Arrowsmith, J. (2012). Trial watch: Phase III and submission failures: 2007–2010. Nature Reviews Drug Discovery, 11(1), 8-9.</li>
            <li className="bib-item">Merkel, D. (2014). Docker: lightweight linux containers for consistent development and deployment. Linux journal, 2014(239), 2.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
