let documentsData = [];

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

function normalizeSearchValue(value) {
  return String(value ?? "").toLowerCase();
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
  if (!filteredDocs.length) {
    documentsTableBody.innerHTML = '<tr><td class="empty" colspan="5">No documents match your filters.</td></tr>';
    return;
  }

  documentsTableBody.innerHTML = filteredDocs
    .map((doc) => {
      const docNumber = doc.docNumber || "-";
      const docId = doc.uuid || "-";
      const docType = doc.docType || "-";
      const status = doc.status || "uploaded";
      const statusLabel = statusLabelMap[status] || status;

      return `
        <tr class="clickable-row" data-doc-id="${docId}" tabindex="0" role="link" aria-label="Open document ${docNumber}">
          <td>
            <div class="doc-name">${docNumber}</div>
            <div class="doc-meta">${docId}</div>
          </td>
          <td>${docType}</td>
          <td>${doc.issueDate ? formatDate(doc.issueDate) : '-'}</td>
          <td><span class="status status-${status}">${statusLabel}</span></td>
          <td class="issues-count">0</td>
        </tr>
      `;
    })
    .join("");
}

function flattenIssues(filteredDocs) {
  return [];
}

function renderIssues(filteredDocs) {
  const issues = flattenIssues(filteredDocs);
  issuesTotalPill.textContent = `${issues.length} total`;

  if (!issues.length) {
    issuesList.innerHTML = '<li class="empty">No detected issues for current view.</li>';
    return;
  }

  issuesList.innerHTML = issues
    .map((issue) => {
      return `
        <li class="issue-item">
          <span class="issue-severity issue-severity-${issue.severity}">${issue.severity}</span>
          <p class="issue-title">${issue.title}</p>
          <p class="issue-doc">${issue.fileName} (${issue.documentId})</p>
        </li>
      `;
    })
    .join("");
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

function setUploadLoading(isVisible) {
  if (!uploadLoading) return;
  uploadLoading.hidden = !isVisible;
  uploadLoading.setAttribute('aria-hidden', String(!isVisible));
}

function openDocument(docId) {
  if (!docId) return;
  window.location.href = `document.html?docId=${encodeURIComponent(docId)}`;
}

documentsTableBody.addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-doc-id]');
  if (!row) return;
  openDocument(row.dataset.docId);
});

documentsTableBody.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = event.target.closest('tr[data-doc-id]');
  if (!row) return;
  event.preventDefault();
  openDocument(row.dataset.docId);
});

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
      if (!res.ok) throw new Error('Upload failed');
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
