import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { setGlobalDispatcher, Agent } from 'undici';

// Tira o limite de timeout para buscas pesadas
setGlobalDispatcher(new Agent({ headersTimeout: 0, connectTimeout: 0, bodyTimeout: 0 }));

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const PYTHON_URL = process.env.PYTHON_URL || 'http://127.0.0.1:5000';

// ==========================================
// ROTAS DE BUSCA
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
    res.json({ success: true, data: await response.json() });
  } catch (error) { res.status(500).json({ success: false, message: 'Erro PDB.' }); }
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
  } catch (error) { res.status(500).json({ success: false, message: 'Erro ChEMBL.' }); }
});

// ==========================================
// ROTAS DE ARQUIVOS (Adaptadas ao seu Flask)
// ==========================================
// Listagem
app.get('/api/files/list/PDB', async (req, res) => {
  try { res.json(await (await fetch(`${PYTHON_URL}/pdb_files`)).json()); } catch (e) { res.status(500).json({}); }
});
app.get('/api/files/list/ChEMBL', async (req, res) => {
  try { res.json(await (await fetch(`${PYTHON_URL}/chembl_files`)).json()); } catch (e) { res.status(500).json({}); }
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
app.get('/api/files/download/ZINC/:file', async (req, res) => {
  try {
    const { file } = req.params;
    const pythonRes = await fetch(`${PYTHON_URL}/download_zinc/${encodeURIComponent(file)}`);
    if (!pythonRes.ok) throw new Error('Not found');
    res.set('Content-Disposition', `attachment; filename="${file}"`);
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

// Inteligência 2D/3D
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

app.listen(3001, () => console.log(`🚀 Node.js Maestro online na porta 3001`));