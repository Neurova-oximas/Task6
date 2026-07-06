/* ══════════════════════════════════════════════════════════════════
   documents.js — Document manager page logic
══════════════════════════════════════════════════════════════════ */

import { listDocuments, deleteDocument, showToast } from "./api.js";


/* ── DOM refs ────────────────────────────────────────────────────── */
const listEl    = document.getElementById("doc-list");
const emptyEl   = document.getElementById("docs-empty");
const loadingEl = document.getElementById("docs-loading");
const countEl   = document.getElementById("doc-count");


/* ── Init ────────────────────────────────────────────────────────── */
function init() {
  loadDocuments();

  // Refresh button (if present)
  document.getElementById("refresh-btn")?.addEventListener("click", loadDocuments);
}


/* ── Fetch & render document list ────────────────────────────────── */
async function loadDocuments() {
  setView("loading");

  try {
    const docs = await listDocuments();

    if (!Array.isArray(docs) || docs.length === 0) {
      setView("empty");
      return;
    }

    setView("list");

    // Update count label
    if (countEl) {
      countEl.textContent = `${docs.length} document${docs.length !== 1 ? "s" : ""}`;
    }

    // Render rows
    const fragment = document.createDocumentFragment();
    docs.forEach((doc) => fragment.appendChild(createDocRow(doc)));
    listEl.innerHTML = "";
    listEl.appendChild(fragment);
  } catch (err) {
    setView("empty");
    showToast(`Could not load documents — ${err.message}`, "error");
  }
}


/* ── Build a document row ────────────────────────────────────────── */
function createDocRow(doc) {
  const name = doc.filename || doc.name || "Untitled";
  const ext  = name.split(".").pop().toUpperCase();
  const size = doc.size     ? formatBytes(doc.size) : "—";
  const date = doc.created_at
    ? new Date(doc.created_at).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      })
    : "—";

  const row = document.createElement("div");
  row.className = "doc-row";
  row.dataset.id = doc.id;

  row.innerHTML = `
    <div class="doc-info">
      <span class="file-badge badge-${ext.toLowerCase()}">${ext}</span>
      <span class="doc-name" title="${escHtml(name)}">${escHtml(name)}</span>
    </div>
    <span class="doc-size">${size}</span>
    <span class="doc-date">${date}</span>
    <div class="doc-actions">
      <button class="btn-icon delete-btn" title="Delete document" aria-label="Delete ${escHtml(name)}">
        ${trashIcon()}
      </button>
    </div>
    <div class="doc-confirm hidden">
      <span>Delete this file permanently?</span>
      <button class="btn btn-danger confirm-yes">Delete</button>
      <button class="btn btn-ghost confirm-no">Cancel</button>
    </div>`;

  wireDeleteFlow(row, doc.id, name);
  return row;
}


/* ── Delete confirmation flow ────────────────────────────────────── */
function wireDeleteFlow(row, docId, name) {
  const deleteBtn  = row.querySelector(".delete-btn");
  const confirmEl  = row.querySelector(".doc-confirm");
  const confirmYes = row.querySelector(".confirm-yes");
  const confirmNo  = row.querySelector(".confirm-no");

  // Show inline confirmation
  deleteBtn.addEventListener("click", () => {
    row.classList.add("confirming");
    confirmEl.classList.remove("hidden");
    deleteBtn.style.visibility = "hidden";
    confirmYes.focus();
  });

  // Cancel
  confirmNo.addEventListener("click", () => {
    row.classList.remove("confirming");
    confirmEl.classList.add("hidden");
    deleteBtn.style.visibility = "";
  });

  // Confirm delete
  confirmYes.addEventListener("click", async () => {
    confirmYes.disabled    = true;
    confirmYes.textContent = "Deleting…";

    try {
      await deleteDocument(docId);

      // Animate row out then remove
      row.classList.add("doc-deleting");
      row.addEventListener("animationend", () => {
        row.remove();
        const remaining = listEl.querySelectorAll(".doc-row").length;

        if (countEl) {
          countEl.textContent = `${remaining} document${remaining !== 1 ? "s" : ""}`;
        }

        if (remaining === 0) setView("empty");
      }, { once: true });

      showToast(`"${name}" deleted`, "success");
    } catch (err) {
      showToast(`Delete failed — ${err.message}`, "error");
      confirmYes.disabled    = false;
      confirmYes.textContent = "Delete";
    }
  });
}


/* ── View switcher ───────────────────────────────────────────────── */
function setView(state) {
  loadingEl?.classList.toggle("hidden", state !== "loading");
  emptyEl?.classList.toggle("hidden",   state !== "empty");
  listEl?.classList.toggle("hidden",    state !== "list");
}


/* ── Helpers ─────────────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trashIcon() {
  return `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M5.5 1.5h4M1.5 3.5h12M4 3.5l.75 8.75c.04.42.39.75.81.75h3.88c.42 0 .77-.33.81-.75L11 3.5"
          stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}


init();
