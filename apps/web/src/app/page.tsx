

export default function Home() {
  return (

    <main>
      <div className="container">
        <section className="welcome-section">
          <h2>Welcome to BioMolExplorer 2.0</h2>
          <p>Your comprehensive platform for exploring, searching, and analyzing molecular structures.</p>
          <p>Use the navigation menu above to access our dedicated tools: <strong>PDB Explorer</strong> for protein structures, <strong>ChEMBL Browser</strong> for bioactive molecules, and <strong>ZINC Archive</strong> for commercially available compounds. Easily fetch datasets for your research straight into your local environment.</p>
        </section>
      </div>

      <section className="partners">
        <div className="partners-inner">
          <ul className="logo-grid">
            <li>
              <a href="https://www.cefetmg.br/" target="_blank" rel="noopener">
                <img loading="lazy" src="img/partness/cefet.png" alt="cefet" />
              </a>
            </li>
            <li>
              <a href="https://fapemig.br/" target="_blank" rel="noopener">
                <img loading="lazy" src="img/partness/fapemig.png" alt="FAPEMIG" />
              </a>
            </li>
            <li>
              <a href="http://www.ufsj.edu.br/" target="_blank" rel="noopener">
                <img loading="lazy" src="img/partness/ufsj.jpg" alt="INCT" />
              </a>
            </li>
            <li>
              <a href="https://www.gov.br/cnpq/pt-br" target="_blank" rel="noopener">
                <img loading="lazy" src="img/partness/cnpq.jpg" alt="CNPQ" />
              </a>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}