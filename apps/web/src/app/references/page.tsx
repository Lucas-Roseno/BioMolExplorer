import './references.css';

export default function ReferencesPage() {
  return (
    <div className="container">
      <div className="references-container">
        <header className="references-header">
          <h1 className="references-title">Research Report: BioMolExplorer</h1>
          <p className="subtitle">Integrated Interface for Biological Data Extraction and Visualization</p>
        </header>

        <section>
          <h2 className="section-title">Sustainable Development Goals (2030 Agenda)</h2>
          <ul className="ods-list">
            <li>Ensure healthy lives and promote well-being for all at all ages.</li>
            <li>Build resilient infrastructure, promote inclusive and sustainable industrialization, and foster innovation.</li>
          </ul>
        </section>

        <section>
          <h2 className="section-title">Summary</h2>
          <div className="abstract-box">
            <p>
              Drug development for neurodegenerative diseases, such as Alzheimer's, faces significant challenges due to high costs and time demands. Computer-aided drug design (CADD) and virtual screening are promising approaches to optimize these early stages. This work, part of the NeuroPharmIA project, aimed to develop BioMolExplorer, an integrated computational interface to automate the extraction, mining, and visualization of structural and chemical biological data. The methodology was based on developing a web application (HTML/JS/CSS Frontend and Python Backend), integrating data collection scripts (crawlers) from renowned databases such as PDB, ChEMBL, and ZINC. Throughout the project, interactive modules were implemented, allowing researchers to search for therapeutic targets and compounds, visualize molecules in 2D and 3D using the RDKit library, and manage files through a user-friendly interface with error handling, loading screens, and batch downloads. Finally, the application was containerized using Docker, ensuring easy environment reproducibility. The results demonstrate that the platform lowers the technical barrier for bioinformatics researchers, centralizing the workflow and accelerating the initial selection of multi-target compounds with therapeutic potential.
            </p>
            <div className="keywords">
              Keywords: Bioinformatics; Virtual Screening; Automation; Alzheimer's Disease.
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
          <h2 className="section-title">Report Body</h2>

          <h3 className="subsection-title">Introduction</h3>
          <p>
            Understanding neuronal conditions and changes associated with aging requires a detailed analysis of the human brain. Functional or structural changes often lead to the development of different forms of dementia, with Alzheimer's disease (AD) standing out as the most prevalent form. The high prevalence of the disease, combined with its complex pathophysiology, motivates intense efforts to develop effective therapeutic strategies.
          </p>
          <p>
            However, drug discovery and repositioning are processes marked by high costs and low success rates. A promising strategy to circumvent such challenges is the application of computational techniques in the exploratory phase, such as computer-aided drug design (CADD) and high-throughput virtual screening (HTVS). These methodologies evaluate critical properties, such as binding affinity, toxicity, and bioavailability across vast databases.
          </p>
          <p>
            The practical challenge, however, resides in the fragmentation of bioinformatics tools. Data extraction from databases like PDB, ChEMBL, and ZINC often requires the manual execution of complex scripts. In this context, this work aimed to design and implement the BioMolExplorer interface, a core module of the NeuroPharmIA project. The goal was to develop a user-friendly web platform that would automate the stages of extraction, preliminary analysis, and visualization of compounds and enzymes, democratizing access to these computational tools and optimizing the workflow in the search for inhibitors targeting sites such as AChE, BChE, and BACE1.
          </p>

          <h3 className="subsection-title">Methodology</h3>
          <p>
            The development of BioMolExplorer adopted an agile and iterative process, with weekly follow-up meetings and goal definition. The project architecture was structured on the separation between a user interface (Frontend) and a processing server (Backend).
          </p>
          <p>
            <strong>Environment and Tools:</strong> Initially, the development environment was configured using the Anaconda package manager, allowing the installation of isolated dependencies from the requirements.yml file. The backend was developed in Python, serving as a bridge for the execution of data collection scripts (crawlers). The frontend was structured in HTML, CSS, and JavaScript.
          </p>
          <p>
            <strong>Module Development (Crawlers):</strong> Three major data mining modules were sequentially integrated:
          </p>
          <ul className="ods-list">
            <li><strong>PDB Loader (11-pdb.py):</strong> Module for data extraction from the Protein Data Bank. Logic was implemented to require specific user parameters (such as the PDB EC number), avoiding generic and costly searches.</li>
            <li><strong>ChEMBL Loader (12-chembl.py):</strong> Integration with the ChEMBL database to search for bioactives.</li>
            <li><strong>ZINC Loader (13-zinc.py):</strong> Module to capture similar molecules and expand the compound library.</li>
          </ul>
          <p>
            <strong>Interface and User Experience (UX):</strong> To ensure proper functioning during asynchronous tasks (time-consuming downloads of biological data), temporary lock screens were implemented to inform the user of the request progress, along with pop-ups for error handling. Dynamic tables were developed to present processed .csv files, allowing for the deletion or batch download (.zip) of generated files.
          </p>
          <p>
            <strong>Molecular Visualization and Infrastructure:</strong> To add analytical value, the RDKit library was coupled to the system for graphical rendering of molecules in 2D and 3D directly in the browser. Finally, aiming at software portability and scalability, the entire application environment was encapsulated in containers using Docker technology.
          </p>

          <h3 className="subsection-title">Results and Discussion</h3>
          <p>
            The results obtained reflect the construction of a functional and integrated platform. The project's evolution demonstrated a significant gain in the usability of NeuroPharmIA's virtual screening tools.
          </p>
          <p>
            The integration of the PDB module allowed protein structural data to be downloaded in an organized way, displayed in a collapsible table interface, facilitating visualization by therapeutic target. The file management system proved efficient, allowing the user to delete unnecessary folders and files with immediate feedback on screen, or perform the full project download in a compressed file.
          </p>
          <p>
            In the ChEMBL tab, the addition of loading screens resolved concurrency issues where multiple user clicks caused overload on the request scripts. Furthermore, exception handling routines (try/except) coupled with screen alerts ensured that connection errors with biological databases did not cause silent failures in the application.
          </p>
          <p>
            The ZINC module was successfully implemented for ligand searching. One of the main differentiators achieved in the final interface was the integration with RDKit, which allowed the interactive display of three-dimensional (3D) structures of enzymes and 2D configurations of small molecules directly on the frontend.
          </p>
          <p>
            Containerization via Docker consolidated the system, packaging the Python backend and web assets into a single image. This eliminates the complexity of environment and dependency installation (such as RDKit and scientific libraries) for new researchers; just running the container is enough to have the system operational and ready to conduct in silico evaluation stages.
          </p>

          <h3 className="subsection-title">Conclusions</h3>
          <p>
            The development of BioMolExplorer fulfilled the objectives established in the work plan, delivering a robust, modular, and easy-to-use computational platform. The creation of the interface eliminated the need for direct interaction via command line for the collection and preprocessing of data from repositories such as PDB, ChEMBL, and ZINC.
          </p>
          <p>
            During the process, integration challenges between web languages and heavy Python backend routines were overcome. The implementation of 2D/3D molecular visualizations and subsequent containerization via Docker added considerable value, making the tool not just a download utility, but a true dashboard for computational biology.
          </p>
          <p>
            From an academic and professional perspective, the work plan enabled the technical growth of the student in the software development ecosystem applied to bioinformatics, solidifying knowledge in versioning, web architecture, and biological data handling. As future work, it is expected that the platform will integrate the subsequent artificial intelligence modules proposed by the NeuroPharmIA project, closing the automated cycle of selecting and classifying inhibitors for neurodegenerative diseases.
          </p>
        </section>

        <section>
          <h2 className="section-title">References</h2>
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
