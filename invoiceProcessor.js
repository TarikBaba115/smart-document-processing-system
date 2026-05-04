const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;

function ensureCredentials() {
  // Fail fast with a clear error when running locally without ADC configured.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('Google Application Default Credentials not found.\nSet the environment variable GOOGLE_APPLICATION_CREDENTIALS to the path of a service account JSON, or run on GCP where ADC is available.');
  }
}

async function extractInvoiceData(file, documentType) {
  const document = await processPdfOrImage(file);
  console.log(document.text);

  const data = {
    type: documentType || "invoice",
    rawText: document.text,
    supplierName: null,
    invoiceId: null,
    invoiceDate: null,
    dueDate: null,
    currency: null,
    lineItems: [],
    netAmount: null,
    totalTaxAmount: null,
    totalAmount: null,        
  };

  for (const entity of document.entities) {
    const value = entity.mentionText?.trim();
    const normalized = entity.normalizedValue?.text || value;
    const confidence = entity.confidence;
    
    switch (entity.type) {
      case 'supplier_name':      data.supplierName = normalized; break;
      case 'invoice_id':         data.invoiceId = normalized; break;
      case 'invoice_date':       data.invoiceDate = normalized; break;
      case 'due_date':           data.dueDate = normalized; break;
      case 'currency':           data.currency = normalized; break;
      case 'line_item': {
        const item = {};
        for (const prop of entity.properties || []) {
          item[prop.type.replace('line_item/', '')] = prop.mentionText?.trim();
          console.log(`  Property: ${prop.type} -> "${prop.mentionText?.trim()}"`);
        }
        data.lineItems.push(item);
        break;
      }
      case 'net_amount':         data.netAmount = normalized; break;
      case 'total_tax_amount':   data.totalTaxAmount = normalized; break;
      case 'total_amount':       data.totalAmount = normalized; break;
    }
  }

  return data;
}

async function processPdfOrImage(file) {
  const projectId = 'document-ai-project-495016';
  const location = 'us';
  const processorId = '68c600d29ebc18f5';

  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  // ensure credentials are present before creating the client to avoid metadata lookup warnings
  ensureCredentials();

  const client = new DocumentProcessorServiceClient({
    apiEndpoint: 'us-documentai.googleapis.com',
  });

  const request = {
    name,
    rawDocument: {
      content: file.buffer.toString('base64'),
      mimeType: file.mimetype
    }
  };

  // log request metadata to help debug BadRequest from Document AI
  try {
    console.log('DocumentAI request -> name:', name, 'mimeType:', file.mimetype, 'bytes:', file.buffer ? file.buffer.length : 0);
    const [result] = await client.processDocument(request);
    return result.document;
  } catch (err) {
    console.error('DocumentAI call failed:', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = { extractInvoiceData };