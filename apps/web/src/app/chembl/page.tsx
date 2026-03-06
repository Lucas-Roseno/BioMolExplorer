'use client';
import { useState, FormEvent, useEffect } from 'react';
import './chembl.css';
import { API_BASE_URL } from '../../config';

type ChemblData = { molecules?: string[]; similars?: string[] };

export default function ChemblPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [datasets, setDatasets] = useState<Record<string, ChemblData>>({});
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});
  const [openSubdirs, setOpenSubdirs] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState({ isOpen: false, file: '', imgBase64: '', molBlock: '', mode: 'both' });

  const fetchFiles = async () => {
    try {
      const res = await fetch('${API_BASE_URL}/api/files/list/ChEMBL');
      setDatasets(await res.json());
    } catch (e) { }
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      target_name: fd.get('target_name'), organism: fd.get('organism'),
      standard_type__in: fd.getAll('standard_type__in'), max_value_ref: fd.get('max_value_ref'),
      similarity: fd.get('similarity'), molecule_weight: fd.get('molecule_weight'),
      natural_product_molecules: fd.get('natural_product_molecules') === 'on'
    };
    await fetch('${API_BASE_URL}/api/chembl/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    setIsLoading(false);
    fetchFiles();
  };

  const toggleTarget = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));
  const toggleSubdir = (t: string, s: string) => setOpenSubdirs(p => ({ ...p, [`${t}-${s}`]: !p[`${t}-${s}`] }));

  const handleDeleteTarget = async (target: string) => {
    if (!confirm(`Excluir todos os dados de ${target}?`)) return;
    await fetch(`${API_BASE_URL}/api/files/delete/ChEMBL/target/${target}`, { method: 'DELETE' });
    fetchFiles();
  };

  const handleDownloadTarget = (target: string) => {
    window.open(`${API_BASE_URL}/api/files/download/ChEMBL/zip/${target}`, '_blank');
  };

  const handleDeleteSubdir = async (subdir: string, target: string) => {
    if (!confirm(`Excluir pasta ${subdir} de ${target}?`)) return;
    await fetch(`${API_BASE_URL}/api/files/delete/ChEMBL/category/${subdir}/${target}`, { method: 'DELETE' });
    fetchFiles();
  };

  const handleDownloadSubdir = (subdir: string, target: string) => {
    window.open(`${API_BASE_URL}/api/files/download/ChEMBL/category/zip/${subdir}/${target}`, '_blank');
  };

  const handleDeleteFile = async (subdir: string, target: string, file: string) => {
    if (!confirm(`Excluir arquivo ${file}?`)) return;
    await fetch(`${API_BASE_URL}/api/files/delete/ChEMBL/file/${subdir}/${target}/${file}`, { method: 'DELETE' });
    fetchFiles();
  };

  const handleDownloadFile = (subdir: string, target: string, file: string) => {
    window.open(`${API_BASE_URL}/api/files/download/ChEMBL/${subdir}/${target}/${file}`, '_blank');
  };

  const openMoleculeViewer = async (subdir: string, target: string, file: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/molecule/${subdir}/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
      const data = await res.json();
      if (data.status === 'success') {
        setViewer({ isOpen: true, file, imgBase64: data.image_base64, molBlock: data.mol_block, mode: 'both' });

        setTimeout(() => {
          const element = document.getElementById('viewer-3d-canvas-chembl');
          if (element && (window as any).$3Dmol && data.mol_block) {
            element.innerHTML = '';
            let v = (window as any).$3Dmol.createViewer(element, { backgroundColor: 'white' });
            v.addModel(data.mol_block, "sdf");
            v.setStyle({}, { stick: {} });
            v.zoomTo(); v.render();
          }
        }, 200);
      } else {
        alert("Erro ao gerar visualização: " + data.message);
      }
    } catch (e) {
      alert("Erro de conexão ao gerar molécula.");
    }
    setIsLoading(false);
  };

  return (
    <>
      <div className="container">
        <h2 className="page-title">ChEMBL Loader</h2>
        <div className="pdb-flex-layout">
          <div className="form-container">
            <form id="chembl-form" onSubmit={handleSearch}>
              <div className="fieldset-row">
                <fieldset><legend>Target Search</legend><div className="form-group"><label>Target Name</label><input type="text" name="target_name" placeholder="e.g., Acetylcholinesterase" required /></div></fieldset>
                <fieldset><legend>Target Parameters</legend><div className="form-group"><label>Organism</label><input type="text" name="organism" defaultValue="Homo sapiens" /></div></fieldset>
              </div>
              <fieldset><legend>Bioactivity</legend><div className="form-group"><label>Standard Type</label>

                <div className="checkbox-group">
                  <label><input type="checkbox" name="standard_type__in" value="IC50" />IC50</label>
                  <label><input type="checkbox" name="standard_type__in" value="No. of survivors" />No. of survivors</label>
                  <label><input type="checkbox" name="standard_type__in" value="Inhibition" />Inhibition</label>
                  <label><input type="checkbox" name="standard_type__in" value="Activity" />Activity</label>
                  <label><input type="checkbox" name="standard_type__in" value="Ki" defaultChecked />Ki</label>
                  <label><input type="checkbox" name="standard_type__in" value="Survival" />Survival</label>
                  <label><input type="checkbox" name="standard_type__in" value="Kd" />Kd</label>
                  <label><input type="checkbox" name="standard_type__in" value="Km" />Km</label>
                  <label><input type="checkbox" name="standard_type__in" value="Imax" />Imax</label>
                  <label><input type="checkbox" name="standard_type__in" value="Reversibility" />Reversibility</label>
                  <label><input type="checkbox" name="standard_type__in" value="Ratio" />Ratio</label>
                  <label><input type="checkbox" name="standard_type__in" value="Concentration" />Concentration</label>
                  <label><input type="checkbox" name="standard_type__in" value="Ratio IC50" />Ratio IC50</label>
                </div>

              </div><div className="form-group"><label>Max Value (nM)</label><input type="number" name="max_value_ref" defaultValue="1000" /></div>
              </fieldset>
              <div className="fieldset-row">
                <fieldset><legend>Molecules</legend><div className="form-group"><label>Natural Product</label><input type="checkbox" name="natural_product_molecules" /></div></fieldset>
                <fieldset><legend>Similar Mols</legend><div className="form-group"><label>Similarity (%)</label><input type="number" name="similarity" defaultValue="60" /><label>Max Weight</label><input type="number" name="molecule_weight" defaultValue="500" /></div></fieldset>
              </div>
              <button type="submit">Download</button>
            </form>
          </div>

          <div className="pdb-list-container">
            <h3>Downloaded ChEMBL Files</h3>
            <div id="chembl-list">
              {Object.entries(datasets).map(([target, subdirs]) => (
                <div key={target} style={{ marginBottom: '5px' }}>
                  <button className={`collapsible-header ${openTargets[target] ? 'active' : ''}`} type="button" onClick={() => toggleTarget(target)}>
                    <div className="target-header-left">
                      <i className={`fas fa-chevron-right accordion-icon chembl-arrow ${openTargets[target] ? 'open' : ''}`}></i>
                      <span>{target}</span>
                    </div>
                    <div className="target-header-right">
                      <span className="download-target-btn" onClick={(e) => { e.stopPropagation(); handleDownloadTarget(target); }} title="Baixar Alvo" style={{ marginRight: '10px' }}>
                        <i className="fas fa-download"></i>
                      </span>
                      <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDeleteTarget(target); }} title="Excluir Alvo">
                        <i className="fas fa-trash-alt"></i>
                      </span>
                    </div>
                  </button>

                  {openTargets[target] && (
                    <div className="chembl-folder-content">
                      {(['molecules', 'similars'] as const).map(subdir => {
                        const files = subdirs[subdir as keyof ChemblData];
                        if (!files || files.length === 0) return null;
                        const isOpen = openSubdirs[`${target}-${subdir}`];
                        return (
                          <div key={subdir} className="chembl-subdir">
                            <button className={`collapsible-header subdir-header ${isOpen ? 'active' : ''}`} type="button" onClick={() => toggleSubdir(target, subdir)}>
                              <div className="target-header-left">
                                <i className={`fas fa-chevron-right accordion-icon chembl-arrow ${isOpen ? 'open' : ''}`}></i>
                                <span style={{ textTransform: 'capitalize' }}>{subdir}</span>
                              </div>
                              <div className="target-header-right">
                                <span className="download-target-btn" onClick={(e) => { e.stopPropagation(); handleDownloadSubdir(subdir, target); }} title="Baixar Pasta" style={{ marginRight: '10px' }}>
                                  <i className="fas fa-download"></i>
                                </span>
                                <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDeleteSubdir(subdir, target); }} title="Excluir Pasta">
                                  <i className="fas fa-trash-alt"></i>
                                </span>
                              </div>
                            </button>
                            {isOpen && (
                              <div className="chembl-file-list">
                                {files.slice(0, 20).map(file => (
                                  <div key={file} className="pdb-file-item">
                                    <span
                                      className="molecule-link"
                                      title="Visualizar molécula em 2D/3D"
                                      onClick={() => openMoleculeViewer(subdir, target, file)}
                                    >
                                      <i className="fas fa-file-csv" style={{ color: '#888', marginRight: '8px' }}></i>
                                      {file}
                                    </span>
                                    <div className="file-actions">
                                      <button type="button" title="Download" onClick={() => handleDownloadFile(subdir, target, file)} className="download-btn">
                                        <i className="fas fa-download"></i>
                                      </button>
                                      <span>|</span>
                                      <button type="button" title="Excluir" onClick={() => handleDeleteFile(subdir, target, file)} className="delete-btn">
                                        <i className="fas fa-trash-alt"></i>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal 2D & 3D */}
      {viewer.isOpen && (
        <div className="modal-overlay" style={{ display: 'flex', zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '900px', width: '95%' }}>
            <span className="modal-close" onClick={() => setViewer({ isOpen: false, file: '', imgBase64: '', molBlock: '', mode: 'both' })}>&times;</span>
            <h3 style={{ marginBottom: '0' }}>Structure Viewer - {viewer.file}</h3>

            <div className="viewer-flex">
              <div className="viewer-col">
                <h4 style={{ marginBottom: '10px', color: '#555' }}>2D Structure</h4>
                <img src={`data:image/png;base64,${viewer.imgBase64}`} alt="2D Structure" style={{ maxWidth: '100%', maxHeight: '350px' }} />
              </div>
              <div className="viewer-col">
                <h4 style={{ marginBottom: '10px', color: '#555' }}>3D Structure</h4>
                <div id="viewer-3d-canvas-chembl" style={{ width: '100%', height: '350px', position: 'relative' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && <div id="loading-overlay" style={{ display: 'flex' }}><div className="loader"></div><p>Processando, aguarde...</p></div>}
    </>
  );
}