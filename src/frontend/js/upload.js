/* ══════════════════════════════════════════════════════════════════
   upload.js — File upload page logic
══════════════════════════════════════════════════════════════════ */

import { uploadFile, showToast } from "./api.js";

/* ── Accepted MIME types ─────────────────────────────────────────── */
const ACCEPTED = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

const EXT_FALLBACK = new Set(["pdf", "txt", "md", "docx", "doc"]);


/* ── DOM refs ────────────────────────────────────────────────────── */
const dropZone  = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");
const queue     = document.getElementById("file-queue");


/* ── Init ────────────────────────────────────────────────────────── */
function init() {
  // Click-to-browse
  browseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Clicking the zone also opens picker (but not on the button)
  dropZone?.addEventListener("click", (e) => {
    if (e.target === browseBtn || browseBtn?.contains(e.target)) return;
    fileInput.click();
  });

  fileInput?.addEventListener("change", () => {
    handleFiles(Array.from(fileInput.files));
    fileInput.value = ""; // Allow re-uploading the same file
  });

  // Drag events
  dropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone?.addEventListener("dragleave", (e) => {
    // Only remove class when leaving the zone itself, not a child
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove("drag-over");
    }
  });

  dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    handleFiles(Array.from(e.dataTransfer.files));
  });
}


/* ── File validation & routing ───────────────────────────────────── */
function handleFiles(files) {
  const valid   = files.filter(isAccepted);
  const invalid = files.filter((f) => !isAccepted(f));

  if (invalid.length) {
    const names = invalid.map((f) => f.name).join(", ");
    showToast(
      `Skipped ${invalid.length} unsupported file${invalid.length > 1 ? "s" : ""} — only PDF, TXT, DOCX`,
      "warning"
    );
    console.warn("Rejected files:", names);
  }

  valid.forEach(processFile);
}

function isAccepted(file) {
  if (ACCEPTED.has(file.type)) return true;
  const ext = file.name.split(".").pop().toLowerCase();
  return EXT_FALLBACK.has(ext);
}


/* ── Upload a single file ────────────────────────────────────────── */
async function processFile(file) {
  const item        = createQueueItem(file);
  const progressFill = item.querySelector(".file-progress-fill");
  const statusEl    = item.querySelector(".file-status");

  queue.prepend(item); // New files appear at the top

  // Fake progress to ~45% while waiting for the server
  let fake = 0;
  const ticker = setInterval(() => {
    fake = Math.min(fake + 3, 45);
    progressFill.style.width = fake + "%";
  }, 80);

  try {
    await uploadFile(file);

    clearInterval(ticker);
    progressFill.style.width = "100%";
    progressFill.classList.add("complete");
    statusEl.textContent = "Ready — document indexed";
    statusEl.className   = "file-status status-success";
    item.classList.add("upload-done");
    showToast(`"${file.name}" uploaded`, "success");
  } catch (err) {
    clearInterval(ticker);
    progressFill.style.width = "100%";
    progressFill.classList.add("error");
    statusEl.textContent = `Failed — ${err.message}`;
    statusEl.className   = "file-status status-error";
    showToast(`Upload failed: ${err.message}`, "error");
  }
}


/* ── Build the queue item DOM ────────────────────────────────────── */
function createQueueItem(file) {
  const ext     = file.name.split(".").pop().toUpperCase();
  const sizeStr = formatBytes(file.size);

  const el = document.createElement("div");
  el.className = "file-item";
  el.innerHTML = `
    <div class="file-item-icon">
      <span class="file-badge badge-${ext.toLowerCase()}">${ext}</span>
    </div>
    <div class="file-item-body">
      <div class="file-item-header">
        <span class="file-name" title="${escHtml(file.name)}">${escHtml(file.name)}</span>
        <span class="file-size">${sizeStr}</span>
      </div>
      <div class="file-progress">
        <div class="file-progress-fill"></div>
      </div>
      <span class="file-status">Uploading…</span>
    </div>`;

  return el;
}


/* ── Helpers ─────────────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


init();
