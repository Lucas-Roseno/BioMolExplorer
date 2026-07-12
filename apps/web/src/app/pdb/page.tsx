'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import './pdb.css';
import { API_BASE_URL } from '../../config';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useToast } from '../../components/ToastProvider';
import InfoTooltip from '../../components/InfoTooltip';
import { useFiles } from '../../hooks/useFiles';

export default function PdbPage() {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { datasets, fetchFiles } = useFiles<Record<string, string[]>>('/api/files/list/PDB');
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState({ isOpen: false, file: '' });

  // Inputs for button validation
  const [targetName, setTargetName] = useState('');
  const [pdbEc, setPdbEc] = useState('');

  const isFormValid = targetName.trim() !== '' && pdbEc.trim() !== '';
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // Polls the job status until completed or error
  const pollUntilJobComplete = async (taskId: string, targetNameStr: string) => {
    let isDone = false;
    let attempts = 0;
    const maxAttempts = 720; // 30 minutes max (720 × 2.5s)
    while (!isDone && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 2500));
      try {
        const statusRes = await fetch(`${API_BASE_URL}/api/jobs/status/${encodeURIComponent(taskId)}`);
        if (!statusRes.ok) continue; // Transient network issue — keep polling

        const statusData = await statusRes.json();
        if (statusData.status === 'completed') {
          isDone = true;
          setDownloadStatus(null);
          showToast('success', 'Download completed!', `PDB structures for "${targetNameStr}" are now available.`);
          await fetchFiles();
          break;
        } else if (statusData.status === 'error') {
          isDone = true;
          setDownloadStatus(null);
          showToast('error', 'Download failed', 'No structures could be found for the given parameters. Try adjusting the resolution or removing the ligand filter.');
          break;
        }
      } catch {
        // Network hiccup — continue polling silently
      }
    }

    if (!isDone) {
      setDownloadStatus(null);
      showToast('warning', 'Taking longer than expected', 'The download is still running in the background. You can check back later — the files will appear once ready.');
    }
  };

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setDownloadStatus('⏳ Downloading PDB structures...');
    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.must_have_ligand = payload.must_have_ligand === 'on' ? 'true' : 'false';

    try {
      const res = await fetch(`${API_BASE_URL}/api/pdb/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setDownloadStatus(null);
        showToast('error', 'Search failed', 'Could not connect to the PDB database. Please check your internet connection and try again.');
      } else if (data.data?.task_id) {
        await pollUntilJobComplete(data.data.task_id, payload.target as string);
      }
    } catch {
      setDownloadStatus(null);
      showToast('error', 'Connection error', 'Could not reach the server. Make sure the application is running and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAccordion = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));

  // Deletes all data corresponding to a target
  const handleDelete = async (target: string) => {
    if (!confirm(`Delete all data for "${target}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/delete/PDB/${encodeURIComponent(target)}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('error', 'Could not delete', 'An error occurred while trying to remove this target. Please try again.');
        return;
      }
      showToast('success', 'Target deleted', `All data for "${target}" has been removed.`);
      fetchFiles();
    } catch {
      showToast('error', 'Connection error', 'Could not reach the server to delete the target.');
    }
  };

  // Triggers downloading the complete target folder as a ZIP file
  const handleDownloadTarget = (target: string) => {
    try {
      window.open(`${API_BASE_URL}/api/files/download/PDB/zip/${encodeURIComponent(target)}`, '_blank');
    } catch {
      showToast('error', 'Download failed', 'Could not start the download. Please try again.');
    }
  };

  const handleDeleteFile = async (target: string, file: string) => {
    if (!confirm(`Delete file "${file}"?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/files/delete/PDB/file/${encodeURIComponent(target)}/${encodeURIComponent(file)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || data.status === 'error') {
        showToast('error', 'Could not delete file', 'The file could not be removed. Please try again.');
        return;
      }

      showToast('success', 'File deleted', `"${file}" has been removed.`);
      setTimeout(() => { fetchFiles(); }, 500);
    } catch {
      showToast('error', 'Connection error', 'Could not reach the server to delete the file.');
    }
  };

  const handleDownload = (target: string, file: string) => {
    try {
      window.open(`${API_BASE_URL}/api/files/download/PDB/${encodeURIComponent(target)}/${encodeURIComponent(file)}`, '_blank');
    } catch {
      showToast('error', 'Download failed', 'Could not start the download. Please try again.');
    }
  };

  // Fetches the specific PDB content as text and displays the 3D Viewer Modal
  const open3DViewer = async (target: string, file: string) => {
    setViewer({ isOpen: true, file });
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/pdb_content/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
      if (!res.ok) {
        showToast('error', 'Could not load structure', 'The 3D structure file could not be retrieved. Try again or download the file manually.');
        setViewer({ isOpen: false, file: '' });
        return;
      }
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
    } catch {
      showToast('error', 'Could not load structure', 'Unable to retrieve the PDB file. Please check your connection and try again.');
      setViewer({ isOpen: false, file: '' });
    }
  };

  return (
    <>
      <div className="container">
        <h2 className="page-title">PDB Loader</h2>
        <div className="pdb-flex-layout">
          <div className="form-container">
            <form id="pdb-form" onSubmit={handleSearch}>
              <div className="form-group">
                <label>Target Name <InfoTooltip content="Enter a descriptive name for your biological target (e.g., Acetylcholinesterase) to organize downloaded PDB structures." /></label>
                <input
                  type="text"
                  name="target"
                  placeholder="e.g., Acetylcholinesterase"
                  required
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>PDB EC Number <InfoTooltip content="Enzyme Commission (EC) classification number identifying the enzyme class (e.g., 3.1.1.7 for Acetylcholinesterase)." /></label>
                <input
                  type="text"
                  name="pdb_ec"
                  placeholder="e.g., 3.1.1.7"
                  required
                  value={pdbEc}
                  onChange={(e) => setPdbEc(e.target.value)}
                />
              </div>
              <div className="form-group"><label>Polymer Entity Type <InfoTooltip content="Select the macromolecular type to filter structures (Protein, DNA, RNA, or hybrids)." /></label>
                <select name="polymer_entity_type">
                  <option value="PROTEIN">Protein</option>
                  <option value="DNA">DNA</option>
                  <option value="RNA">RNA</option>
                  <option value="DNA_RNA_HYBRID">DNA/RNA Hybrid</option>
                  <option value="PEPTIDE_NUCLEIC_ACID">Peptide Nucleic Acid</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="form-group"><label>Experimental Method <InfoTooltip content="Filter structures by structure determination technique such as X-Ray Diffraction or Solution NMR." /></label>
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
              <div className="form-group"><label>Max Resolution (Å) <InfoTooltip content="Maximum acceptable structural resolution in Angstroms (lower values indicate higher atomic precision)." /></label><input type="number" name="max_resolution" step="0.1" defaultValue="1.8" required /></div>
              <div className="form-group"><label><input type="checkbox" name="must_have_ligand" defaultChecked /> Must Have Ligand <InfoTooltip content="Check to download only structures that contain co-crystallized small-molecule ligands." /></label></div>
              <button type="submit" disabled={!isFormValid || isLoading}>
                {isLoading ? 'Downloading...' : 'Download'}
              </button>
              {downloadStatus && (
                <p style={{ marginTop: '10px', fontSize: '0.9rem', color: downloadStatus.startsWith('✅') ? '#2e7d32' : downloadStatus.startsWith('⚠️') ? '#e65100' : '#1565c0' }}>
                  {downloadStatus}
                </p>
              )}
            </form>
          </div>
          <div className="pdb-list-container">
            <h3>Downloaded PDB Files</h3>
            <div id="pdb-list">
              {Object.entries(datasets).map(([target, files]) => (
                <div key={target} style={{ marginBottom: '5px' }}>
                  {/* Classic Accordion Header */}
                  <button className={`collapsible-header ${openTargets[target] ? 'active' : ''}`} type="button" onClick={() => toggleAccordion(target)}>
                    <div className="target-header-left">
                      <i className={`fas fa-chevron-${openTargets[target] ? 'up' : 'down'} accordion-icon`}></i>
                      <span>{target} ({files.length})</span>
                    </div>
                    <div className="target-header-right target-actions">
                      <Link href={`/pdb/${encodeURIComponent(target)}`} onClick={(e) => e.stopPropagation()} className="csv-target-btn" title="View CSV Table">
                        <i className="fas fa-table" aria-hidden="true"></i>
                      </Link>
                      <span className="download-target-btn" onClick={(e) => { e.stopPropagation(); handleDownloadTarget(target); }} title="Download Target">
                        <i className="fas fa-download"></i>
                      </span>
                      <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDelete(target); }} title="Delete Target">
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
                            title="View molecule in 3D"
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
                            <button type="button" title="Delete" onClick={() => handleDeleteFile(target, file)} className="delete-btn">
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
      <LoadingOverlay isLoading={isLoading} message="Downloading PDB data..." />
    </>
  );
}