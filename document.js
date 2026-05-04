/* ─── Constants ──────────────────────────────────────────────── */
const REQUIRED_FIELDS = {
  'doc-type':         'Document type',
  'supplier-name':    'Supplier name',
  'doc-number':       'Document number',
  'inv-issue':        'Issue date',
  'inv-due':          'Due date',
  'inv-currency':     'Currency',
  't-subtotal-input': 'Subtotal',
  't-tax-input':      'Tax',
  't-total-input':    'Total',
};

const DATE_FIELDS = ['inv-issue', 'inv-due'];
let currentDocumentId = null;

/* ─── DOM helpers ────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const val = (id) => String($((id))?.value || '').trim();

/* ─── Toast ──────────────────────────────────────────────────── */
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ─── Field error state ──────────────────────────────────────── */
function setFieldError(id, hasError, message = '') {
  const el = $(id);
  if (!el) return;
  const field = el.closest('.field');
  if (!field) return;

  field.classList.toggle('has-error', hasError);

  // Remove any existing dynamic error span
  field.querySelector('.field-msg-err')?.remove();

  if (hasError && message) {
    const span = document.createElement('span');
    span.className = 'field-msg field-msg-err';
    span.innerHTML = `
      <svg class="field-msg-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
        <circle cx="8" cy="8" r="6"/><path d="M8 5v4M8 11v.5"/>
      </svg>
      ${message}
    `;
    el.insertAdjacentElement('afterend', span);
  }
}

function clearFieldErrors(...ids) {
  ids.forEach(id => setFieldError(id, false));
}

/* ─── Field population ───────────────────────────────────────── */
function setValueAndValidate(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value === null || value === undefined ? '' : String(value);
  setFieldError(id, el.value.trim() === '', 'This field is required');
}

function setFileChip(documentNumber) {
  const chip = $('file-chip-number');
  chip.textContent = documentNumber?.trim() || 'Document number required';
}

function parseNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDefaultLineItemTaxRate(data) {
  const netAmount = parseNumber(data?.subtotal ?? data?.netAmount);
  const totalTaxAmount = parseNumber(data?.taxTotal ?? data?.totalTaxAmount);

  if (!netAmount) return 0;
  return (totalTaxAmount / netAmount) * 100;
}

function buildDocumentPayload() {
  return {
    docType: val('doc-type'),
    supplier: val('supplier-name'),
    docNumber: val('doc-number'),
    issueDate: val('inv-issue'),
    dueDate: val('inv-due'),
    currency: val('inv-currency'),
    subtotal: val('t-subtotal-input'),
    taxTotal: val('t-tax-input'),
    total: val('t-total-input')
  };
}

function buildLineItemsPayload() {
  return Array.from(document.querySelectorAll('#items-body tr')).map((row) => {
    const { desc, qty, price, tax } = getRowValues(row);
    const total = qty * price * (1 + tax / 100);

    return {
      description: desc,
      quantity: qty,
      unitPrice: price,
      taxRate: tax,
      total
    };
  });
}

function redirectToDashboard() {
  window.location.href = 'dashboard.html';
}

/* ─── Date validation ────────────────────────────────────────── */
function validateDates() {
  const issueVal = val('inv-issue');
  const dueVal   = val('inv-due');

  clearFieldErrors('inv-issue', 'inv-due');

  if (!issueVal) {
    setFieldError('inv-issue', true, 'This field is required');
  }
  if (!dueVal) {
    setFieldError('inv-due', true, 'This field is required');
  }
  if (!issueVal || !dueVal) {
    return (!issueVal ? [{ field: 'Issue date', message: 'Missing required field', level: 'err' }] : [])
      .concat(!dueVal ? [{ field: 'Due date',   message: 'Missing required field', level: 'err' }] : []);
  }

  const issue = new Date(issueVal);
  const due   = new Date(dueVal);
  const now   = new Date();

  if (isNaN(issue.getTime())) {
    setFieldError('inv-issue', true, 'Invalid date format');
    return [{ field: 'Issue date', message: 'Invalid date format', level: 'err' }];
  }

  if (isNaN(due.getTime())) {
    setFieldError('inv-due', true, 'Invalid date format');
    return [{ field: 'Due date', message: 'Invalid date format', level: 'err' }];
  }

  if (issue > now) {
    setFieldError('inv-issue', true, 'Issue date cannot be in the future');
    return [{ field: 'Issue date', message: 'Issue date cannot be in the future', level: 'err' }];
  }

  if (due < issue) {
    setFieldError('inv-issue', true, 'Due date cannot be before issue date');
    setFieldError('inv-due',   true, 'Due date cannot be before issue date');
    return [{ field: 'Issue/Due date', message: 'Due date cannot be before issue date', level: 'err' }];
  }

  return [];
}

/* ─── Line items ─────────────────────────────────────────────── */
function getRowValues(row) {
  return {
    desc:  row.querySelector('.desc').value.trim(),
    qty:   parseFloat(row.querySelector('.qty').value)   || 0,
    price: parseFloat(row.querySelector('.price').value) || 0,
    tax:   parseFloat(row.querySelector('.tax').value)   || 0,
  };
}

function recalc(input) {
  const row = input.closest('tr');
  const { qty, price, tax } = getRowValues(row);
  const rowTotal = qty * price * (1 + tax / 100);
  row.querySelector('.row-total').textContent = rowTotal ? '$' + rowTotal.toFixed(2) : '';
  updateComputedTotals();
  runValidation();
}

function updateComputedTotals() {
  const rows = document.querySelectorAll('#items-body tr');
  let subtotal = 0, taxTotal = 0;

  rows.forEach(row => {
    const { qty, price, tax } = getRowValues(row);
    subtotal  += qty * price;
    taxTotal  += qty * price * (tax / 100);
  });

  const total = subtotal + taxTotal;
  $('computed-subtotal').textContent = subtotal  ? '$' + subtotal.toFixed(2)  : '-';
  $('computed-tax').textContent       = taxTotal ? '$' + taxTotal.toFixed(2) : '-';
  $('computed-total').textContent     = total     ? '$' + total.toFixed(2)     : '-';
}

function hasValidLineItem() {
  return Array.from(document.querySelectorAll('#items-body tr')).some(row => {
    const { desc, qty, price } = getRowValues(row);
    return desc && qty && price;
  });
}

function addRow(prefill = {}, defaultTaxRate = 0) {
  const tr = document.createElement('tr');
  const desc  = String(prefill.description || '').replace(/"/g, '&quot;');
  const qty   = prefill.quantity  ?? '';
  const price = prefill.unitPrice ?? '';
  const taxValue = prefill.tax ?? defaultTaxRate ?? '';
  tr.innerHTML = `
    <td><input class="td-input desc"  type="text"   value="${desc}"  oninput="runValidation()" /></td>
    <td><input class="td-input qty"   type="number" value="${qty}"   min="0" style="width:48px"  oninput="recalc(this)" /></td>
    <td><input class="td-input price" type="number" value="${price}" min="0" step="0.01" style="width:80px" oninput="recalc(this)" /></td>
    <td><input class="td-input tax"   type="number" value="${taxValue}" min="0" step="0.01" style="width:64px" oninput="recalc(this)" /></td>
    <td class="row-total"></td>
    <td><button class="row-icon" onclick="removeRow(this)" title="Remove row">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M3 8h10"/>
      </svg>
    </button></td>`;

  $('items-body').appendChild(tr);
  recalc(tr.querySelector('.qty'));
}

function removeRow(btn) {
  const tbody = $('items-body');
  if (tbody.rows.length > 1) {
    btn.closest('tr').remove();
    updateComputedTotals();
    runValidation();
  } else {
    showToast('At least one line item required');
  }
}

/* ─── Validation (single source of truth) ───────────────────── */
function runValidation() {
  const issues = [];

  // Required fields
  Object.entries(REQUIRED_FIELDS).forEach(([id, label]) => {
    if (DATE_FIELDS.includes(id)) return;
    const empty = !val(id);
    setFieldError(id, empty, 'This field is required');
    if (empty) issues.push({ field: label, message: 'Missing required field', level: 'err' });
  });

  // Dates
  issues.push(...validateDates());

  // Line items
  const validLines = hasValidLineItem();
  $('line-items-wrap').style.outline = validLines ? 'none' : '1px solid var(--err)';
  $('line-items-msg').style.display  = validLines ? 'none' : 'flex';
  if (!validLines) issues.push({ field: 'Line items', message: 'At least one valid line item required', level: 'err' });

  // Subtotal and total equal expected
  const computedSubtotal = parseFloat($('computed-subtotal').textContent.replace('$', '')) || 0;
  const computedTotal = parseFloat($('computed-total').textContent.replace('$', '')) || 0;
  const enteredSubtotal = parseFloat(val('t-subtotal-input')) || 0;
  const enteredTotal = parseFloat(val('t-total-input')) || 0;

  if (enteredSubtotal && Math.abs(enteredSubtotal - computedSubtotal) > 0.0001) {
    issues.push({ field: 'Subtotal', message: 'Subtotal does not match computed value', level: 'err' });
    setFieldError('t-subtotal-input', true, 'Subtotal does not match computed value');
  }

  if (enteredTotal && Math.abs(enteredTotal - computedTotal) > 0.0001) {
    issues.push({ field: 'Total', message: 'Total does not match computed value', level: 'err' });
    setFieldError('t-total-input', true, 'Total does not match computed value');
  }

  renderIssues(issues);
  return issues.every(i => i.level !== 'err');
}

// compatibility wrapper used by some inline handlers
function validateRequired() {
  return runValidation();
}

/* ─── Issues panel ───────────────────────────────────────────── */
function renderIssues(issues) {
  const list = $('issues-list');
  if (!list) return;

  if (!issues.length) {
    list.innerHTML = '<div style="color:var(--text-2); font-size:12px">No validation issues</div>';
    return;
  }

  list.innerHTML = issues.map(it => `
    <div class="issue-item ${it.level === 'err' ? 'issue-err' : 'issue-warn'}">
      <div class="issue-ico">${it.level === 'err' ? '⚠️' : 'ℹ️'}</div>
      <div class="issue-body">
        <div class="issue-field">${it.field}</div>
        <div class="issue-msg" style="color:var(--text-2); font-size:12px">${it.message}</div>
      </div>
    </div>
  `).join('');
}

/* ─── Actions ────────────────────────────────────────────────── */
function handleSave() {
  return saveDocumentAndRedirect();
}

function handleReject() {
  return updateStatusAndRedirect('rejected');
}

function handleBack() {
  return updateStatusAndRedirect('needs_review');
}

async function saveDocumentAndRedirect() {
  if (!currentDocumentId) {
    redirectToDashboard();
    return;
  }

  if (!runValidation()) {
    showToast('Please fix all errors before saving');
    return;
  }

  try {
    const response = await fetch(`/api/document/${encodeURIComponent(currentDocumentId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...buildDocumentPayload(),
        lineItems: buildLineItemsPayload()
      })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Failed to save document');
    }

    redirectToDashboard();
  } catch (err) {
    showToast(err.message || 'Failed to save document');
  }
}

async function updateStatusAndRedirect(status) {
  if (!currentDocumentId) {
    redirectToDashboard();
    return;
  }

  try {
    const response = await fetch(`/api/document/${encodeURIComponent(currentDocumentId)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || `Failed to set status to ${status}`);
    }

    redirectToDashboard();
  } catch (err) {
    showToast(err.message || 'Failed to update document status');
  }
}

/* ─── Load document ──────────────────────────────────────────── */
async function loadDocumentFromServer() {
  const docId = new URLSearchParams(window.location.search).get('docId');
  currentDocumentId = docId;

  if (!docId) {
    setFileChip('');
    runValidation();
    return;
  }

  try {
    const res = await fetch(`/api/document/${encodeURIComponent(docId)}`);
    if (!res.ok) throw new Error('Document not found');
    const payload = await res.json();
    const data = payload.data || payload;
    const defaultTaxRate = getDefaultLineItemTaxRate(data);

    setValueAndValidate('doc-type',         data.docType   || '');
    setValueAndValidate('supplier-name',    data.supplier  || '');
    setValueAndValidate('doc-number',       data.docNumber || '');
    setValueAndValidate('inv-issue',        data.issueDate || '');
    setValueAndValidate('inv-due',          data.dueDate   || '');
    setValueAndValidate('inv-currency',     data.currency  || '');
    setValueAndValidate('t-subtotal-input', data.subtotal  ?? '');
    setValueAndValidate('t-tax-input',      data.taxTotal  ?? '');
    setValueAndValidate('t-total-input',    data.total     ?? '');

    setFileChip(data.docNumber || '');

    $('items-body').innerHTML = '';
    if (Array.isArray(data.lineItems) && data.lineItems.length) {
      data.lineItems.forEach(item => addRow({
        description: item.description || '',
        quantity: item.quantity || '',
        unitPrice: item.unitPrice || '',
        tax: item.taxRate ?? defaultTaxRate,
      }, defaultTaxRate));
    } else {
      addRow({}, defaultTaxRate);
    }
  } catch (err) {
    console.warn('Failed to load document data:', err.message);
    setFileChip('');
    addRow();
  } finally {
    updateComputedTotals();
    runValidation();
  }
}

/* ─── Event listeners ────────────────────────────────────────── */
const LIVE_VALIDATE_IDS = new Set([
  'doc-type', 'supplier-name', 'doc-number',
  'inv-issue', 'inv-due', 'inv-currency',
  't-subtotal-input', 't-tax-input', 't-total-input',
]);

document.addEventListener('input', (e) => {
  if (e.target?.id === 'doc-number') setFileChip(e.target.value);
  if (LIVE_VALIDATE_IDS.has(e.target?.id)) runValidation();
});

$('back-btn')?.addEventListener('click', handleBack);
$('confirm-save-btn')?.addEventListener('click', handleSave);
$('reject-btn')?.addEventListener('click', handleReject);

loadDocumentFromServer();