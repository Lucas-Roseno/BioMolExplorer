'use client';
import { useState, FormEvent, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import LoadingOverlay from '../../components/LoadingOverlay';

import { useFiles } from '../../hooks/useFiles';

export default function ZincPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { datasets, fetchFiles } = useFiles<Record<string, string[]>>('/api/files/list/ZINC');
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/zinc/upload`, {
        method: 'POST', body: new FormData(e.currentTarget)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: data.data?.message || 'Download do ZINC concluído com sucesso!' });
      } else {
        const errMsg = data.message || 'Erro ao processar o arquivo ZINC.';
        // Check for common server-down patterns
        if (errMsg.toLowerCase().includes('connection') || errMsg.toLowerCase().includes('unreachable') || errMsg.toLowerCase().includes('offline')) {
          setMessage({ type: 'error', text: '⚠️ O servidor do ZINC (files.docking.org) está indisponível. Tente novamente mais tarde.' });
        } else {
          setMessage({ type: 'error', text: errMsg });
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: '⚠️ Não foi possível conectar ao servidor. Verifique se os serviços estão rodando.' });
    }
    setIsLoading(false);
    fetchFiles();
  };

  const toggleAccordion = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));
  const handleDelete = async (target: string) => {
    if (!confirm(`Delete data for ${target}?`)) return;
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
    if (!confirm(`Delete file ${file}?`)) return;
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
                  <label>URI File:</label><input type="file" name="zinc_file" accept=".uri" required />
                </div>
                <div className="form-group"><label><input type="checkbox" name="verbose" /> Verbose Mode</label></div>
                <button type="submit" style={{ width: '100%', marginTop: '10px' }}>Download</button>
              </fieldset>
            </form>
            {message && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
                color: message.type === 'success' ? '#155724' : '#721c24',
                border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
                fontSize: '14px'
              }}>
                {message.text}
              </div>
            )}
          </div>

          <div className="pdb-list-container">
            <h3>ZINC Data</h3>
            <div id="zinc-list">
              {Object.entries(datasets).map(([target, files]) => (
                <div key={target} style={{ marginBottom: '5px' }}>
                  <button className={`collapsible-header ${openTargets[target] ? 'active' : ''}`} type="button" onClick={() => toggleAccordion(target)}>
                    <div className="target-header-left">
                      <span>{target} ({files.length})</span>
                    </div>
                    <div className="target-header-right">
                      <span className="download-target-btn" onClick={(e) => { e.stopPropagation(); handleDownloadTarget(target); }} title="Download Target" style={{ marginRight: '10px' }}>
                        <i className="fas fa-download"></i>
                      </span>
                      <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDelete(target); }} title="Delete Target">
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
                            <button type="button" onClick={() => handleDeleteFile(target, file)} className="delete-btn" title="Delete">
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
      <LoadingOverlay isLoading={isLoading} />
    </>
  );
}