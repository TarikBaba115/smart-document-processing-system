require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const { extractInvoiceData } = require('./invoiceProcessor');
const { classifyDocument } = require('./documentClassifier');
const util = require('util');
const { sequelize, Document, LineItem } = require('./models');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function parseDecimal(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapDocumentPayload(data, fallbackNumber) {
  return {
    docType: data?.type || 'invoice',
    supplier: data?.supplierName || '',
    docNumber: data?.invoiceId || fallbackNumber,
    issueDate: data?.invoiceDate || null,
    dueDate: data?.dueDate || null,
    currency: data?.currency || null,
    subtotal: parseDecimal(data?.netAmount),
    taxTotal: parseDecimal(data?.totalTaxAmount),
    total: parseDecimal(data?.totalAmount),
    status: data?.status || 'uploaded'
  };
}

function mapLineItems(documentId, data) {
  if (!Array.isArray(data?.lineItems)) return [];

  const netAmount = data?.netAmount ? parseDecimal(data.netAmount) : 1;
  const totalTaxAmount = data?.totalTaxAmount && data?.netAmount ? parseDecimal(data.totalTaxAmount) : 0;

  return data.lineItems.map((item) => ({
    documentId,
    description: item?.description ?? null,
    quantity: parseDecimal(item?.quantity),
    unitPrice: parseDecimal(item?.unit_price),
    taxRate: parseDecimal(item?.taxRate ?? item?.tax ?? totalTaxAmount / netAmount),
    total: parseDecimal(item?.amount)
  }));
}

function mapLineItemsFromForm(documentId, lineItems) {
  if (!Array.isArray(lineItems)) return [];

  return lineItems.map((item) => ({
    documentId,
    description: item?.description ?? null,
    quantity: parseDecimal(item?.quantity),
    unitPrice: parseDecimal(item?.unitPrice),
    taxRate: parseDecimal(item?.taxRate),
    total: parseDecimal(item?.total)
  }));
}

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

    const id = randomUUID();
    const mappedDocument = mapDocumentPayload(data, id);

    const createdDocument = await Document.create({
      uuid: id,
      ...mappedDocument
    });

    const lineItems = mapLineItems(createdDocument.uuid, data);
    if (lineItems.length) {
      await LineItem.bulkCreate(lineItems);
    }

    return res.json({ url: `/document.html?docId=${id}`, id });
  } catch (err) {
    console.error('Upload error', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/documents', async (req, res) => {
  try {
    const documents = await Document.findAll({
      include: [{ model: LineItem, as: 'lineItems' }],
      order: [['issueDate', 'DESC'], ['uuid', 'DESC']]
    });
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.put('/api/document/:id', async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const id = req.params.id;
    const document = await Document.findByPk(id, { transaction });

    if (!document) {
      await transaction.rollback();
      return res.status(404).json({ error: 'document not found' });
    }

    const payload = {
      docType: req.body?.docType ?? null,
      supplier: req.body?.supplier ?? null,
      docNumber: req.body?.docNumber ?? null,
      issueDate: req.body?.issueDate ?? null,
      dueDate: req.body?.dueDate ?? null,
      currency: req.body?.currency ?? null,
      subtotal: parseDecimal(req.body?.subtotal),
      taxTotal: parseDecimal(req.body?.taxTotal),
      total: parseDecimal(req.body?.total),
      status: 'validated'
    };

    await document.update(payload, { transaction });

    const lineItems = mapLineItemsFromForm(id, req.body?.lineItems);
    await LineItem.destroy({ where: { documentId: id }, transaction });
    if (lineItems.length) {
      await LineItem.bulkCreate(lineItems, { transaction });
    }

    await transaction.commit();
    return res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.patch('/api/document/:id/status', async (req, res) => {
  try {
    const id = req.params.id;
    const document = await Document.findByPk(id);

    if (!document) return res.status(404).json({ error: 'document not found' });

    const status = req.body?.status;
    if (!status) return res.status(400).json({ error: 'status is required' });

    await document.update({ status });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/document/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const entry = await Document.findByPk(id, {
      include: [{ model: LineItem, as: 'lineItems' }]
    });
    if (!entry) return res.status(404).json({ error: 'document not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 3000;
async function start() {
  await sequelize.authenticate();
  await sequelize.sync();
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
