'use client';
import { useState, FormEvent, useEffect } from 'react';
import './pdb.css';
import { API_BASE_URL } from '../../config';

export default function PdbPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [datasets, setDatasets] = useState<Record<string, string[]>>({});
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState({ isOpen: false, file: '' });

  const fetchFiles = async () => {
    try {
      const res = await fetch('${API_BASE_URL}/api/files/list/PDB');
      setDatasets(await res.json());
    } catch (e) { }
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.must_have_ligand = payload.must_have_ligand === 'on' ? 'true' : 'false';

    await fetch('${API_BASE_URL}/api/pdb/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    setIsLoading(false);
    fetchFiles();
  };

  const toggleAccordion = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));

  const handleDelete = async (target: string) => {
    if (!confirm(`Excluir todos os dados de ${target}?`)) return;
    await fetch(`${API_BASE_URL}/api/files/delete/PDB/${target}`, { method: 'DELETE' });
    fetchFiles();
  };

  const handleDownloadTarget = (target: string) => {
    window.open(`${API_BASE_URL}/api/files/download/PDB/zip/${target}`, '_blank');
  };

  const handleDeleteFile = async (target: string, file: string) => {
    if (!confirm(`Excluir arquivo ${file}?`)) return;
    await fetch(`${API_BASE_URL}/api/files/delete/PDB/file/${target}/${file}`, { method: 'DELETE' });
    fetchFiles();
  };

  const handleDownload = (target: string, file: string) => {
    window.open(`${API_BASE_URL}/api/files/download/PDB/${target}/${file}`, '_blank');
  };

  const open3DViewer = async (target: string, file: string) => {
    setViewer({ isOpen: true, file });
    const res = await fetch(`${API_BASE_URL}/api/files/pdb_content/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
    const pdbData = await res.text();
    setTimeout(() => {
      const element = document.getElementById('viewer-3d-canvas');
      if (element && (window as any).$3Dmol) {
        element.innerHTML = '';
        let v = (window as any).$3Dmol.createViewer(element, { backgroundColor: 'white' });
        v.addModel(pdbData, "pdb");
        v.setStyle({}, { cartoon: { color: 'spectrum' } });
        v.zoomTo(); v.render();
      }
    }, 200);
  };

  return (
    <>
      <div className="container">
        <h2 className="page-title">PDB Loader</h2>
        <div className="pdb-flex-layout">
          <div className="form-container">
            <form id="pdb-form" onSubmit={handleSearch}>
              <div className="form-group"><label>Target Name</label><input type="text" name="target" placeholder="e.g., Acetylcholinesterase" required /></div>
              <div className="form-group"><label>PDB EC Number</label><input type="text" name="pdb_ec" placeholder="e.g., 3.1.1.7" required /></div>
              <div className="form-group"><label>Polymer Entity Type</label>
                <select name="polymer_entity_type">
                  <option value="PROTEIN">Protein</option>
                  <option value="DNA">DNA</option>
                  <option value="RNA">RNA</option>
                  <option value="DNA_RNA_HYBRID">DNA/RNA Hybrid</option>
                  <option value="PEPTIDE_NUCLEIC_ACID">Peptide Nucleic Acid</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="form-group"><label>Experimental Method</label>
                <select name="experimental_method">
                  <option value="X_RAY_DIFFRACTION">X-Ray Diffraction</option>
                  <option value="ELECTRON_MICROSCOPY">Electron Microscopy</option>
                  <option value="SOLUTION_NMR">Solution NMR</option>
                  <option value="SOLID_STATE_NMR">Solid-State NMR</option>
                  <option value="NEUTRON_DIFFRACTION">Neutron Diffraction</option>
                  <option value="ELECTRON_CRYSTALLOGRAPHY">Electron Crystallography</option>
                  <option value="FIBER_DIFFRACTION">Fiber Diffraction</option>
                  <option value="EPR">EPR</option>
                  <option value="OTHER">Other</option>
                </select></div>
              <div className="form-group"><label>Max Resolution (Å)</label><input type="number" name="max_resolution" step="0.1" defaultValue="1.8" required /></div>
              <div className="form-group"><label><input type="checkbox" name="must_have_ligand" defaultChecked /> Must Have Ligand</label></div>
              <button type="submit">Download</button>
            </form>
          </div>
          <div className="pdb-list-container">
            <h3>Downloaded PDB Files</h3>
            <div id="pdb-list">
              {Object.entries(datasets).map(([target, files]) => (
                <div key={target} style={{ marginBottom: '5px' }}>
                  {/* Cabeçalho do Acordeão Clássico */}
                  <button className={`collapsible-header ${openTargets[target] ? 'active' : ''}`} type="button" onClick={() => toggleAccordion(target)}>
                    <div className="target-header-left">
                      <i className={`fas fa-chevron-${openTargets[target] ? 'up' : 'down'} accordion-icon`}></i>
                      <span>{target} ({files.length})</span>
                    </div>
                    <div className="target-header-right">
                      <span className="download-target-btn" onClick={(e) => { e.stopPropagation(); handleDownloadTarget(target); }} title="Baixar Alvo">
                        <i className="fas fa-download"></i>
                      </span>
                      <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDelete(target); }} title="Excluir Alvo" style={{ marginLeft: '10px' }}>
                        <i className="fas fa-trash-alt"></i>
                      </span>
                    </div>
                  </button>

                  {openTargets[target] && (
                    <div style={{ border: '1px solid #ddd', background: '#fff' }}>
                      {files.map(file => (
                        <div key={file} className="pdb-file-item">
                          <span
                            className="pdb-molecule-link"
                            title="Visualizar molécula em 3D"
                            onClick={() => open3DViewer(target, file)}
                          >
                            <i className="fas fa-file-alt" style={{ color: '#888', marginRight: '8px' }}></i>
                            {file}
                          </span>
                          <div className="file-actions">
                            <button type="button" title="Download" onClick={() => handleDownload(target, file)} className="download-btn">
                              <i className="fas fa-download"></i>
                            </button>
                            <span>|</span>
                            <button type="button" title="Excluir" onClick={() => handleDeleteFile(target, file)} className="delete-btn">
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal 3D */}
      {viewer.isOpen && (
        <div className="modal-overlay" style={{ display: 'flex', zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }}>
            <span className="modal-close" onClick={() => setViewer({ isOpen: false, file: '' })}>&times;</span>
            <h3 style={{ marginBottom: '1rem' }}>Structure Viewer - {viewer.file}</h3>
            <div id="viewer-3d-canvas" style={{ width: '100%', height: '400px', position: 'relative' }}></div>
          </div>
        </div>
      )}
      {isLoading && <div id="loading-overlay" style={{ display: 'flex' }}><div className="loader"></div><p>Downloading PDB data...</p></div>}
    </>
  );
}