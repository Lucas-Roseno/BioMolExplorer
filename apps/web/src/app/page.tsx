"use client";

import React, { useState } from "react";
import Link from "next/link";

interface WorkflowStep {
  id: number;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  inputs: string[];
  outputs: string[];
  href: string;
  ctaText: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 1,
    badge: "Step 01 · Structural Acquisition",
    title: "PDB Macromolecular Search",
    subtitle: "Curate 3D Protein & Nucleic Acid Target Datasets",
    description:
      "Start your exploration by querying the Protein Data Bank (PDB) for high-resolution 3D macromolecular structures. Filter candidate structures by target enzyme/receptor name, Enzyme Commission (EC) number, experimental resolution, and verify the presence of co-crystallized small-molecule ligands.",
    inputs: [
      "Target Protein Name (e.g., Acetylcholinesterase, BACE1)",
      "EC Number Filter (Enzyme Commission)",
      "Polymer Entity Type (Protein, DNA, RNA, Hybrid)",
      "Experimental Method (X-ray, Cryo-EM, NMR)",
      "Resolution Cutoff (≤ 2.5 Å recommended)",
      "Must-have Ligand Checkbox"
    ],
    outputs: [
      "Target PDB Archive (datasets/PDB/<target>/)",
      "Interactive 3D Protein-Ligand Viewer",
      "Metadata CSV & ZIP Download"
    ],
    href: "/pdb",
    ctaText: "Explore PDB Module →"
  },
  {
    id: 2,
    badge: "Step 02 · Bioactivity Mining",
    title: "ChEMBL Bioactive Compound Extraction",
    subtitle: "Harvest Experimental Binding & Inhibition Assays",
    description:
      "Gather known small-molecule modulators and quantitative experimental bioactivity metrics against your therapeutic targets. Filter by assay endpoint types (IC50, Ki, Kd, EC50) to build robust reference compound decks for QSAR or benchmarking.",
    inputs: [
      "Target Name or ChEMBL Target ID",
      "Bioactivity Metrics (IC50, Ki, Kd, EC50)",
      "Activity Thresholds & Units"
    ],
    outputs: [
      "Canonical SMILES & 2D RDKit Renderings",
      "Automated Morgan/ECFP4 Chemical Fingerprints",
      "Curated Bioactivity CSV Datasets"
    ],
    href: "/chembl",
    ctaText: "Mine ChEMBL Assays →"
  },
  {
    id: 3,
    badge: "Step 03 · Custom Library Curation",
    title: "ZINC & Custom Screening Decks",
    subtitle: "Upload & Preprocess Proprietary Compound Libraries",
    description:
      "Integrate custom compound libraries, commercial screening catalogs, or synthetic candidates. The platform automatically sanitizes uploaded structure files, validates chemistry, and computes molecular fingerprints.",
    inputs: [
      "Structure Files (.sdf, .mol, .smi, .csv)",
      "Target Directory & Dataset Labeling"
    ],
    outputs: [
      "Sanitized ZINC Datasets (datasets/ZINC/)",
      "Precomputed Chemical Fingerprints (.pkl)",
      "Interactive Multi-Molecule File Browser"
    ],
    href: "/zinc",
    ctaText: "Upload Libraries in ZINC →"
  },
  {
    id: 4,
    badge: "Step 04 · Chemical Space Networking",
    title: "Network Similarity & Scaffold Clustering",
    subtitle: "Map Chemical Relationships & Prune Redundancies",
    description:
      "Compute pairwise Tanimoto similarity matrices across curated ChEMBL or ZINC compound libraries. Visualize molecular relationships via interactive 2D/3D force-directed graphs, isolate maximum connected components, and identify dominant chemical scaffolds.",
    inputs: [
      "Dataset Selection (ChEMBL or ZINC Targets)",
      "Tanimoto Similarity Metric & Threshold (e.g., ≥ 0.70)",
      "Clustering Algorithm Parameters"
    ],
    outputs: [
      "2D/3D Interactive Force-Directed Network Graph",
      "Degree Distribution & Scaffold Clustering Analysis",
      "Maximum Connected Component Isolation"
    ],
    href: "/analysis",
    ctaText: "Launch Network Analysis →"
  },
  {
    id: 5,
    badge: "Step 05 · Structure-Based Docking & ADMET",
    title: "AutoDock Vina Redocking & ADMET Profiling",
    subtitle: "Validate Ligand Binding & Pharmacokinetics",
    description:
      "Validate ligand binding poses and screen lead candidates. Execute non-blocking AutoDock Vina redocking simulations to tabulate binding affinities (kcal/mol) and RMSD values. Profile pharmacokinetic properties (BBB+, HIA+, PGP+) via BOILED-Egg visualizations.",
    inputs: [
      "Target PDB Structure Selection",
      "Ligand Selection / Automatic PDB Extraction",
      "ADMET Lead Candidate SMILES"
    ],
    outputs: [
      "Real-Time Docking Execution Logs & Progress",
      "Affinity (kcal/mol) & RMSD Validation Table",
      "ADMET Pharmacokinetic BOILED-Egg Report"
    ],
    href: "/analysis",
    ctaText: "Run Docking & ADMET Suite →"
  }
];

export default function Home() {
  const [activeStepId, setActiveStepId] = useState<number>(1);
  const activeStep = WORKFLOW_STEPS.find((s) => s.id === activeStepId) || WORKFLOW_STEPS[0];

  return (
    <main style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div className="home-guide-container">
        {/* HERO SECTION */}
        <section className="guide-hero">
          <div className="guide-hero-badge">
            <i className="fas fa-microscope" /> Official Platform User Guide · v2.0
          </div>
          <h2>Welcome to BioMolExplorer 2.0</h2>
          <p>
            An integrated, full-stack scientific workbench designed for structural biology mining,
            small-molecule bioactivity curation, chemical space network analysis, and structure-based
            molecular docking simulations.
          </p>

          <div className="hero-feature-tags">
            <div className="hero-tag">
              <i className="fas fa-dna" /> PDB 3D Macromolecules
            </div>
            <div className="hero-tag">
              <i className="fas fa-flask" /> ChEMBL Bioactivity Mining
            </div>
            <div className="hero-tag">
              <i className="fas fa-folder-open" /> ZINC Custom Decks
            </div>
            <div className="hero-tag">
              <i className="fas fa-project-diagram" /> Tanimoto Network Graphs
            </div>
            <div className="hero-tag">
              <i className="fas fa-atom" /> AutoDock Vina Redocking
            </div>
          </div>
        </section>

        {/* WORKFLOW PIPELINE SECTION */}
        <section className="workflow-pipeline-section">
          <div className="guide-section-header">
            <h3>Expected End-to-End Discovery Workflow</h3>
            <p>
              Follow our structured 5-step computational pipeline from target structure identification
              to lead candidate validation. Click any step below to explore its instructions and deliverables.
            </p>
          </div>

          <div className="workflow-steps-ribbon">
            {WORKFLOW_STEPS.map((step) => {
              const isActive = step.id === activeStepId;
              return (
                <button
                  key={step.id}
                  type="button"
                  className={`workflow-step-tab ${isActive ? "active" : ""}`}
                  onClick={() => setActiveStepId(step.id)}
                >
                  <span className="workflow-step-num">Step 0{step.id}</span>
                  <span className="workflow-step-title">{step.title}</span>
                </button>
              );
            })}
          </div>

          <div className="workflow-step-detail-card">
            <div className="workflow-step-detail-content">
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  color: "#705d9d",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "8px"
                }}
              >
                {activeStep.badge}
              </div>
              <h4>{activeStep.subtitle}</h4>
              <p>{activeStep.description}</p>

              <div style={{ marginBottom: "1rem" }}>
                <strong style={{ display: "block", fontSize: "0.9rem", color: "#47366d", marginBottom: "8px" }}>
                  Required Inputs & Parameters:
                </strong>
                <div className="workflow-step-highlights">
                  {activeStep.inputs.map((inp, idx) => (
                    <span key={idx} className="step-highlight-badge">
                      <i className="fas fa-check-circle" style={{ color: "#47366d", marginRight: "6px" }} />
                      {inp}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <strong style={{ display: "block", fontSize: "0.9rem", color: "#1e8449", marginBottom: "8px" }}>
                  Automated Processing & Deliverables:
                </strong>
                <div className="workflow-step-highlights">
                  {activeStep.outputs.map((out, idx) => (
                    <span
                      key={idx}
                      className="step-highlight-badge"
                      style={{ borderColor: "#cbecdc", background: "#e9f7ef", color: "#1e8449" }}
                    >
                      <i className="fas fa-database" style={{ color: "#27ae60", marginRight: "6px" }} />
                      {out}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Link href={activeStep.href} className="workflow-step-cta">
                <span>{activeStep.ctaText}</span>
                <i className="fas fa-arrow-right" />
              </Link>
            </div>
          </div>
        </section>

        {/* MODULE CARDS GRID SECTION */}
        <section>
          <div className="guide-section-header">
            <h3>Platform Page Reference & Module Manual</h3>
            <p>
              Detailed reference guide covering what each page does, what parameters to enter, and what
              outputs are generated.
            </p>
          </div>

          <div className="module-cards-grid">
            {/* CARD 1: PDB EXPLORER */}
            <div className="module-guide-card">
              <div className="module-card-header">
                <div className="module-card-header-left">
                  <div className="module-icon-box">
                    <i className="fas fa-dna" />
                  </div>
                  <div className="module-title-wrap">
                    <h4>PDB Explorer</h4>
                    <span>Route: /pdb</span>
                  </div>
                </div>
              </div>

              <div className="module-card-body">
                <p className="module-purpose">
                  Search, filter, and download 3D macromolecular structures from the Protein Data Bank.
                  Inspect protein chains, co-crystallized ligands, and crystal resolutions directly in the browser.
                </p>

                <div className="module-section-box">
                  <h5>
                    <i className="fas fa-sliders-h" /> What to Enter (Inputs & Filters)
                  </h5>
                  <div className="input-badge-list">
                    <span className="param-badge">Target Name (e.g. AChE)</span>
                    <span className="param-badge">EC Number</span>
                    <span className="param-badge">Polymer Type</span>
                    <span className="param-badge">Exp. Method</span>
                    <span className="param-badge">Max Resolution (Å)</span>
                    <span className="param-badge">Must-have Ligand</span>
                  </div>
                </div>

                <div className="module-section-box">
                  <h5>
                    <i className="fas fa-file-export" /> Outputs & Deliverables
                  </h5>
                  <div className="input-badge-list">
                    <span className="output-badge">datasets/PDB/ Target Folder</span>
                    <span className="output-badge">Interactive 3D Mol Viewer</span>
                    <span className="output-badge">Curated PDB & CSV Metadata</span>
                  </div>
                </div>
              </div>

              <div className="module-card-footer">
                <Link href="/pdb" className="module-nav-btn">
                  <span>Open PDB Explorer</span>
                  <i className="fas fa-chevron-right" />
                </Link>
              </div>
            </div>

            {/* CARD 2: CHEMBL BROWSER */}
            <div className="module-guide-card">
              <div className="module-card-header">
                <div className="module-card-header-left">
                  <div className="module-icon-box">
                    <i className="fas fa-flask" />
                  </div>
                  <div className="module-title-wrap">
                    <h4>ChEMBL Bioactivity Browser</h4>
                    <span>Route: /chembl</span>
                  </div>
                </div>
              </div>

              <div className="module-card-body">
                <p className="module-purpose">
                  Mine experimental bioactivity datasets ($IC_{"{50}"}$, $K_i$, $K_d$) from the ChEMBL database.
                  Automatically extract canonical SMILES and generate Morgan fingerprints for downstream modeling.
                </p>

                <div className="module-section-box">
                  <h5>
                    <i className="fas fa-sliders-h" /> What to Enter (Inputs & Filters)
                  </h5>
                  <div className="input-badge-list">
                    <span className="param-badge">Target Protein or ChEMBL ID</span>
                    <span className="param-badge">Standard Bioactivity Type (IC50, Ki)</span>
                    <span className="param-badge">Activity Value Threshold</span>
                  </div>
                </div>

                <div className="module-section-box">
                  <h5>
                    <i className="fas fa-file-export" /> Outputs & Deliverables
                  </h5>
                  <div className="input-badge-list">
                    <span className="output-badge">datasets/ChEMBL/ Folder</span>
                    <span className="output-badge">RDKit 2D Molecule Renderings</span>
                    <span className="output-badge">ECFP4 / Morgan Fingerprints</span>
                  </div>
                </div>
              </div>

              <div className="module-card-footer">
                <Link href="/chembl" className="module-nav-btn">
                  <span>Open ChEMBL Browser</span>
                  <i className="fas fa-chevron-right" />
                </Link>
              </div>
            </div>

            {/* CARD 3: ZINC ARCHIVE */}
            <div className="module-guide-card">
              <div className="module-card-header">
                <div className="module-card-header-left">
                  <div className="module-icon-box">
                    <i className="fas fa-folder-open" />
                  </div>
                  <div className="module-title-wrap">
                    <h4>ZINC Archive & Custom Libraries</h4>
                    <span>Route: /zinc</span>
                  </div>
                </div>
              </div>

              <div className="module-card-body">
                <p className="module-purpose">
                  Upload custom compound libraries, synthetic decks, or commercial catalogs. Provides
                  automated structure sanitization, RDKit parsing, and file management.
                </p>

                <div className="module-section-box">
                  <h5>
                    <i className="fas fa-sliders-h" /> What to Enter (Inputs & Filters)
                  </h5>
                  <div className="input-badge-list">
                    <span className="param-badge">Structure Upload (.sdf, .mol, .smi, .csv)</span>
                    <span className="param-badge">Target Directory Assignment</span>
                  </div>
                </div>

                <div className="module-section-box">
                  <h5>
                    <i className="fas fa-file-export" /> Outputs & Deliverables
                  </h5>
                  <div className="input-badge-list">
                    <span className="output-badge">datasets/ZINC/ Curated Archive</span>
                    <span className="output-badge">Precomputed Fingerprints (.pkl)</span>
                    <span className="output-badge">Structure File Manager</span>
                  </div>
                </div>
              </div>

              <div className="module-card-footer">
                <Link href="/zinc" className="module-nav-btn">
                  <span>Open ZINC Archive</span>
                  <i className="fas fa-chevron-right" />
                </Link>
              </div>
            </div>

            {/* CARD 4: ANALYSIS SUITE */}
            <div className="module-guide-card">
              <div className="module-card-header">
                <div className="module-card-header-left">
                  <div className="module-icon-box">
                    <i className="fas fa-project-diagram" />
                  </div>
                  <div className="module-title-wrap">
                    <h4>Scientific Analysis Hub</h4>
                    <span>Route: /analysis</span>
                  </div>
                </div>
              </div>

              <div className="module-card-body">
                <p className="module-purpose">
                  Comprehensive suite integrating Tanimoto chemical space network visualization, non-blocking
                  AutoDock Vina redocking simulations, and ADMET pharmacokinetic profiling.
                </p>

                <div className="module-section-box">
                  <h5>
                    <i className="fas fa-sliders-h" /> Sub-Modules & Configurations
                  </h5>
                  <div className="input-badge-list">
                    <span className="param-badge">Network Similarity Metric & Cutoff</span>
                    <span className="param-badge">AutoDock Vina Target Selection</span>
                    <span className="param-badge">ADMET SMILES Screening</span>
                  </div>
                </div>

                <div className="module-section-box">
                  <h5>
                    <i className="fas fa-file-export" /> Outputs & Deliverables
                  </h5>
                  <div className="input-badge-list">
                    <span className="output-badge">2D/3D Force-Directed Graphs</span>
                    <span className="output-badge">RMSD & Binding Affinity (kcal/mol)</span>
                    <span className="output-badge">BOILED-Egg Pharmacokinetic Plots</span>
                  </div>
                </div>
              </div>

              <div className="module-card-footer">
                <Link href="/analysis" className="module-nav-btn">
                  <span>Open Analysis Hub</span>
                  <i className="fas fa-chevron-right" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* BEST PRACTICES & SYSTEM GUIDELINES */}
        <section className="guide-best-practices">
          <div style={{ textAlign: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.8rem", color: "white", margin: "0 0 0.5rem", fontWeight: 800 }}>
              Researcher Best Practices & System Guidelines
            </h3>
            <p style={{ color: "rgba(255, 255, 255, 0.85)", maxWidth: "700px", margin: "0 auto" }}>
              Key recommendations to ensure reproducible analyses and smooth platform performance.
            </p>
          </div>

          <div className="best-practices-grid">
            <div className="best-practice-card">
              <h5>
                <i className="fas fa-sync-alt" /> On-Demand Graph Caching
              </h5>
              <p>
                Chemical similarity networks are cached to avoid unnecessary computation. If you download new
                ChEMBL or ZINC molecules, the system detects modified timestamps and prompts a manual graph recalculation.
              </p>
            </div>

            <div className="best-practice-card">
              <h5>
                <i className="fas fa-microchip" /> Asynchronous Redocking
              </h5>
              <p>
                AutoDock Vina runs non-blocking simulations in background workers. You can monitor live execution
                logs in real time and export tabulated RMSD and energy scores to CSV upon completion.
              </p>
            </div>

            <div className="best-practice-card">
              <h5>
                <i className="fas fa-shield-alt" /> Automated File Cleanup
              </h5>
              <p>
                When deleting datasets or records from tables, BioMolExplorer automatically removes underlying `.pdb`
                and `.sdf` files to keep your local workspace clean and synchronized.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* PARTNERS SECTION */}
      <section className="partners">
        <div className="partners-inner">
          <ul className="logo-grid">
            <li>
              <a href="https://www.cefetmg.br/" target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src="img/partness/cefet.png" alt="CEFET-MG" />
              </a>
            </li>
            <li>
              <a href="https://fapemig.br/" target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src="img/partness/fapemig.png" alt="FAPEMIG" />
              </a>
            </li>
            <li>
              <a href="https://www.ufsj.edu.br/" target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src="img/partness/ufsj.jpg" alt="UFSJ" />
              </a>
            </li>
            <li>
              <a href="https://www.gov.br/cnpq/pt-br" target="_blank" rel="noopener noreferrer">
                <img loading="lazy" src="img/partness/cnpq.jpg" alt="CNPq" />
              </a>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}