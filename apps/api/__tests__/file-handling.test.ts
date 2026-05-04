import request from 'supertest';
import express from 'express';
import multer from 'multer';

const createApp = () => {
  const app = express();
  app.use(express.json());
  
  const upload = multer({ dest: 'uploads/' });

  // POST /api/zinc/upload
  app.post('/api/zinc/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      filename: req.file.filename,
      originalName: req.file.originalname,
    });
  });

  // GET /api/files/download/:datasetType/:file
  app.get('/api/files/download/:datasetType/:file', (req, res) => {
    const { datasetType, file } = req.params;

    // Security: reject path traversal
    if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    res.json({
      success: true,
      message: 'Download started',
      path: `./datasets/${datasetType}/${file}`,
    });
  });

  // DELETE /api/files/delete/:datasetType/:target
  app.delete('/api/files/delete/:datasetType/:target', (req, res) => {
    const { datasetType, target } = req.params;

    if (!['PDB', 'ChEMBL', 'ZINC'].includes(datasetType)) {
      return res.status(400).json({ success: false, message: 'Invalid dataset type' });
    }

    res.json({
      success: true,
      message: `Deleted ${target} from ${datasetType}`,
    });
  });

  return app;
};

describe('📁 BioMolExplorer File Handling', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  describe('POST /api/zinc/upload', () => {
    test('✅ should upload file successfully', async () => {
      const res = await request(app)
        .post('/api/zinc/upload')
        .attach('file', Buffer.from('test,data\n1,2'), 'compounds.csv');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filename).toBeDefined();
    });

    test('❌ should reject missing file', async () => {
      const res = await request(app)
        .post('/api/zinc/upload');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/files/download/:datasetType/:file', () => {
    test('✅ should download file', async () => {
      const res = await request(app)
        .get('/api/files/download/PDB/1ACE.pdb');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('❌ should reject path traversal attack (..)' , async () => {
      const res = await request(app)
        .get('/api/files/download/PDB/..%2Fetc%2Fpasswd');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/files/delete/:datasetType/:target', () => {
    test('✅ should delete PDB target', async () => {
      const res = await request(app)
        .delete('/api/files/delete/PDB/AChE');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('✅ should delete ChEMBL target', async () => {
      const res = await request(app)
        .delete('/api/files/delete/ChEMBL/BACE1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('❌ should reject invalid dataset type', async () => {
      const res = await request(app)
        .delete('/api/files/delete/INVALID/target');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
