'use client';
import { useState, FormEvent, useEffect } from 'react';

export default function ZincPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [datasets, setDatasets] = useState<Record<string, string[]>>({});
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});

  const fetchFiles = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/files/list/ZINC');
      setDatasets(await res.json());
    } catch (e) {}
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    await fetch('http://localhost:3001/api/zinc/upload', {
      method: 'POST', body: new FormData(e.currentTarget)
    });
    setIsLoading(false);
    fetchFiles();
  };

  const toggleAccordion = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));
  const handleDelete = async (target: string) => {
    if(!confirm(`Excluir dados de ${target}?`)) return;
    await fetch(`http://localhost:3001/api/files/delete/ZINC/${target}`, { method: 'DELETE' });
    fetchFiles();
  };
  const handleDownload = (target: string, file: string) => {
    window.open(`http://localhost:3001/api/files/download/ZINC/${target}/${file}`, '_blank');
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
                <button type="submit" style={{width:'100%', marginTop:'10px'}}>Download</button>
              </fieldset>
            </form>
          </div>

          <div className="pdb-list-container">
            <h3>Dados ZINC</h3>
            <div id="zinc-list">
              {Object.entries(datasets).map(([target, files]) => (
                <div key={target} style={{marginBottom: '5px'}}>
                  <button className={`collapsible-header ${openTargets[target] ? 'active' : ''}`} type="button" onClick={() => toggleAccordion(target)}>
                    {target} ({files.length}) <span className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(target); }}>🗑️</span>
                  </button>
                  {openTargets[target] && (
                    <div style={{ border: '1px solid #ddd', padding: '10px', background: '#fff' }}>
                      {files.map(file => (
                        <div key={file} className="pdb-file-item"><span>📄 {file}</span><button type="button" onClick={() => handleDownload(target, file)} className="download-btn">⬇️</button></div>
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