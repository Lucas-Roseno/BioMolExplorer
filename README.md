<div align="center">
  <img src="https://img.shields.io/badge/Status-Em%20Andamento-yellow?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Vers%C3%A3o-2.0-blue?style=for-the-badge" alt="Version" />
  <a href="https://biomolexplorer.onrender.com" target="_blank">
    <img src="https://img.shields.io/badge/🌐%20Live%20Demo-biomolexplorer.onrender.com-8A2BE2?style=for-the-badge" alt="Live Demo" />
  </a>
</div>

<br/>

<div align="center">
  <h1>🧬 BioMolExplorer 2.0</h1>
  <p>Uma interface computacional integrada de mineração, análise e visualização de dados biológicos estruturais e químicos, com foco na triagem de inibidores multi-alvo para doenças neurodegenerativas.</p>
</div>

<div align="center" style="display: flex; justify-content: center; flex-wrap: wrap; gap: 15px; margin: 20px 0;">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/pandas-150458?style=for-the-badge&logo=pandas&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/RDKit-A100FF?style=for-the-badge&logo=RDKit&logoColor=white" />
</div>

---

## 📖 1. Introdução e Objetivo

O desenvolvimento e reposicionamento de fármacos para desordens neurodegenerativas, como a Doença de Alzheimer (AD), enfrentam barreiras formidáveis de custo e tempo, com baixíssimas taxas de aprovação (5–10%). A modelagem molecular assistida por computador (CADD) e a triagem virtual (HTVS) são alternativas robustas na otimização destas fases iniciais.

O **BioMolExplorer** foi concebido como um módulo central do amplo projeto **NeuroPharmIA**. O objetivo primário é fornecer uma interface web amigável e de alta performance que automatize a extração, mineração e visualização de dados de importantes bases abertas (PDB, ChEMBL e ZINC). Focando na inibição de enzimas críticas como Acetilcolinesterase (AChE), Butirilcolinesterase (BChE) e Beta-secretase 1 (BACE1), o BioMolExplorer reduz significativamente as barreiras técnicas em bioinformática ao centralizar o fluxo de trabalho de um pesquisador.

### 🌟 Destaques e Habilidades Envolvidas
Esse projeto exigiu uma combinação plural e desafiadora de competências técnicas dos Desenvolvedores **Lucas Roseno** e **Pedro Dias**, consolidando um forte background no ecossistema de Engenharia de Software e Bioinformática:
- **Arquitetura Full-Stack**: Concepção e integração fluida de um ecossistema com Frontend Moderno (React/Next.js), Middleware em Node.js e um Backend Científico robusto em Python.
- **Desenvolvimento de UI/UX Responsivo**: Modelagem de fluxogramas em tela, tratamento de operações assíncronas extensas com *lock screens* nativos (spinners), paginação para datasets densos e design profissional atraente voltado à usabilidade do pesquisador.
- **Engenharia de Dados & Web Crawlers**: Tratamento profundo de arquivos CSV provindos das bases do PDB e ChEMBL, incluindo injeções anti-falhas e downloads paralelos escaláveis (via `concurrent.futures`), lidando com resiliência de rede e APIs abertas.
- **Integração de Bioinformática em Tela**: Acoplamento pioneiro da biblioteca **RDKit** para extração de topologias e exibição interativa (2D/3D) de moléculas e enzimas complexas diretamente pelo navegador do usuário.
- **DevOps Elementar**: Criação da orquestração unificada de todos os serviços (Web, API Node e Flask/Python) contidos dentro do padrão **Docker**, elevando drasticamente a portabilidade e permitindo deploy escalonável *one-click* com ambientes Anaconda simulados. 

### 🤝 Colaboradores
O BioMolExplorer foi originado na Iniciação Científica no **CEFET-MG** sob um esforço coletivo multidisciplinar:
- **Prof. Dr. Michel Pires da Silva** — Orientador / Idealizador do núcleo (NeuroPharmIA)
- **Prof. Dr. Alex Gutterres Taranto** (UFSJ) — Orientador
- **Prof. Dr. Alisson Marques da Silva** — Co-Orientador
- **Lucas Roseno Medeiros Araújo** — Idealizador e Desenvolvedor Full-stack principal (Módulos, Interface e Arquitetura).
- **Pedro Dias** — Programador full-stack.

---

## 🛠️ 2. Metodologia e Tecnologias Utilizadas

A arquitetura do projeto aplica a separação estrita de responsabilidades (*Separation of Concerns*). Foram desenvolvidos 3 módulos grandes operando sobre a aplicação web: **PDB Loader**, **ChEMBL Loader** e **ZINC Loader**, todos amarrados na capacidade de contornar processamentos demorados exibindo telas de carregamento dinâmicas e gerenciamento autônomo de pastas (remoção/criação em lote, downloads em ZIP).

A implementação em **Docker** empacotou com maestria dependências árduas de configurar localmente, como o **Anaconda** e os módulos numéricos/científicos (`rcsbsearch`, `chembl_webresource_client`, `pandas`, `rdkit`), unificando tudo em um único *entrypoint script*.

---

## 📂 3. Estrutura do Projeto

A organização de pastas segue uma infraestrutura local amigável (*Monorepo*), onde serviços independentes conversam entre si.

```text
BioMolExplorer/
├── apps/
│   ├── web/               # ⚡ Front-end | Next.js 14, React, UI/UX Principal, RDKit Viewer
│   ├── api/               # 🚦 Proxy Intermediador | Node.js, Mapeamento de rotas e segurança CORS
│   └── python-service/    # 🐍 Back-end Científico | Server Flask, Scripts Web Crawlers (PDB, ChEMBL), Pandas, Data Mining
├── package.json           # Definição dos workspaces do NPM
├── Dockerfile             # Receita de Deployment na nuvem/local 
└── init.sh                # Script Bash p/ disparar os três serviços simultaneamente no Container
```

---

## 🚀 4. Como Rodar o Projeto

É possível rodar a aplicação através do *Docker* (Maneira mais fácil e recomendada) ou pelo Ambiente de Desenvolvimento Nativo.

### Pré-requisitos
- Git e [Node.js](https://nodejs.org/) instalados.
- [Docker](https://www.docker.com/) (Para o método Container).
- [Anaconda / Miniconda](https://www.anaconda.com/) (Para o método Nativo).

### Passo a Passo

**1.** ⬇️ Clone este repositório:
```bash
git clone https://github.com/Lucas-Roseno/BioMolExplorer.git
cd BioMolExplorer
```

**Opção A) Usando o Docker - O jeito rápido (Recomendado) 🐳**
Esta maneira não afeta o Python do seu PC e já instala todas as dependências complexas lá dentro.
```bash
# Compile a Imagem (Pode demorar alguns minutos na primeira vez)
docker build -t biomolexplorer .

# Rode o Container vinculando as portas
docker run -p 3000:3000 -p 3001:3001 -p 5000:5000 biomolexplorer
```
Após um instante de configuração, o terminal informará que a interface web está acessível em: `http://localhost:3000`

<br/>

**Opção B) Ambiente de Desenvolvimento Nativo (Source) 💻**
Ideal se você quiser contribuir com modificações no código.

```bash
# 1. Entre no repositório back-end e crie o ambiente Anaconda dedicado
cd apps/python-service
conda create -n BioMolExplorer python=3.12 -y
conda activate BioMolExplorer

# 2. Instale as bibliotecas e ferramentas do Python
pip install -r requirements.txt
# (Volte para a raiz do repositório)
cd ../../ 

# 3. Na raiz do projeto, instale as dependências Node/Javascript para Web e Proxy
npm install

# 4. Inicie os três serviços ao mesmo tempo via Concurrently!
npm run dev
```

Pronto! Acesse `http://localhost:3000` em seu navegador padrão.
*(Nota: Certifique-se de que o Conda `BioMolExplorer` está ativado no terminal aberto)*.

---

## 🔮 5. Objetivos Futuros e Continuidade

O **BioMolExplorer 2.0** faz parte da tese macro **NeuroPharmIA**. Este projeto é iterativo e continuará em vasta expansão.  
Para as próximas rodadas, espera-se agrupar na plataforma **Inteligências Artificiais e Redes Neurais** que consumam os bancos de moléculas pré-limpos em tempo real, realizando classificação, predições QSAR (*Quantitative Structure-Activity Relationship*) e priorização de candidatos de modo automático, fechando de ponta a ponta o ciclo *in silico* de seleção de inibidores contra Doenças Neurodegenerativas de forma interativa.

---

## 👨‍💻 6. Autor e Contato

**Lucas Roseno Medeiros Araujo**
<br>
> *Futuro Engenheiro de Computação apaixonado por integração de sistemas complexos, Arquitetura Full-Stack e Bioinformática.*

<div align="left" style="margin-top: 15px">
  <a href="https://www.linkedin.com/in/lucasroseno/" target="_blank">
    <img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="linkedin" />
  </a>
  <a href="https://github.com/Lucas-Roseno" target="_blank">
    <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="github" />
  </a>
  <a href="mailto:lucasroseno759@gmail.com" target="_blank">
    <img src="https://img.shields.io/badge/E--Mail-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="email" />
  </a>
  <a href="https://www.instagram.com/lucas_roseno__/" target="_blank">
    <img src="https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="instagram" />
  </a>
</div>

<br>

✏️ _Feito com dedicação. 2024 - 2026_
