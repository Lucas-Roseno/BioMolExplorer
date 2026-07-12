'use client';
import { useState, FormEvent } from 'react';
import { API_BASE_URL } from '../../config';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useToast } from '../../components/ToastProvider';
import InfoTooltip from '../../components/InfoTooltip';
import { useFiles } from '../../hooks/useFiles';

export default function ZincPage() {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { datasets, fetchFiles } = useFiles<Record<string, string[]>>('/api/files/list/ZINC');
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/zinc/upload`, {
        method: 'POST', body: new FormData(e.currentTarget)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', 'Upload completed!', data.data?.message || 'ZINC compounds have been saved successfully.');
      } else {
        const errMsg = data.message || 'Error processing ZINC file.';
        // Check for common server-down patterns
        if (errMsg.toLowerCase().includes('connection') || errMsg.toLowerCase().includes('unreachable') || errMsg.toLowerCase().includes('offline')) {
          showToast('warning', 'ZINC server unavailable', 'The ZINC server (files.docking.org) is currently unavailable. Please try again later.');
        } else {
          showToast('error', 'Upload failed', 'The file could not be processed. Please check the format and try again.');
        }
      }
    } catch {
      showToast('error', 'Connection error', 'Unable to reach the server. Make sure the application is running and try again.');
    } finally {
      setIsLoading(false);
      fetchFiles();
    }
  };

  const toggleAccordion = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));

  const handleDelete = async (target: string) => {
    if (!confirm(`Delete data for "${target}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/delete/ZINC/${encodeURIComponent(target)}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('error', 'Could not delete', 'An error occurred while removing this target. Please try again.');
        return;
      }
      showToast('success', 'Target deleted', `All data for "${target}" has been removed.`);
      fetchFiles();
    } catch {
      showToast('error', 'Connection error', 'Could not reach the server to delete the target.');
    }
  };

  const handleDownloadTarget = (target: string) => {
    try {
      window.open(`${API_BASE_URL}/api/files/download/ZINC/zip/${encodeURIComponent(target)}`, '_blank');
    } catch {
      showToast('error', 'Download failed', 'Could not start the download. Please try again.');
    }
  };

  const handleDownload = (file: string) => {
    try {
      window.open(`${API_BASE_URL}/api/files/download/ZINC/${encodeURIComponent(file)}`, '_blank');
    } catch {
      showToast('error', 'Download failed', 'Could not start the download. Please try again.');
    }
  };

  const handleDeleteFile = async (file: string) => {
    if (!confirm(`Delete file "${file}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/delete/ZINC/${encodeURIComponent(file)}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('error', 'Could not delete file', 'An error occurred while removing this file. Please try again.');
        return;
      }
      showToast('success', 'File deleted', `"${file}" has been removed.`);
      fetchFiles();
    } catch {
      showToast('error', 'Connection error', 'Could not reach the server to delete the file.');
    }
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
                  <label>URI File: <InfoTooltip content="Upload a ZINC database catalog or URI list file (.uri extension) containing links to compound structures." /></label><input type="file" name="zinc_file" accept=".uri" required />
                </div>
                <div className="form-group"><label><input type="checkbox" name="verbose" /> Verbose Mode <InfoTooltip content="Enable detailed logging during the download process to inspect individual compound retrieval." /></label></div>
                <button type="submit" style={{ width: '100%', marginTop: '10px' }}>Download</button>
              </fieldset>
            </form>
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
                            <button type="button" onClick={() => handleDownload(file)} className="download-btn" title="Download">
                              <i className="fas fa-download"></i>
                            </button>
                            <span>|</span>
                            <button type="button" onClick={() => handleDeleteFile(file)} className="delete-btn" title="Delete">
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