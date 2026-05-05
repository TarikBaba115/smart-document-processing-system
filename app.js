require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const { extractInvoiceData } = require('./invoiceProcessor');
const util = require('util');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { sequelize, Document, LineItem, Issue } = require('./models');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Document Processing API',
      version: '1.0.0',
      description: 'API documentation for the document processing workflow.'
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server'
      }
    ],
    components: {
      schemas: {
        LineItem: {
          type: 'object',
          properties: {
            uuid: { type: 'string', format: 'uuid' },
            documentId: { type: 'string', format: 'uuid' },
            description: { type: 'string', nullable: true },
            quantity: { type: 'number', nullable: true },
            unitPrice: { type: 'number', nullable: true },
            taxRate: { type: 'number', nullable: true },
            total: { type: 'number', nullable: true }
          }
        },
        Document: {
          type: 'object',
          properties: {
            uuid: { type: 'string', format: 'uuid' },
            docType: { type: 'string', nullable: true, example: 'invoice' },
            supplier: { type: 'string', nullable: true },
            docNumber: { type: 'string', nullable: true },
            issueDate: { type: 'string', format: 'date', nullable: true },
            dueDate: { type: 'string', format: 'date', nullable: true },
            currency: { type: 'string', nullable: true },
            subtotal: { type: 'number', nullable: true },
            taxTotal: { type: 'number', nullable: true },
            total: { type: 'number', nullable: true },
            status: { type: 'string', nullable: true },
            lineItems: {
              type: 'array',
              items: { $ref: '#/components/schemas/LineItem' }
            }
          }
        },
        Issue: {
          type: 'object',
          properties: {
            uuid: { type: 'string', format: 'uuid' },
            documentId: { type: 'string', format: 'uuid', nullable: true },
            issueType: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            status: { type: 'string', example: 'open' },
            severity: { type: 'string', nullable: true },
            createdBy: { type: 'string', nullable: true },
            document: {
              type: 'object',
              properties: {
                uuid: { type: 'string', format: 'uuid' },
                docNumber: { type: 'string', nullable: true }
              }
            }
          }
        },
        ValidationIssueInput: {
          type: 'object',
          properties: {
            field: { type: 'string', example: 'total' },
            message: { type: 'string', example: 'Total does not match line items' },
            level: { type: 'string', example: 'err' }
          }
        },
        DocumentUpdateRequest: {
          type: 'object',
          properties: {
            docType: { type: 'string', nullable: true },
            supplier: { type: 'string', nullable: true },
            docNumber: { type: 'string', nullable: true },
            issueDate: { type: 'string', format: 'date', nullable: true },
            dueDate: { type: 'string', format: 'date', nullable: true },
            currency: { type: 'string', nullable: true },
            subtotal: { type: 'number', nullable: true },
            taxTotal: { type: 'number', nullable: true },
            total: { type: 'number', nullable: true },
            lineItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string', nullable: true },
                  quantity: { type: 'number', nullable: true },
                  unitPrice: { type: 'number', nullable: true },
                  taxRate: { type: 'number', nullable: true },
                  total: { type: 'number', nullable: true }
                }
              }
            }
          }
        },
        DocumentStatusRequest: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', example: 'validated' }
          }
        },
        DeleteDocumentsRequest: {
          type: 'object',
          required: ['ids'],
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string', format: 'uuid' }
            }
          }
        },
        UploadResponse: {
          type: 'object',
          properties: {
            url: { type: 'string', example: '/document.html?docId=uuid' },
            id: { type: 'string', format: 'uuid' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'object' }
          }
        },
        OkResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true }
          }
        }
      }
    }
  },
  apis: [__filename]
});

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload and extract a document
 *     description: Uploads a file, extracts invoice data, persists the document, and returns the review URL.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Document created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 *       400:
 *         description: Missing upload or duplicate document number.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Extraction or persistence failure.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  let mappedDocument = null;
  let data = null;

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
    mappedDocument = mapDocumentPayload(data, id);

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
    // Check for unique constraint violation on docNumber
    if (err.name === 'SequelizeUniqueConstraintError' || err.message?.includes('Unique constraint failed')) {
      const docNumber = mappedDocument?.docNumber || data?.invoiceId || 'unknown';
      return res.status(400).json({ error: `A document with number "${docNumber}" already exists in the database. Please use a different document number.` });
    }
    return res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * @swagger
 * /api/documents:
 *   get:
 *     summary: List stored documents
 *     responses:
 *       200:
 *         description: Array of documents with line items.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 *       500:
 *         description: Failed to fetch documents.
 */
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

/**
 * @swagger
 * /api/issues:
 *   get:
 *     summary: List validation issues
 *     responses:
 *       200:
 *         description: Array of issues with the related document.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Issue'
 *       500:
 *         description: Failed to fetch issues.
 */
app.get('/api/issues', async (req, res) => {
  try {
    const issues = await Issue.findAll({
      include: [{ model: Document, as: 'document', attributes: ['uuid', 'docNumber'] }],
      order: [['documentId', 'DESC']]
    });
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * @swagger
 * /api/document/{id}/issues/unresolved:
 *   put:
 *     summary: Replace open validation issues for a document
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               issues:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ValidationIssueInput'
 *     responses:
 *       200:
 *         description: Issues updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *       404:
 *         description: Document not found.
 *       500:
 *         description: Failed to update issues.
 */
app.put('/api/document/:id/issues/unresolved', async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const id = req.params.id;
    const document = await Document.findByPk(id, { transaction });

    if (!document) {
      await transaction.rollback();
      return res.status(404).json({ error: 'document not found' });
    }

    const incomingIssues = Array.isArray(req.body?.issues) ? req.body.issues : [];

    await Issue.destroy({
      where: {
        documentId: id,
        issueType: 'validation',
        status: 'open'
      },
      transaction
    });

    const rows = incomingIssues
      .filter((issue) => issue && (issue.message || issue.field))
      .map((issue) => ({
        documentId: id,
        issueType: 'validation',
        description: [issue.field, issue.message].filter(Boolean).join(': '),
        status: 'open',
        severity: issue.level === 'err' ? 'high' : 'medium',
        createdBy: null
      }));

    if (rows.length) {
      await Issue.bulkCreate(rows, { transaction });
    }

    await transaction.commit();
    return res.json({ ok: true, count: rows.length });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * @swagger
 * /api/documents:
 *   delete:
 *     summary: Delete multiple documents
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeleteDocumentsRequest'
 *     responses:
 *       200:
 *         description: Documents deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 deletedCount:
 *                   type: integer
 *       400:
 *         description: Missing document ids.
 *       500:
 *         description: Failed to delete documents.
 */
app.delete('/api/documents', async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];

    if (!ids.length) {
      await transaction.rollback();
      return res.status(400).json({ error: 'ids are required' });
    }

    await LineItem.destroy({ where: { documentId: ids }, transaction });
    await Issue.destroy({ where: { documentId: ids }, transaction });
    const deletedCount = await Document.destroy({ where: { uuid: ids }, transaction });

    await transaction.commit();
    return res.json({ ok: true, deletedCount });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * @swagger
 * /api/document/{id}:
 *   put:
 *     summary: Update a document and its line items
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DocumentUpdateRequest'
 *     responses:
 *       200:
 *         description: Document updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OkResponse'
 *       404:
 *         description: Document not found.
 *       500:
 *         description: Failed to update document.
 */
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

/**
 * @swagger
 * /api/document/{id}/status:
 *   patch:
 *     summary: Update document status
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DocumentStatusRequest'
 *     responses:
 *       200:
 *         description: Status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OkResponse'
 *       400:
 *         description: Missing status.
 *       404:
 *         description: Document not found.
 *       500:
 *         description: Failed to update status.
 */
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

/**
 * @swagger
 * /api/document/{id}:
 *   get:
 *     summary: Get a document by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Document with line items.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       404:
 *         description: Document not found.
 *       500:
 *         description: Failed to fetch document.
 */
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
