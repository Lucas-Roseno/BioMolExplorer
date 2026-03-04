import Image from 'next/image';

export default function Home() {
  return (

    <main>
      <div className="container">
        <section className="welcome-section">
          <h2>Welcome to BioMolExplorer</h2>
          <p>Your integrated platform for exploring and analyzing molecular data.</p>
          <p>Use the menu above to navigate to the <strong>PDB LOADER</strong> tool and start your search for PDB
            structures.</p>
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