import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Mock do servidor Express (cópia simplificada para testes)
const createApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // POST /api/pdb/search
  app.post('/api/pdb/search', async (req, res) => {
    try {
      const s = req.body;
      let resolucao = 2.5;
      if (s.max_resolution) {
        resolucao = parseFloat(String(s.max_resolution).replace(',', '.'));
      }

      // Mock: simula resposta do Python backend
      const mockResponse = {
        success: true,
        data: { files: ['1ACE.pdb', '2ACE.pdb'], count: 2 },
      };

      res.json(mockResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'PDB Error.' });
    }
  });

  // POST /api/chembl/search
  app.post('/api/chembl/search', async (req, res) => {
    try {
      const s = req.body;

      const mockResponse = {
        success: true,
        data: { molecules: ['MOL1', 'MOL2'], count: 2 },
      };

      res.json(mockResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'ChEMBL Error.' });
    }
  });

  // GET /api/files/list/{datasetType}
  app.get('/api/files/list/:datasetType', (req, res) => {
    const { datasetType } = req.params;

    if (!['PDB', 'ChEMBL', 'ZINC'].includes(datasetType)) {
      return res.status(400).json({ success: false, message: 'Invalid dataset type' });
    }

    const mockFiles = {
      PDB: { 'AChE': ['1ACE.pdb'], 'BACE1': ['2BAC.pdb'] },
      ChEMBL: { 'AChE': ['molecules.csv'], 'BACE1': ['bioactivity.csv'] },
      ZINC: { 'upload1': ['compounds.csv'] },
    };

    res.json({
      success: true,
      data: mockFiles[datasetType as keyof typeof mockFiles] || {},
    });
  });

  return app;
};

describe('🧬 BioMolExplorer API Endpoints', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  describe('POST /api/pdb/search', () => {
    test('✅ should search PDB with valid payload', async () => {
      const res = await request(app)
        .post('/api/pdb/search')
        .send({
          target: 'AChE',
          pdb_ec: '',
          polymer_entity_type: 'protein',
          experimental_method: 'X-RAY DIFFRACTION',
          max_resolution: 2.5,
          must_have_ligand: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.files).toBeDefined();
      expect(Array.isArray(res.body.data.files)).toBe(true);
    });

    test('✅ should handle decimal resolution with comma', async () => {
      const res = await request(app)
        .post('/api/pdb/search')
        .send({
          target: 'AChE',
          max_resolution: '2,5',
          polymer_entity_type: 'protein',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('✅ should not crash on empty input', async () => {
      const res = await request(app)
        .post('/api/pdb/search')
        .send({});

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/chembl/search', () => {
    test('✅ should search ChEMBL with valid payload', async () => {
      const res = await request(app)
        .post('/api/chembl/search')
        .send({
          target_name: 'Acetylcholinesterase',
          organism: 'Homo sapiens',
          bioactivity_type: 'Ki',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.molecules).toBeDefined();
    });

    test('✅ should handle minimal payload', async () => {
      const res = await request(app)
        .post('/api/chembl/search')
        .send({ target_name: 'AChE' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/files/list/:datasetType', () => {
    test('✅ should list PDB files', async () => {
      const res = await request(app).get('/api/files/list/PDB');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data).toBe('object');
    });

    test('✅ should list ChEMBL files', async () => {
      const res = await request(app).get('/api/files/list/ChEMBL');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('✅ should list ZINC files', async () => {
      const res = await request(app).get('/api/files/list/ZINC');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('❌ should reject invalid dataset type', async () => {
      const res = await request(app).get('/api/files/list/INVALID');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('CORS Headers', () => {
    test('✅ should include CORS headers', async () => {
      const res = await request(app)
        .post('/api/pdb/search')
        .send({ target: 'test' });

      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });
});
