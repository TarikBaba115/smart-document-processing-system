let documentsData = [];
let issuesData = [];

const statusLabelMap = {
  uploaded: "Uploaded",
  needs_review: "Needs Review",
  validated: "Validated",
  rejected: "Rejected"
};

const searchInput = document.getElementById("doc-search");
const statusFilter = document.getElementById("status-filter");
const documentsTableBody = document.getElementById("documents-table-body");
const issuesList = document.getElementById("issues-list");
const issuesTotalPill = document.getElementById("issues-total-pill");
const uploadLoading = document.getElementById("upload-loading");
const deleteBtn = document.getElementById("delete-btn");

const stats = {
  total: document.getElementById("stat-total"),
  uploaded: document.getElementById("stat-uploaded"),
  needsReview: document.getElementById("stat-needs-review"),
  validated: document.getElementById("stat-validated"),
  rejected: document.getElementById("stat-rejected")
};

function formatDate(value) {
  return new Date(value + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function formatDocType(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeSearchValue(value) {
  return String(value ?? "").toLowerCase();
}

function getIssueCountByDocumentId() {
  const counts = new Map();

  for (const issue of issuesData) {
    const issueDocumentId = issue?.documentId || issue?.document?.uuid || null;
    if (!issueDocumentId) continue;

    counts.set(issueDocumentId, (counts.get(issueDocumentId) || 0) + 1);
  }

  return counts;
}

function getFilteredDocuments() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;

  return documentsData.filter((doc) => {
    const matchesQuery =
      normalizeSearchValue(doc.docNumber).includes(query) ||
      normalizeSearchValue(doc.supplier).includes(query) ||
      normalizeSearchValue(doc.uuid).includes(query);

    const matchesStatus = selectedStatus === "all" || doc.status === selectedStatus;

    return matchesQuery && matchesStatus;
  });
}

function renderDocumentsTable(filteredDocs) {
  const issueCounts = getIssueCountByDocumentId();

  if (!filteredDocs.length) {
    documentsTableBody.innerHTML = '<tr><td class="empty" colspan="6">No documents match your filters.</td></tr>';
    updateDeleteButtonState();
    return;
  }

  documentsTableBody.innerHTML = filteredDocs
    .map((doc) => {
      const docNumber = doc.docNumber || "-";
      const docId = doc.uuid || "-";
      const docType = doc.docType ? formatDocType(doc.docType) : "-";
      const status = doc.status || "uploaded";
      const statusLabel = statusLabelMap[status] || status;
      const issueCount = issueCounts.get(doc.uuid) || 0;

      return `
        <tr class="clickable-row" data-doc-id="${docId}" tabindex="0" role="link" aria-label="Open document ${docNumber}">
          <td class="select-col">
            <input class="doc-select" type="checkbox" aria-label="Select document ${docNumber}" data-doc-id="${docId}" />
          </td>
          <td>
            <div class="doc-name">${docNumber}</div>
            <div class="doc-meta">${docId}</div>
          </td>
          <td>${docType}</td>
          <td>${doc.issueDate ? formatDate(doc.issueDate) : '-'}</td>
          <td><span class="status status-${status}">${statusLabel}</span></td>
          <td class="issues-count">${issueCount}</td>
        </tr>
      `;
    })
    .join("");

  updateDeleteButtonState();
}

async function fetchIssues() {
  try {
    const res = await fetch('/api/issues');
    if (!res.ok) throw new Error('Failed to fetch issues');
    issuesData = await res.json();
    console.log("Issues: ", JSON.stringify(issuesData, null, 2));
  } catch (err) {
    console.error('Error fetching issues:', err);
    issuesData = [];
  }
}

function renderIssues(filteredDocs) {
  const visibleDocIds = new Set(filteredDocs.map((d) => d.uuid));

  const visibleIssues = issuesData.filter((issue) => {
    // show issue if it relates to a visible document or if it has no documentId
    return !issue.documentId || visibleDocIds.has(issue.documentId);
  });

  issuesTotalPill.textContent = `${visibleIssues.length} total`;

  if (!visibleIssues.length) {
    issuesList.innerHTML = '<li class="empty">No detected issues for current view.</li>';
    return;
  }

  issuesList.innerHTML = visibleIssues
    .map((issue) => {
      const sev = issue.severity || 'none';
      const title = issue.description ? issue.description.slice(0, 80) : 'Untitled issue';
      const docNum = issue.document && issue.document.docNumber ? issue.document.docNumber : (issue.documentId || '-');
      return `
        <li class="issue-item">
          <span class="issue-severity issue-severity-${sev}">${sev}</span>
          <p class="issue-title">${title}</p>
          <p class="issue-doc">${docNum}</p>
        </li>
      `;
    })
    .join('');
}

function renderStats(filteredDocs) {
  const uploadedCount = filteredDocs.filter((doc) => doc.status === "uploaded").length;
  const needsReviewCount = filteredDocs.filter((doc) => doc.status === "needs_review").length;
  const validatedCount = filteredDocs.filter((doc) => doc.status === "validated").length;
  const rejectedCount = filteredDocs.filter((doc) => doc.status === "rejected").length;

  stats.total.textContent = String(filteredDocs.length);
  stats.uploaded.textContent = String(uploadedCount);
  stats.needsReview.textContent = String(needsReviewCount);
  stats.validated.textContent = String(validatedCount);
  stats.rejected.textContent = String(rejectedCount);
}

async function fetchDocuments() {
  try {
    const res = await fetch('/api/documents');
    if (!res.ok) throw new Error('Failed to fetch documents');
    documentsData = await res.json();
    await fetchIssues();
    renderDashboard();
  } catch (err) {
    console.error('Error fetching documents:', err);
    issuesList.innerHTML = '<li class="empty">Error loading documents.</li>';
  }
}

function renderDashboard() {
  const filteredDocs = getFilteredDocuments();
  renderDocumentsTable(filteredDocs);
  renderIssues(filteredDocs);
  renderStats(filteredDocs);
}

function getSelectedDocumentIds() {
  return Array.from(document.querySelectorAll('.doc-select:checked')).map((checkbox) => checkbox.dataset.docId).filter(Boolean);
}

function updateDeleteButtonState() {
  if (!deleteBtn) return;
  const selectedCount = getSelectedDocumentIds().length;
  deleteBtn.hidden = selectedCount === 0;
}

function setUploadLoading(isVisible) {
  if (!uploadLoading) return;
  uploadLoading.hidden = !isVisible;
  uploadLoading.setAttribute('aria-hidden', String(!isVisible));
}

function openDocument(docId) {
  if (!docId) return;
  window.location.href = `document.html?docId=${encodeURIComponent(docId)}`;
}

async function deleteSelectedDocuments() {
  const selectedIds = getSelectedDocumentIds();
  if (!selectedIds.length) return;

  const confirmed = window.confirm(`Are you sure you want to delete ${selectedIds.length} document${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`);
  if (!confirmed) return;

  try {
    const res = await fetch('/api/documents', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids: selectedIds })
    });

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Failed to delete documents');
    }

    await fetchDocuments();
  } catch (err) {
    alert(err.message || 'Failed to delete documents');
  }
}

documentsTableBody.addEventListener('click', (event) => {
  if (event.target.closest('input.doc-select')) return;
  const row = event.target.closest('tr[data-doc-id]');
  if (!row) return;
  openDocument(row.dataset.docId);
});

documentsTableBody.addEventListener('change', (event) => {
  if (!event.target.closest('input.doc-select')) return;
  const row = event.target.closest('tr[data-doc-id]');
  if (row) {
    row.classList.toggle('is-selected', event.target.checked);
  }
  updateDeleteButtonState();
});

deleteBtn?.addEventListener('click', deleteSelectedDocuments);

searchInput.addEventListener("input", renderDashboard);
statusFilter.addEventListener("change", renderDashboard);

document.getElementById("refresh-btn").addEventListener("click", fetchDocuments);

document.getElementById("new-doc-btn").addEventListener("click", async () => {
  // open file picker
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('file', file, file.name);

    setUploadLoading(true);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Upload failed');
      }
      const js = await res.json();
      // navigate to invoice page returned by server
      if (js && js.url) window.location.href = js.url;
      setUploadLoading(false);
    } catch (err) {
      alert('Upload failed: ' + err.message);
      setUploadLoading(false);
    }
  };
  input.click();
});

fetchDocuments();
