import './about.css'

export default function AboutPage() {
  return (
    <div className="container">
      <section className="team-section">
        <h2 className="team-title">BioMolExplorer Team</h2>

        <ul className="team-grid">
          <li className="team-card">
            <img className="team-photo" src="/img/team/alex.png" alt="Alex Gutterres Taranto" />
            <h3 className="team-name">Alex Gutterres Taranto</h3>
            <p className="team-role">D.Sc. in Chemistry</p>
            <p className="team-affil">
              Departamento de Biotecnologia (DBTEC)<br />
              Universidade Federal de São João Del-Rei (UFSJ)
            </p>
            <p className="team-contact">
              E-mail: <a href="mailto:alex@alex.org">alex@alex.org</a><br />
              <a href="http://lattes.cnpq.br/4759006674013596" target="_blank" rel="noopener noreferrer">Lattes</a>
            </p>
          </li>

          <li className="team-card">
            <img className="team-photo" src="/img/team/alisson.png" alt="Alisson Marques da Silva" />
            <h3 className="team-name">Alisson Marques da Silva</h3>
            <p className="team-role">D.Sc. in Electrical Engineering</p>
            <p className="team-affil">
              Departamento de Computação (DECOM-DV)<br />
              Centro Federal de Educação Tecnológica (CEFET-MG)
            </p>
            <p className="team-contact">
              E-mail: <a href="mailto:alisson@cefetmg.br">alisson@cefetmg.br</a><br />
              <a href="http://lattes.cnpq.br/3856358583630209" target="_blank" rel="noopener noreferrer">Lattes</a>
            </p>
          </li>

          <li className="team-card">
            <img className="team-photo" src="/img/team/michel.png" alt="Michel Pires da Silva" />
            <h3 className="team-name">Michel Pires da Silva</h3>
            <p className="team-role">D.Sc. in Bioengineering</p>
            <p className="team-affil">
              Departamento de Computação (DECOM-DV)<br />
              Centro Federal de Educação Tecnológica (CEFET-MG)
            </p>
            <p className="team-contact">
              E-mail: <a href="mailto:michel@cefetmg.br">michel@cefetmg.br</a><br />
              <a href="http://lattes.cnpq.br/1449902596670082" target="_blank" rel="noopener noreferrer">Lattes</a>
            </p>
          </li>

          <li className="team-card">
            <img className="team-photo" src="/img/team/lucas.jpg" alt="Lucas Roseno Medeiros Araujo" />
            <h3 className="team-name">Lucas Roseno Medeiros Araujo</h3>
            <p className="team-role">Student in Computer Engineering</p>
            <p className="team-affil">
              Centro Federal de Educação Tecnológica (CEFET-MG)
            </p>
            <p className="team-contact">
              E-mail: <a href="mailto:lucas.araujo@aluno.cefetmg.br"> lucas.araujo@aluno.cefetmg.br </a><br />
              <a href="http://lattes.cnpq.br/6864847850207492" target="_blank" rel="noopener noreferrer">Lattes</a>
            </p>
          </li>

          <li className="team-card">
            <img className="team-photo" src="/img/team/pedro.jpeg" alt="Pedro Henrique Pires Dias" />
            <h3 className="team-name">Pedro Henrique Pires Dias</h3>
            <p className="team-role">Student in Computer Engineering</p>
            <p className="team-affil">
              Centro Federal de Educação Tecnológica (CEFET-MG)
            </p>
            <p className="team-contact">
              E-mail: <a href="mailto:pedro.dias@aluno.cefetmg.br">pedro.dias@aluno.cefetmg.br</a><br />
              <a href="http://lattes.cnpq.br/5560963304395345" target="_blank" rel="noopener noreferrer">Lattes</a>
            </p>
          </li>
        </ul>
      </section>

      <section className="citation-section">
        <h2 className="team-title">Recommended Citation</h2>
        <div className="citation-box">
          <p>
            PIRES DA SILVA, M.; ALVES DE OLIVEIRA, T.; HABIB BECHELANE MAIA, E.; OLIVEIRA MENDES, G.; CRISTINA MOREIRA DAMÁZIO, L.; BRITO BARBOSA, D.; ANDRADE LEITE, F. H.; FALKOSKI, L.; FLORES DE SOUZA MARRA, I.; SIQUEIRA VALLE, M.; SILVA MATOS ANDRADE, L.; ČMELO, I.; FAYNE, D.; BATISTA DE CARVALHO, P.; MARQUES DA SILVA, A.; GUTTERRES TARANTO, A.; ARAÚJO, L. R. M.; DIAS, P. H. P. <strong>Molecular Data Exploration for Intelligent Drug Discovery: BioMolExplorer v2.0</strong>. Mendeley Data, 2025. Available at: &lt;<a href="https://doi.org/10.17632/5njg46dfj4.3" target="_blank" rel="noopener noreferrer">https://doi.org/10.17632/5njg46dfj4.3</a>&gt;.
          </p>
        </div>
      </section>
    </div>
  );
}