import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { setGlobalDispatcher, Agent } from 'undici';

// Remove timeout limit for heavy searches
setGlobalDispatcher(new Agent({ headersTimeout: 0, connectTimeout: 0, bodyTimeout: 0 }));

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const PYTHON_URL = process.env.PYTHON_URL || 'http://127.0.0.1:5000';

// ==========================================
// SEARCH & TASK STATUS ROUTES
// ==========================================
app.get('/api/jobs/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const response = await fetch(`${PYTHON_URL}/api/tasks/status/${encodeURIComponent(jobId)}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/pdb/search', async (req, res) => {
  try {
    const s = req.body;
    let resolucao = 2.5;
    if (s.max_resolution) {
      resolucao = parseFloat(String(s.max_resolution).replace(',', '.'));
    }
    const payload = {
      target: s.target, pdb_ec: s.pdb_ec,
      PolymerEntityTypeID: [s.polymer_entity_type], ExperimentalMethodID: [s.experimental_method],
      max_resolution: isNaN(resolucao) ? null : resolucao, must_have_ligand: s.must_have_ligand === true || s.must_have_ligand === 'true'
    };
    const response = await fetch(`${PYTHON_URL}/load_pdb`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (response.ok) {
      res.json({ success: true, data });
    } else {
      res.status(response.status).json({ success: false, message: data.message || 'PDB Error.' });
    }
  } catch (error: any) { 
    res.status(500).json({ success: false, message: error.message || 'PDB Error.' }); 
  }
});

app.post('/api/chembl/search', async (req, res) => {
  try {
    const s = req.body;
    const payload = {
      target: { target_name: s.target_name, organism: s.organism || "Homo sapiens" },
      bioactivity: { standard_type__in: s.standard_type__in, standard_value__lte: s.max_value_ref ? parseFloat(s.max_value_ref) : 1000 },
      similarmols: { similarity: s.similarity ? parseFloat(s.similarity) : 60, mw_freebase__lte: s.molecule_weight ? parseFloat(s.molecule_weight) : 500 },
      molecules: { natural_product: s.natural_product_molecules ? 1 : 0 }
    };
    const response = await fetch(`${PYTHON_URL}/load_chembl`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    res.json({ success: true, data: await response.json() });
  } catch (error) { res.status(500).json({ success: false, message: 'ChEMBL Error.' }); }
});

// ==========================================
// ANALYSIS ROUTES (FORWARDING TO PYTHON)
// ==========================================
app.get('/api/analysis/graph-data', async (req, res) => {
  try {
    const target = req.query.target ? `target=${encodeURIComponent(req.query.target.toString())}` : '';
    const datasetType = req.query.datasetType ? `datasetType=${encodeURIComponent(req.query.datasetType.toString())}` : 'datasetType=MOLS';
    const query = [target, datasetType].filter(Boolean).join('&');
    const response = await fetch(`${PYTHON_URL}/api/analysis/graph-data${query ? '?' + query : ''}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/analysis/process-graphs', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/analysis/process-graphs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/analysis/plots', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/analysis/plots`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/analysis/molecule-image', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/analysis/molecule-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

// Proxy de imagem PNG — pipe binário direto do Python
app.get('/api/analysis/plot/:filename', async (req, res) => {
  try {
    const filename = encodeURIComponent(req.params.filename);
    const response = await fetch(`${PYTHON_URL}/api/analysis/plot/${filename}`);
    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: 'Plot not found.' });
    }
    const contentType = response.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/chembl_files', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/chembl_files`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

// ZINC Upload (forwards .uri file to Flask)
app.post('/api/zinc/upload', upload.single('zinc_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const formData = new FormData();
    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    formData.append('zinc_file', blob, req.file.originalname);

    if (req.body.verbose === 'on') {
      formData.append('verbose', 'on');
    }

    const response = await fetch(`${PYTHON_URL}/load_zinc`, {
      method: 'POST',
      body: formData
    });

    // Clean up uploaded temp file
    fs.unlinkSync(req.file.path);

    const data = await response.json();
    if (response.ok) {
      res.json({ success: true, data });
    } else {
      res.status(response.status).json({ success: false, message: data.message || 'Error processing ZINC.' });
    }
  } catch (error: any) {
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message || 'Error processing ZINC.' });
  }
});

// ZINC File List
app.get('/api/files/list/ZINC', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/zinc_files`);
    const files: string[] = await response.json();
    // Transform flat array to Record<string, string[]> grouped by type
    const grouped: Record<string, string[]> = {};
    for (const f of files) {
      // Group by extension or prefix (e.g., ZINC2D.csv -> "ZINC Data")
      const key = 'ZINC Data';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f);
    }
    res.json(grouped);
  } catch (e) { res.status(500).json({}); }
});

// ==========================================
// SIMILARITY ANALYSIS ROUTES
// ==========================================



app.get('/api/analysis/plots', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/analysis/plots`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error listing plots.' });
  }
});

app.get('/api/analysis/plot/:filename', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/analysis/plot/${req.params.filename}`);
    if (response.ok) {
      res.setHeader('Content-Type', 'image/png');
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } else {
      res.status(response.status).json({ success: false, message: 'Plot not found.' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error loading plot.' });
  }
});

app.post('/api/analysis/molecule-image', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/analysis/molecule-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generating molecule image.' });
  }
});

// Helper resilient to Python Flask startup race condition
async function fetchPythonJson(endpoint: string, retries = 5, delayMs = 600): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${PYTHON_URL}${endpoint}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err: any) {
      if (attempt === retries) {
        console.error(`[API] Could not fetch ${endpoint} from Python after ${retries} attempts:`, err.message);
      }
    }
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return {};
}

// ==========================================
// FILE ROUTES (Adapted to your Flask service)
// ==========================================
// Listagem
app.get('/api/files/list/PDB', async (req, res) => {
  try { res.json(await fetchPythonJson('/pdb_files')); } catch (e) { res.json({}); }
});
app.get('/api/files/list/ChEMBL', async (req, res) => {
  try { res.json(await fetchPythonJson('/chembl_files')); } catch (e) { res.json({}); }
});
app.get('/api/chembl_files', async (req, res) => {
  try { res.json(await fetchPythonJson('/chembl_files')); } catch (e) { res.json({}); }
});
app.get('/api/zinc_files', async (req, res) => {
  try { res.json(await fetchPythonJson('/zinc_files')); } catch (e) { res.json({}); }
});
app.get('/api/pdb_files', async (req, res) => {
  try { res.json(await fetchPythonJson('/pdb_files')); } catch (e) { res.json({}); }
});
app.get('/api/files/csv/PDB/:target/:file', async (req, res) => {
  try {
    const { target, file } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/pdb_csv/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
    const data = await pythonRes.json();
    res.status(pythonRes.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'CSV read error.' });
  }
});
app.post('/api/files/csv/delete-row', async (req, res) => {
  try {
    const pythonRes = await fetch(`${PYTHON_URL}/delete_pdb_csv_row`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    const data = await pythonRes.json();
    res.status(pythonRes.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'CSV delete error.' });
  }
});

// Downloads em lote (ZIP)
app.get('/api/files/download/PDB/zip/:target', async (req, res) => {
  try {
    const { target } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_pdb_zip/${encodeURIComponent(target)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="${target}_pdb.zip"`);
    res.send(Buffer.from(await pythonRes.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});
app.get('/api/files/download/PDB/csv/:target/:file', async (req, res) => {
  try {
    const { target, file } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_pdb_csv/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="${file}"`);
    res.send(Buffer.from(await pythonRes.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});
app.get('/api/files/download/ChEMBL/zip/:target', async (req, res) => {
  try {
    const { target } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_chembl_zip/${encodeURIComponent(target)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="${target}_chembl.zip"`);
    res.send(Buffer.from(await pythonRes.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});
app.get('/api/files/download/ChEMBL/category/zip/:subdir/:target', async (req, res) => {
  try {
    const { subdir, target } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_chembl_category_zip/${encodeURIComponent(subdir)}/${encodeURIComponent(target)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="${target}_${subdir}.zip"`);
    res.send(Buffer.from(await pythonRes.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});
app.get('/api/files/download/ZINC/zip/:target', async (req, res) => {
  try {
    const { target } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_zinc_zip/${encodeURIComponent(target)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="ZINC_data.zip"`);
    res.send(Buffer.from(await pythonRes.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});

// Downloads (Proxy)
app.get('/api/files/download/PDB/:target/:file', async (req, res) => {
  try {
    const { target, file } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_pdb/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="${file}"`);
    res.send(Buffer.from(await pythonRes.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});

app.get('/api/files/download/ChEMBL/:subdir/:target/:file', async (req, res) => {
  try {
    const { subdir, target, file } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_chembl/${encodeURIComponent(subdir)}/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="${file}"`);
    res.send(Buffer.from(await pythonRes.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});

app.get('/api/files/download/ZINC/:file', async (req, res) => {
  try {
    const { file } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_zinc/${encodeURIComponent(file)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="${file}"`);
    res.send(Buffer.from(await pythonRes.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});

// Exclusão
app.delete('/api/files/delete/PDB/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/delete_pdb_target`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: req.params.target })
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ success: false }); }
});
app.delete('/api/files/delete/PDB/file/:target/:file', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/delete_pdb`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: req.params.target, pdb_file: req.params.file })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});
app.delete('/api/files/delete/ChEMBL/target/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/delete_chembl_target`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: req.params.target })
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ success: false }); }
});
app.delete('/api/files/delete/ChEMBL/category/:subdir/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/delete_chembl_category`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub_dir_name: req.params.subdir, target: req.params.target })
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ success: false }); }
});
app.delete('/api/files/delete/ChEMBL/file/:subdir/:target/:file', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/delete_chembl`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub_dir_name: req.params.subdir, target: req.params.target, csv_file: req.params.file })
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ success: false }); }
});
app.delete('/api/files/delete/ZINC/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/delete_zinc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: req.params.target })
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ success: false }); }
});

// 2D/3D Intelligence
app.get('/api/files/molecule/:subdir/:target/:file', async (req, res) => {
  try {
    const { subdir, target, file } = req.params;
    const response = await fetch(`${PYTHON_URL}/get_molecule_data/${encodeURIComponent(subdir)}/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
    res.json(await response.json());
  } catch (e) { res.status(500).json({ success: false }); }
});

// ==========================================
// ==========================================
// DOCKING ROUTES (FORWARDING TO PYTHON)
// ==========================================

app.get('/api/docking/available-ligands/:target/:pdb_code', async (req, res) => {
  try {
    const { target, pdb_code } = req.params;
    const response = await fetch(`${PYTHON_URL}/api/docking/available-ligands/${encodeURIComponent(target)}/${encodeURIComponent(pdb_code)}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/docking/run', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/docking/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/docking/status/:task_id', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/docking/status/${req.params.task_id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/docking/cancel/:task_id', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/docking/cancel/${req.params.task_id}`, { method: 'POST' });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/docking/results', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/docking/results`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/docking/csv/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/docking/csv/${encodeURIComponent(req.params.target)}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/docking/plot/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/docking/plot/${encodeURIComponent(req.params.target)}`);
    if (!response.ok) return res.status(response.status).json({ success: false, message: 'Plot not found.' });
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/docking/download/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/docking/download/${encodeURIComponent(req.params.target)}`);
    if (!response.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="docking_results_${req.params.target}.csv"`);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});

// ==========================================
// FILESYSTEM BROWSER ROUTE (FORWARDING TO PYTHON)
// ==========================================

app.get('/api/filesystem/browse', async (req, res) => {
  try {
    const pathParam = req.query.path ? `?path=${encodeURIComponent(req.query.path.toString())}` : '';
    const response = await fetch(`${PYTHON_URL}/api/filesystem/browse${pathParam}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/filesystem/native-picker', async (req, res) => {
  try {
    const initialDir = req.query.initial_dir ? `?initial_dir=${encodeURIComponent(req.query.initial_dir.toString())}` : '';
    const response = await fetch(`${PYTHON_URL}/api/filesystem/native-picker${initialDir}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/filesystem/validate-folder', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/filesystem/validate-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Node Gateway Error' });
  }
});

// ==========================================
// ==========================================
// REDOCKING ROUTES (FORWARDING TO PYTHON)
// ==========================================

app.get('/api/redocking/targets', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/redocking/targets`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/redocking/run', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/redocking/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/redocking/status/:task_id', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/redocking/status/${req.params.task_id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/redocking/cancel/:task_id', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/redocking/cancel/${req.params.task_id}`, { method: 'POST' });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/redocking/results', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/redocking/results`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/redocking/csv/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/redocking/csv/${encodeURIComponent(req.params.target)}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/redocking/download/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/redocking/download/${encodeURIComponent(req.params.target)}`);
    if (!response.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="redocking_results_${req.params.target}.csv"`);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});

// ==========================================
// ADMET ROUTES (FORWARDING TO PYTHON)
// ==========================================

app.get('/api/admet/available-targets', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/admet/available-targets`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/admet/run', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/admet/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/admet/status/:task_id', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/admet/status/${req.params.task_id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.post('/api/admet/cancel/:task_id', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/admet/cancel/${req.params.task_id}`, { method: 'POST' });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/admet/results', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/admet/results`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/admet/csv/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/admet/csv/${encodeURIComponent(req.params.target)}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/admet/plots/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/admet/plots/${encodeURIComponent(req.params.target)}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

// Binary proxy — pipe PNG directly from Python
app.get('/api/admet/plot/:target/:filename', async (req, res) => {
  try {
    const { target, filename } = req.params;
    const response = await fetch(
      `${PYTHON_URL}/api/admet/plot/${encodeURIComponent(target)}/${encodeURIComponent(filename)}`
    );
    if (!response.ok) return res.status(response.status).json({ success: false, message: 'Plot not found.' });
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message || 'Node Gateway Error' });
  }
});

app.get('/api/admet/download/:target', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_URL}/api/admet/download/${encodeURIComponent(req.params.target)}`);
    if (!response.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="admet_results_${req.params.target}.csv"`);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e) { res.status(404).send('Not found'); }
});


app.get('/api/files/pdb_content/:target/:file', async (req, res) => {
  try {
    const { target, file } = req.params;
    const response = await fetch(`${PYTHON_URL}/get_pdb_content/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
    res.send(await response.text());
  } catch (e) { res.status(500).send(''); }
});

const port = parseInt(process.env.PORT || '3001', 10);
const server = app.listen(port, '127.0.0.1', () => console.log(`🚀 Node.js Maestro online on port ${port}`));

// Increase HTTP server timeout to 30 minutes
server.setTimeout(1800000); 
server.keepAliveTimeout = 1800000;
server.headersTimeout = 1801000;
