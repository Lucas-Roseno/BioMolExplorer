'use client';
import { useState, FormEvent } from 'react';
import './chembl.css';
import { API_BASE_URL } from '../../config';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useToast } from '../../components/ToastProvider';
import InfoTooltip from '../../components/InfoTooltip';
import { useFiles } from '../../hooks/useFiles';

type ChemblData = { molecules?: string[]; similars?: string[] };

export default function ChemblPage() {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { datasets, fetchFiles } = useFiles<Record<string, ChemblData>>('/api/files/list/ChEMBL');
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});
  const [openSubdirs, setOpenSubdirs] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState({ isOpen: false, file: '', imgBase64: '', molBlock: '', mode: 'both' });

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    // Transform form data into a structured payload for ChEMBL search
    const fd = new FormData(e.currentTarget);
    const payload = {
      target_name: fd.get('target_name'), organism: fd.get('organism'),
      standard_type__in: fd.getAll('standard_type__in'), max_value_ref: fd.get('max_value_ref'),
      similarity: fd.get('similarity'), molecule_weight: fd.get('molecule_weight'),
      natural_product_molecules: fd.get('natural_product_molecules') === 'on'
    };
    try {
      const response = await fetch(`${API_BASE_URL}/api/chembl/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const errorMsg = data.message || '';
        if (errorMsg.includes('spore') || errorMsg.includes('500') || errorMsg.includes('ebi.ac.uk')) {
          showToast(
            'warning',
            'ChEMBL servers temporarily unavailable',
            'The official ChEMBL API (EMBL-EBI) is experiencing a temporary issue. Please try again in a few minutes.'
          );
        } else if (errorMsg.includes('not found in ChEMBL with the provided filters')) {
          showToast(
            'warning',
            'No compounds found',
            'No molecules matched your search. Try increasing the Max Value (nM), selecting different activity types, or reducing the similarity threshold.'
          );
        } else {
          showToast('error', 'Search failed', 'An error occurred while searching ChEMBL. Please review your parameters and try again.');
        }
      } else if (data.data?.task_id) {
        const taskId = data.data.task_id;
        let isDone = false;
        let attempts = 0;
        const maxAttempts = 720; // 30 minutes
        while (!isDone && attempts < maxAttempts) {
          attempts++;
          await new Promise(r => setTimeout(r, 2500));
          try {
            const statusRes = await fetch(`${API_BASE_URL}/api/jobs/status/${encodeURIComponent(taskId)}`);
            if (!statusRes.ok) continue;
            const statusData = await statusRes.json();
            if (statusData.status === 'completed') {
              isDone = true;
              showToast('success', 'Download completed!', 'ChEMBL compounds have been saved successfully.');
            } else if (statusData.status === 'error') {
              isDone = true;
              showToast('error', 'Processing failed', 'An error occurred while processing the ChEMBL data. Please try again.');
            }
          } catch {
            // Transient network error during polling — keep trying
          }
        }
        if (!isDone) {
          showToast('warning', 'Still processing', 'The download is taking longer than expected. The data will appear once the process completes.');
        }
      }
    } catch {
      showToast('error', 'Connection error', 'Could not reach the server. Make sure the application is running and try again.');
    } finally {
      setIsLoading(false);
      fetchFiles();
    }
  };

  const toggleTarget = (t: string) => setOpenTargets(p => ({ ...p, [t]: !p[t] }));
  const toggleSubdir = (t: string, s: string) => setOpenSubdirs(p => ({ ...p, [`${t}-${s}`]: !p[`${t}-${s}`] }));

  const handleDeleteTarget = async (target: string) => {
    if (!confirm(`Delete all data for "${target}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/delete/ChEMBL/target/${encodeURIComponent(target)}`, { method: 'DELETE' });
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
      window.open(`${API_BASE_URL}/api/files/download/ChEMBL/zip/${encodeURIComponent(target)}`, '_blank');
    } catch {
      showToast('error', 'Download failed', 'Could not start the download. Please try again.');
    }
  };

  const handleDeleteSubdir = async (subdir: string, target: string) => {
    if (!confirm(`Delete folder "${subdir}" from "${target}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/delete/ChEMBL/category/${subdir}/${encodeURIComponent(target)}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('error', 'Could not delete folder', 'An error occurred while removing this folder. Please try again.');
        return;
      }
      showToast('success', 'Folder deleted', `"${subdir}" has been removed from "${target}".`);
      fetchFiles();
    } catch {
      showToast('error', 'Connection error', 'Could not reach the server to delete the folder.');
    }
  };

  const handleDownloadSubdir = (subdir: string, target: string) => {
    try {
      window.open(`${API_BASE_URL}/api/files/download/ChEMBL/category/zip/${subdir}/${encodeURIComponent(target)}`, '_blank');
    } catch {
      showToast('error', 'Download failed', 'Could not start the download. Please try again.');
    }
  };

  const handleDeleteFile = async (subdir: string, target: string, file: string) => {
    if (!confirm(`Delete file "${file}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/delete/ChEMBL/file/${subdir}/${encodeURIComponent(target)}/${encodeURIComponent(file)}`, { method: 'DELETE' });
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

  // Initiates download of a single file.
  const handleDownloadFile = (subdir: string, target: string, file: string) => {
    try {
      window.open(`${API_BASE_URL}/api/files/download/ChEMBL/${subdir}/${encodeURIComponent(target)}/${encodeURIComponent(file)}`, '_blank');
    } catch {
      showToast('error', 'Download failed', 'Could not start the download. Please try again.');
    }
  };

  // Fetches the 2D SVG rendering from backend and initializes the 3D viewer modal
  const openMoleculeViewer = async (subdir: string, target: string, file: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/molecule/${subdir}/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
      if (!res.ok) {
        showToast('error', 'Could not load molecule', 'The molecule visualization could not be loaded. Please try again.');
        return;
      }
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
        showToast('error', 'Could not render molecule', 'The 2D/3D structure could not be generated for this compound.');
      }
    } catch {
      showToast('error', 'Connection error', 'Unable to load the molecule viewer. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="container">
        <h2 className="page-title">ChEMBL Loader</h2>
        <div className="pdb-flex-layout">
          <div className="form-container">
            <form id="chembl-form" onSubmit={handleSearch}>
              <div className="fieldset-row">
                <fieldset><legend>Target Search</legend><div className="form-group"><label>Target Name <InfoTooltip content="Target protein or molecular entity name to search in the ChEMBL database." /></label><input type="text" name="target_name" placeholder="e.g., Acetylcholinesterase" required /></div></fieldset>
                <fieldset><legend>Target Parameters</legend><div className="form-group"><label>Organism <InfoTooltip content="Biological species of the target (e.g., Homo sapiens for human targets)." /></label><input type="text" name="organism" defaultValue="Homo sapiens" /></div></fieldset>
              </div>
              <fieldset><legend>Bioactivity</legend><div className="form-group"><label>Standard Type <InfoTooltip content="Select bioactivity metric types to filter compounds (e.g., Ki or IC50 measurements)." /></label>

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

              </div><div className="form-group"><label>Max Value (nM) <InfoTooltip content="Maximum bioactivity cutoff in nanomolar (nM); lower values select more potent compounds." /></label><input type="number" name="max_value_ref" defaultValue="100" /></div>
              </fieldset>
              <div className="fieldset-row">
                <fieldset><legend>Molecules</legend><div className="form-group"><label>Natural Product <InfoTooltip content="Filter to include or prioritize natural product molecules." /></label><input type="checkbox" name="natural_product_molecules" /></div></fieldset>
                <fieldset><legend>Similar Mols</legend><div className="form-group"><label>Similarity (%) <InfoTooltip content="Tanimoto similarity percentage threshold for finding structurally similar compounds." /></label><input type="number" name="similarity" defaultValue="80" /><label>Max Weight <InfoTooltip content="Maximum molecular weight cutoff (in g/mol or Da) for compound filtering." /></label><input type="number" name="molecule_weight" defaultValue="500" /></div></fieldset>
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
                      <span className="download-target-btn" onClick={(e) => { e.stopPropagation(); handleDownloadTarget(target); }} title="Download Target" style={{ marginRight: '10px' }}>
                        <i className="fas fa-download"></i>
                      </span>
                      <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDeleteTarget(target); }} title="Delete Target">
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
                                <span className="download-target-btn" onClick={(e) => { e.stopPropagation(); handleDownloadSubdir(subdir, target); }} title="Download Folder" style={{ marginRight: '10px' }}>
                                  <i className="fas fa-download"></i>
                                </span>
                                <span className="delete-target-btn" onClick={(e) => { e.stopPropagation(); handleDeleteSubdir(subdir, target); }} title="Delete Folder">
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
                                      title="View molecule in 2D/3D"
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
                                      <button type="button" title="Delete" onClick={() => handleDeleteFile(subdir, target, file)} className="delete-btn">
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

      <LoadingOverlay isLoading={isLoading} />
    </>
  );
}