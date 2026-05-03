const documentsData = [
  {
    id: "INV-2026-0018",
    fileName: "Invoice_March.pdf",
    vendor: "Apex Solutions Ltd.",
    date: "2026-03-22",
    status: "needs_review",
    issues: [
      { title: "Total mismatch", severity: "high" },
      { title: "Due date before issue date", severity: "medium" }
    ]
  },
  {
    id: "INV-2026-0021",
    fileName: "Vendor_Billing_April.pdf",
    vendor: "Nova Compute GmbH",
    date: "2026-04-04",
    status: "validated",
    issues: []
  },
  {
    id: "INV-2026-0023",
    fileName: "Q2_setup_fee.pdf",
    vendor: "PixelForge Studio",
    date: "2026-04-07",
    status: "uploaded",
    issues: [
      { title: "Low confidence on phone number", severity: "low" }
    ]
  },
  {
    id: "INV-2026-0027",
    fileName: "maintenance_contract.pdf",
    vendor: "Sigma Infra Co.",
    date: "2026-04-11",
    status: "rejected",
    issues: [
      { title: "Missing PO reference", severity: "medium" },
      { title: "Unrecognized tax field", severity: "low" }
    ]
  },
  {
    id: "INV-2026-0031",
    fileName: "cloud_usage_april.pdf",
    vendor: "Northgrid Systems",
    date: "2026-04-13",
    status: "needs_review",
    issues: [
      { title: "Possible duplicate invoice number", severity: "high" }
    ]
  }
];

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

function getFilteredDocuments() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;

  return documentsData.filter((doc) => {
    const matchesQuery =
      doc.fileName.toLowerCase().includes(query) ||
      doc.vendor.toLowerCase().includes(query) ||
      doc.id.toLowerCase().includes(query);

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
      return `
        <tr>
          <td>
            <div class="doc-name">${doc.fileName}</div>
            <div class="doc-meta">${doc.id}</div>
          </td>
          <td>${doc.vendor}</td>
          <td>${formatDate(doc.date)}</td>
          <td><span class="status status-${doc.status}">${statusLabelMap[doc.status]}</span></td>
          <td class="issues-count">${doc.issues.length}</td>
        </tr>
      `;
    })
    .join("");
}

function flattenIssues(filteredDocs) {
  return filteredDocs.flatMap((doc) => {
    return doc.issues.map((issue) => ({
      ...issue,
      documentId: doc.id,
      fileName: doc.fileName
    }));
  });
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

function renderDashboard() {
  const filteredDocs = getFilteredDocuments();
  renderDocumentsTable(filteredDocs);
  renderIssues(filteredDocs);
  renderStats(filteredDocs);
}

searchInput.addEventListener("input", renderDashboard);
statusFilter.addEventListener("change", renderDashboard);

document.getElementById("refresh-btn").addEventListener("click", renderDashboard);

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

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const js = await res.json();
      // navigate to invoice page returned by server
      if (js && js.url) window.location.href = js.url;
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };
  input.click();
});

renderDashboard();
