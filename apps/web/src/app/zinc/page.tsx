'use client';
import { useState, FormEvent, useEffect } from 'react';

export default function ZincPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [datasets, setDatasets] = useState<Record<string, string[]>>({});
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});

  const fetchFiles = async () => {
    try {
      const res = await fetch('${API_BASE_URL}/api/files/list/ZINC');
      setDatasets(await res.json());
    } catch (e) { }
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    await fetch('${API_BASE_URL}/api/zinc/upload', {
      method: 'POST', body: new FormData(e.currentTarget)
    });
    setIsLoading(false);
    fetchFiles();
  };

  const toggleAccordion = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));
  const handleDelete = async (target: string) => {
    if (!confirm(`Excluir dados de ${target}?`)) return;
    await fetch(`${API_BASE_URL}/api/files/delete/ZINC/${target}`, { method: 'DELETE' });
    fetchFiles();
  };
  const handleDownloadTarget = (target: string) => {
    window.open(`${API_BASE_URL}/api/files/download/ZINC/zip/${target}`, '_blank');
  };
  const handleDownload = (target: string, file: string) => {
    window.open(`${API_BASE_URL}/api/files/download/ZINC/${file}`, '_blank');
  };
  const handleDeleteFile = async (target: string, file: string) => {
    if (!confirm(`Excluir arquivo ${file}?`)) return;
    await fetch(`${API_BASE_URL}/api/files/delete/ZINC/${file}`, { method: 'DELETE' });
    fetchFiles();
  };

  return (
    <>
      <div className="container">
        <h2 className="page-title">ZINC Loader</h2>
        <div className="pdb-flex-layout">
          <div className="form-container compact-container">
            <form id="zinc-form" onSubmit={handleSearch}>
              <fieldset><legend>Upload (.uri)</legend>
                <div className="form-group compact-form-group">
                  <label>Arquivo URI:</label><input type="file" name="zinc_file" accept=".uri" required />
                </div>
                <div className="form-group"><label><input type="checkbox" name="verbose" /> Verbose Mode</label></div>
                <button type="submit" style={{ width: '100%', marginTop: '10px' }}>Download</button>
              </fieldset>
            </form>
          </div>

          <div className="pdb-list-container">
            <h3>Dados ZINC</h3>
            <div id="zinc-list">
              {Object.entries(datasets).map(([target, files]) => (
                <div key={target} style={{ marginBottom: '5px' }}>
                  <button className={`collapsible-header ${openTargets[target] ? 'active' : ''}`} type="button" onClick={() => toggleAccordion(target)}>
                    <div className="target-header-left">
                      <span>{target} ({files.length})</span>
                    </div>
                    <div className="target-header-right">
                      <span className="download-target-btn" onClick={(e) => { e.stopPropagation(); handleDownloadTarget(target); }} title="Baixar Alvo" style={{ marginRight: '10px' }}>
                        <i className="fas fa-download"></i>
                      </span>
                      <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDelete(target); }} title="Excluir Alvo">
                        <i className="fas fa-trash-alt"></i>
                      </span>
                    </div>
                  </button>
                  {openTargets[target] && (
                    <div style={{ border: '1px solid #ddd', padding: '10px', background: '#fff' }}>
                      {files.map(file => (
                        <div key={file} className="pdb-file-item">
                          <span><i className="fas fa-file-alt" style={{ marginRight: '8px' }}></i>{file}</span>
                          <div className="file-actions">
                            <button type="button" onClick={() => handleDownload(target, file)} className="download-btn" title="Download">
                              <i className="fas fa-download"></i>
                            </button>
                            <span>|</span>
                            <button type="button" onClick={() => handleDeleteFile(target, file)} className="delete-btn" title="Excluir">
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
      {isLoading && <div id="loading-overlay" style={{ display: 'flex' }}><div className="loader"></div><p>Baixando ZINC...</p></div>}
    </>
  );
}