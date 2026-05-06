const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;

function createDocumentAiClient() {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

  if (credentialsJson) {
    const credentials = JSON.parse(credentialsJson);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    return new DocumentProcessorServiceClient({
      credentials,
      projectId: projectId || credentials.project_id,
      apiEndpoint: process.env.DOCUMENT_AI_API_ENDPOINT || 'us-documentai.googleapis.com'
    });
  }

  return new DocumentProcessorServiceClient({
    apiEndpoint: process.env.DOCUMENT_AI_API_ENDPOINT || 'us-documentai.googleapis.com'
  });
}

async function extractInvoiceData(file, documentType) {
  const document = await processPdfOrImage(file);
  console.log(document.text);
  const rawText = String(document.text || '');
  const lowerText = rawText.toLowerCase();

  let detectedType = 'invoice';
  if (lowerText.includes('purchase order')) {
    detectedType = 'purchase_order';
  } else if (lowerText.includes('invoice')) {
    detectedType = 'invoice';
  }

  const data = {
    type: detectedType,
    rawText,
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

  // Try to enrich missing fields from rawText using user-provided regex scanners
  function enrichDataWithRegex(dataObj) {
    const text = String(dataObj.rawText || '');
    if (!text) return dataObj;

    const DOCUMENT_SCANNERS = [
      ['supplier', [
        /(?:supplier|vendor|billed\s*by|sold\s*by|from)\s*[:\-]\s*(.{2,80})/i,
        /(?:supplier|vendor)\s*name\s*[:\-]\s*(.{2,80})/i,
      ]],
      ['docNumber', [
        /invoice\s*(?:no|number|#|num)\.?\s*[:\-]?\s*([\w\-\/]+)/i,
        /(?:document|doc)\s*(?:no|number|#)\.?\s*[:\-]?\s*([\w\-\/]+)/i,
        /(?:p\.?o\.?|purchase\s*order)\s*(?:no|number|#)?\s*[:\-]?\s*([\w\-\/]+)/i,
        /\b(?:ref|reference)\s*(?:no|#)?\s*[:\-]\s*([\w\-\/]+)/i,
      ]],
      ['issueDate', [
        /(?:invoice|issue|issued|document|doc)\s*date\s*[:\-]?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i,
        /(?:invoice|issue|issued|document|doc)\s*date\s*[:\-]?\s*(\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i,
        /(?:invoice|issue|issued|document|doc)\s*date\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
        /date\s*of\s*issue\s*[:\-]?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i,
        /^date\s*[:\-]\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/im,
      ]],
      ['dueDate', [
        /(?:due|payment\s*due|pay(?:ment)?\s*by|due\s*by)\s*(?:date)?\s*[:\-]?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i,
        /(?:due|payment\s*due|pay(?:ment)?\s*by|due\s*by)\s*(?:date)?\s*[:\-]?\s*(\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/i,
        /(?:due|payment\s*due|pay(?:ment)?\s*by|due\s*by)\s*(?:date)?\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      ]],
      ['currency', [
        /currency\s*(?:code)?\s*[:\-]\s*([A-Z]{3})\b/i,
        /\b(USD|EUR|GBP|BAM|CHF|CAD|AUD|JPY|CNY|SEK|NOK|DKK|PLN|CZK|HUF)\b/,
        /([\$€£¥₹])/,
      ]],
      ['subtotal', [
        /(?:sub\s*total|subtotal)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /net\s*(?:amount|total|value)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /(?:before\s*tax|excl\.?\s*(?:tax|vat)|taxable\s*amount)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /amount\s*before\s*(?:tax|vat)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
      ]],
      ['taxTotal', [
        /(?:total\s*tax|tax\s*total|tax\s*amount)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /(?:vat|gst)\s*(?:amount|total)?\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /^tax\s*[:\-]\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)(?!\s*%)/im,
      ]],
      ['total', [
        /(?:grand\s*total|invoice\s*total|total\s*(?:due|amount|payable)?)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /(?:amount\s*(?:due|payable)|balance\s*due)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /^total\s*[:\-]\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/im,
      ]],
    ];

    const LINE_ITEM_SCANNERS = [
      ['description', [
        /(?:description|item|service|product|details?)\s*[:\-]\s*(.{3,120})/i,
        /^(?!\s*[\d,]+(?:\.\d+)?\s*$)([A-Za-z][^\n]{5,100})/m,
      ]],
      ['quantity', [
        /(?:qty|quantity|units?|pcs?|hours?|hrs?)\s*[:\-]?\s*(\d+(?:\.\d{1,3})?)/i,
        /(\d+(?:\.\d{1,3})?)\s*x\s+/i,
        /\bx\s*(\d+(?:\.\d{1,3})?)/i,
      ]],
      ['unitPrice', [
        /(?:unit\s*price|unit\s*cost|price\s*per\s*unit|rate|each|per\s*unit)\s*[:\-]?\s*[$€£]?\s*(\d+(?:[,\.]\d{1,2})+)/i,
        /@\s*[$€£]?\s*(\d+(?:[,\.]\d{1,2})+)/,
        /[$€£]\s*(\d+(?:[,\.]\d{1,2})+)\s*\/\s*(?:hr|hour|unit|pc|each)/i,
      ]],
      ['taxRate', [
        /(?:vat|gst|tax\s*rate?|tax)\s*[:\-@]?\s*(\d{1,2}(?:\.\d{1,4})?)\s*%/i,
        /(\d{1,2}(?:\.\d{1,4})?)\s*%\s*(?:vat|gst|tax)/i,
        /(?:incl\.?|including)\s+(\d{1,2}(?:\.\d{1,4})?)\s*%\s*(?:vat|gst|tax)/i,
      ]],
      ['total', [
        /(?:line\s*total|row\s*total|ext(?:ended)?\s*(?:price|amount)?|amount)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /(?:total\s*price|total\s*cost)\s*[:\-]?\s*[$€£]?\s*([\d,]+(?:\.\d{1,2})?)/i,
      ]],
    ];

    const scanTopLevel = (scanners) => {
      const out = {};
      for (const [key, regexes] of scanners) {
        // map keys to our dataObj property names
        let prop = null;
        switch (key) {
          case 'supplier': prop = 'supplierName'; break;
          case 'docNumber': prop = 'invoiceId'; break;
          case 'issueDate': prop = 'invoiceDate'; break;
          case 'dueDate': prop = 'dueDate'; break;
          case 'currency': prop = 'currency'; break;
          case 'subtotal': prop = 'netAmount'; break;
          case 'taxTotal': prop = 'totalTaxAmount'; break;
          case 'total': prop = 'totalAmount'; break;
          default: prop = key;
        }

        if (dataObj[prop] || dataObj[prop] === 0) continue;
        for (const rx of regexes) {
          const m = rx.exec(text);
          if (m && m[1]) {
            out[prop] = m[1].trim();
            break;
          }
        }
      }
      return out;
    };

    const topFound = scanTopLevel(DOCUMENT_SCANNERS);

    const parseAmount = (v) => {
      if (!v && v !== 0) return null;
      const s = String(v).replace(/[,\s]/g, '').replace(/[$€£¥₹]/g, '');
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };

    const parseTaxRate = (v) => {
      if (!v && v !== 0) return null;
      const parsed = parseFloat(String(v).replace(/[%\s]/g, '').replace(',', '.'));
      if (!Number.isFinite(parsed)) return null;
      return parsed > 1 ? parsed / 100 : parsed;
    };

    const logFieldSource = (fieldName, apiValue, regexValue, chosenValue) => {
      console.log('[invoiceProcessor] field source', {
        field: fieldName,
        apiValue: apiValue ?? null,
        regexValue: regexValue ?? null,
        chosenSource: chosenValue === apiValue ? 'api' : (chosenValue === regexValue ? 'regex' : 'none'),
        chosenValue: chosenValue ?? null,
      });
    };

    const pickFieldValue = (fieldName, apiValue, regexValue, transform = (value) => value) => {
      const chosenValue = apiValue || regexValue || null;
      const transformedValue = chosenValue !== null ? transform(chosenValue) : null;
      logFieldSource(fieldName, apiValue, regexValue, chosenValue);
      return transformedValue;
    };

    const merged = Object.assign({}, dataObj, {
      supplierName: pickFieldValue('supplierName', dataObj.supplierName, topFound.supplierName),
      invoiceId: pickFieldValue('invoiceId', dataObj.invoiceId, topFound.invoiceId),
      invoiceDate: pickFieldValue('invoiceDate', dataObj.invoiceDate, topFound.invoiceDate),
      dueDate: pickFieldValue('dueDate', dataObj.dueDate, topFound.dueDate),
      currency: pickFieldValue('currency', dataObj.currency, topFound.currency),
      netAmount: pickFieldValue('netAmount', dataObj.netAmount, topFound.netAmount || topFound.subtotal, parseAmount),
      totalTaxAmount: pickFieldValue('totalTaxAmount', dataObj.totalTaxAmount, topFound.totalTaxAmount || topFound.taxTotal, parseAmount),
      totalAmount: pickFieldValue('totalAmount', dataObj.totalAmount, topFound.totalAmount || topFound.total, parseAmount),
      lineItems: Array.isArray(dataObj.lineItems) ? dataObj.lineItems.slice() : [],
    });

    // Enrich line items
    for (const li of merged.lineItems) {
      if (!li) continue;
      for (const [fieldKey, regexes] of LINE_ITEM_SCANNERS) {
        // map to property name
        const prop = (fieldKey === 'unitPrice') ? 'unitPrice' : (fieldKey === 'total' ? 'total' : fieldKey);
        if (li[prop] || li[prop] === 0) continue;
        // try to find near description first
        let foundVal = null;
        if (li.description) {
          const esc = li.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          for (const rx of regexes) {
            const re = new RegExp(esc + '[\s\S]{0,80}' + rx.source, rx.flags);
            const m = re.exec(text);
            if (m && m[1]) { foundVal = m[1]; break; }
          }
        }
        // fallback: any match in the document
        if (!foundVal) {
          for (const rx of regexes) {
            const m = rx.exec(text);
            if (m && m[1]) { foundVal = m[1]; break; }
          }
        }
        if (foundVal) {
          let v = foundVal.trim();
          if (fieldKey === 'quantity') v = parseFloat(v.replace(',', '.')) || v;
          if (fieldKey === 'taxRate') v = parseTaxRate(v) ?? v;
          if (fieldKey === 'unitPrice' || fieldKey === 'total') v = parseFloat(String(v).replace(/[,\s$€£]/g, '')) || v;
          console.log('[invoiceProcessor] line item source', {
            index: merged.lineItems.indexOf(li),
            field: prop,
            apiValue: li[prop] ?? null,
            regexValue: v,
            chosenSource: li[prop] ? 'api' : 'regex',
            chosenValue: li[prop] || v,
          });
          li[prop] = v;
        }
      }
    }

    // If still no line items, attempt to extract simple rows
    if (!merged.lineItems.length) {
      const rows = [];
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const m = line.match(/^(.{3,80}?)\s+(\d+(?:[\.,]\d+)?)\s+[$€£]?([0-9,]+\.[0-9]{2})$/);
        if (m) rows.push({ description: m[1].trim(), quantity: parseFloat(m[2].replace(',', '.')), unitPrice: parseFloat(m[3].replace(/,/g, '')), taxRate: null, total: null });
      }
      if (rows.length) merged.lineItems = rows;
    }

    return merged;
  }

  const enriched = enrichDataWithRegex(data);
  return enriched;
}

async function processPdfOrImage(file) {
  const projectId = 'document-ai-project-495016';
  const location = 'us';
  const processorId = '68c600d29ebc18f5';

  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  const client = createDocumentAiClient();

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