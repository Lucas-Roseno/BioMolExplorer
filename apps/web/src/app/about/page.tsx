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
              E-mail: <a href="mailto:lucas.araujo5938@gmail.com">lucas.araujo5938@gmail.com</a><br />
              <a href="http://lattes.cnpq.br/" target="_blank" rel="noopener noreferrer">Lattes</a>
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
    </div>
  );
}