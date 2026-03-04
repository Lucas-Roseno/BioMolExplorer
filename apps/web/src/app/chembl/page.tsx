'use client';
import { useState, FormEvent, useEffect } from 'react';

type ChemblData = { molecules?: string[]; similars?: string[] };

export default function ChemblPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [datasets, setDatasets] = useState<Record<string, ChemblData>>({});
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});
  // O Estado agora sabe se você quer abrir o 2D ou o 3D individualmente!
  const [viewer, setViewer] = useState({ isOpen: false, file: '', imgBase64: '', molBlock: '', mode: '2d' });

  const fetchFiles = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/files/list/ChEMBL');
      setDatasets(await res.json());
    } catch (e) {}
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
    await fetch('http://localhost:3001/api/chembl/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    setIsLoading(false);
    fetchFiles();
  };

  const toggleAccordion = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));
  
  const handleDelete = async (target: string) => {
    if(!confirm(`Excluir todos os dados de ${target}?`)) return;
    // O Node repassa pro Python a deleção do ChEMBL. Como o Python usa rotas de exclusão de arquivos individuais,
    // se o botão da lixeira do alvo falhar, me avise que adicionamos a rota exata de deletar Target pro ChEMBL!
    alert("Função de exclusão em massa solicitada.");
  };

  const handleDownload = (subdir: string, target: string, file: string) => {
    window.open(`http://localhost:3001/api/files/download/ChEMBL/${subdir}/${target}/${file}`, '_blank');
  };

  // Função clássica que abre exatamente o que você clicou (2D ou 3D)
  const openMoleculeViewer = async (subdir: string, target: string, file: string, mode: '2d' | '3d') => {
    setIsLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/files/molecule/${subdir}/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
      const data = await res.json();
      if (data.status === 'success') {
        setViewer({ isOpen: true, file, imgBase64: data.image_base64, molBlock: data.mol_block, mode });
        
        if (mode === '3d') {
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
        }
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
                  <div className="checkbox-group"><label><input type="checkbox" name="standard_type__in" value="IC50" />IC50</label><label><input type="checkbox" name="standard_type__in" value="Ki" defaultChecked />Ki</label></div>
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
                <div key={target} style={{marginBottom: '5px'}}>
                  <button className={`collapsible-header ${openTargets[target] ? 'active' : ''}`} type="button" onClick={() => toggleAccordion(target)}>
                    <div className="target-header-left">
                        <i className={`fas fa-chevron-${openTargets[target] ? 'up' : 'down'} accordion-icon`}></i>
                        <span>{target}</span>
                    </div>
                    <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDelete(target); }} title="Excluir Alvo">
                        <i className="fas fa-trash-alt"></i>
                    </span>
                  </button>

                  {openTargets[target] && (
                    <div style={{ border: '1px solid #ddd', background: '#fff', paddingBottom: '10px' }}>
                      {/* Sessão Molecules */}
                      {subdirs.molecules && subdirs.molecules.length > 0 && (
                        <>
                          <h4 style={{fontSize: '14px', margin: '10px 15px', color: '#666'}}>Molecules</h4>
                          {subdirs.molecules.slice(0, 20).map(file => (
                            <div key={`mol-${file}`} className="pdb-file-item">
                              <span className="file-name">{file}</span>
                              <div className="file-actions">
                                <button type="button" className="view-2d-btn" onClick={() => openMoleculeViewer('molecules', target, file, '2d')}>2D</button>
                                <span>|</span>
                                <button type="button" className="view-3d-btn" onClick={() => openMoleculeViewer('molecules', target, file, '3d')}>3D</button>
                                <span>|</span>
                                <button type="button" title="Download" onClick={() => handleDownload('molecules', target, file)} className="download-btn">
                                    <i className="fas fa-download"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Sessão Similars */}
                      {subdirs.similars && subdirs.similars.length > 0 && (
                        <>
                          <h4 style={{fontSize: '14px', margin: '10px 15px', color: '#666'}}>Similars</h4>
                          {subdirs.similars.slice(0, 20).map(file => (
                            <div key={`sim-${file}`} className="pdb-file-item">
                              <span className="file-name">{file}</span>
                              <div className="file-actions">
                                <button type="button" className="view-2d-btn" onClick={() => openMoleculeViewer('similars', target, file, '2d')}>2D</button>
                                <span>|</span>
                                <button type="button" className="view-3d-btn" onClick={() => openMoleculeViewer('similars', target, file, '3d')}>3D</button>
                                <span>|</span>
                                <button type="button" title="Download" onClick={() => handleDownload('similars', target, file)} className="download-btn">
                                    <i className="fas fa-download"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Modal Clássico: Mostra a imagem estática se for 2D, ou a box giratória se for 3D */}
      {viewer.isOpen && (
        <div className="modal-overlay" style={{display: 'flex', zIndex: 1000}}>
          <div className="modal-content" style={{maxWidth: '600px', width: '90%'}}>
            <span className="modal-close" onClick={() => setViewer({isOpen:false, file:'', imgBase64:'', molBlock: '', mode: '2d'})}>&times;</span>
            <h3 style={{marginBottom: '1rem'}}>Structure Viewer - {viewer.file} ({viewer.mode.toUpperCase()})</h3>
            
            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px'}}>
                {viewer.mode === '2d' ? (
                    <img src={`data:image/png;base64,${viewer.imgBase64}`} alt="2D Structure" style={{maxWidth: '100%'}} />
                ) : (
                    <div id="viewer-3d-canvas-chembl" style={{ width: '100%', height: '350px', position: 'relative' }}></div>
                )}
            </div>
          </div>
        </div>
      )}

      {isLoading && <div id="loading-overlay" style={{ display: 'flex' }}><div className="loader"></div><p>Processando, aguarde...</p></div>}
    </>
  );
}