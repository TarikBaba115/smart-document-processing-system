// require("dotenv").config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const { extractInvoiceData } = require('./invoiceProcessor');
const { classifyDocument } = require('./documentClassifier');
const util = require('util');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Simple in-memory store for extracted documents
const STORE = {};

app.use(express.static(path.join(__dirname)));

// Upload endpoint: expects 'file' field
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    console.log(req.file);

    // make sure we have a sensible mimeType
    const file = req.file;
    let mimeType = file.mimetype || '';
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = (file.originalname || '').split('.').pop().toLowerCase();
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'tif' || ext === 'tiff') mimeType = 'image/tiff';
      else mimeType = 'application/pdf';
      file.mimeType = mimeType;
    }

    // Support a local mock mode for development when Document AI isn't available
    let data;
    if (process.env.MOCK_EXTRACT === 'true') {
      data = {
        invoiceId: 'MOCK-001',
        supplierName: 'ACME Corp (mock)',
        invoiceDate: new Date().toISOString().slice(0,10),
        dueDate: '',
        currency: 'USD',
        lineItems: [],
        netAmount: 0,
        totalTaxAmount: 0,
        totalAmount: 0
      };
    } else {
      try {
        /*
        const docClassifier = await classifyDocument(file);
        const docType = docClassifier.document_type.value;
        */
        data = await extractInvoiceData(file, "invoice");
      } catch (err) {
        // Enhanced logging for Document AI errors to aid debugging
        console.error('Upload error (detailed):', util.inspect(err, { depth: 6 }));

        const details = { statusDetails: [], metadata: {} };
        if (Array.isArray(err.statusDetails)) {
          err.statusDetails.forEach((sd) => {
            try {
              const out = {};
              if (sd.fieldViolations) out.fieldViolations = sd.fieldViolations;
              if (sd.message) out.message = sd.message;
              details.statusDetails.push(out);
            } catch (e) {
              details.statusDetails.push(String(sd));
            }
          });
        }
        try {
          if (err.metadata && err.metadata.internalRepr) {
            for (const [k, v] of err.metadata.internalRepr.entries()) {
              details.metadata[k] = Array.isArray(v) ? v.length : String(v);
            }
          }
        } catch (e) {
          // ignore
        }

        return res.status(500).json({ error: err.message || String(err), details });
      }
    }

    // create lightweight id
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
    STORE[id] = { data, originalName: req.file.originalname, uploadedAt: new Date().toISOString() };

    return res.json({ url: `/document.html?docId=${id}`, id });
  } catch (err) {
    console.error('Upload error', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/document/:id', (req, res) => {
  const id = req.params.id;
  const entry = STORE[id];
  if (!entry) return res.status(404).json({ error: 'document not found' });
  res.json(entry);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
