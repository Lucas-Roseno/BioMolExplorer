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
// SEARCH ROUTES
// ==========================================
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
      max_resolution: isNaN(resolucao) ? null : resolucao, must_have_ligand: s.must_have_ligand
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
      molecules: { natural_product_molecules: s.natural_product_molecules }
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

// ==========================================
// FILE ROUTES (Adapted to your Flask service)
// ==========================================
// Listagem
app.get('/api/files/list/PDB', async (req, res) => {
  try { res.json(await (await fetch(`${PYTHON_URL}/pdb_files`)).json()); } catch (e) { res.status(500).json({}); }
});
app.get('/api/files/list/ChEMBL', async (req, res) => {
  try { res.json(await (await fetch(`${PYTHON_URL}/chembl_files`)).json()); } catch (e) { res.status(500).json({}); }
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
    res.json(await response.json());
  } catch (e) { res.status(500).json({ success: false }); }
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

app.get('/api/files/pdb_content/:target/:file', async (req, res) => {
  try {
    const { target, file } = req.params;
    const response = await fetch(`${PYTHON_URL}/get_pdb_content/${encodeURIComponent(target)}/${encodeURIComponent(file)}`);
    res.send(await response.text());
  } catch (e) { res.status(500).send(''); }
});

const server = app.listen(3001, () => console.log(`🚀 Node.js Maestro online on port 3001`));

// Increase HTTP server timeout to 30 minutes
server.setTimeout(1800000); 
server.keepAliveTimeout = 1800000;
server.headersTimeout = 1801000;