/* ══════════════════════════════════════════════════════════════════
   api.js — All backend calls + shared UI utilities
   Every fetch lives here. Change BASE_URL to point to your server.
══════════════════════════════════════════════════════════════════ */

const BASE_URL = "http://localhost:8000";


/* ── Auth ───────────────────────────────────────────────────────── */

export function getApiKey() {
  return localStorage.getItem("user_api_key") || "";
}

export function setApiKey(key) {
  localStorage.setItem("user_api_key", key.trim());
}


/* ── Core fetch wrapper ──────────────────────────────────────────── */

async function apiFetch(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "X-API-Key": getApiKey(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let msg = `Server error ${response.status}`;
    try {
      const err = await response.json();
      msg = err.detail || err.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return response;
}


/* ── Chat ────────────────────────────────────────────────────────── */

/**
 * Send a chat message and return the assistant's reply.
 * The backend should return { answer: string } or { response: string }.
 */
export async function sendMessage(message, conversationId) {
  const res = await apiFetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });
  return res.json();
}


/* ── Documents ───────────────────────────────────────────────────── */

/**
 * Upload a single file. Accepts PDF, TXT, DOCX.
 * Backend should return the created document object.
 */
export async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/documents/upload", {
    method: "POST",
    body: form,
    // Note: do NOT set Content-Type here — the browser sets it with the boundary
  });
  return res.json();
}

/**
 * List all uploaded documents.
 * Backend should return an array of { id, filename, size, created_at }.
 */
export async function listDocuments() {
  const res = await apiFetch("/documents");
  return res.json();
}

/**
 * Delete a document by ID.
 */
export async function deleteDocument(id) {
  const res = await apiFetch(`/documents/${id}`, { method: "DELETE" });
  return res.json();
}


/* ══════════════════════════════════════════════════════════════════
   Shared UI Utilities
   Exported so page scripts can use them without duplicating code.
══════════════════════════════════════════════════════════════════ */

/* ── Toast ───────────────────────────────────────────────────────── */

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);

  // Trigger animation next frame
  requestAnimationFrame(() => el.classList.add("toast-visible"));

  setTimeout(() => {
    el.classList.remove("toast-visible");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }, 3000);
}


/* ── Settings modal ──────────────────────────────────────────────── */

function initSettingsModal() {
  const modal    = document.getElementById("settings-modal");
  const openBtn  = document.getElementById("open-settings");
  const closeBtn = document.getElementById("close-settings");
  const cancelBtn = document.getElementById("cancel-settings");
  const saveBtn  = document.getElementById("save-settings");
  const keyInput = document.getElementById("api-key-input");
  const toggleBtn = document.getElementById("toggle-key-visibility");

  if (!modal) return;

  const closeModal = () => modal.close();

  openBtn?.addEventListener("click", () => {
    keyInput.value = getApiKey();
    modal.showModal();
    keyInput.focus();
  });

  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  // Close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Toggle key visibility
  toggleBtn?.addEventListener("click", () => {
    const isHidden = keyInput.type === "password";
    keyInput.type = isHidden ? "text" : "password";
    toggleBtn.setAttribute("aria-label", isHidden ? "Hide API key" : "Show API key");
  });

  saveBtn?.addEventListener("click", () => {
    const key = keyInput.value.trim();
    setApiKey(key);
    closeModal();
    showToast(key ? "API key saved" : "API key cleared", key ? "success" : "info");
    refreshKeyDot();

    // Remove warning banner if key is now set
    if (key) {
      document.getElementById("api-warning")?.classList.add("hidden");
    }
  });
}


/* ── Sidebar active state ────────────────────────────────────────── */

function highlightActiveNav() {
  const path = window.location.pathname;
  const current = path.includes("upload")    ? "upload"
                : path.includes("documents") ? "documents"
                : "chat";

  document.querySelectorAll(".nav-item[data-page]").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === current);
  });
}


/* ── API key dot indicator ───────────────────────────────────────── */

export function refreshKeyDot() {
  const dot = document.getElementById("key-indicator");
  dot?.classList.toggle("active", !!getApiKey());
}


/* ── Mobile sidebar toggle ───────────────────────────────────────── */

function initMobileMenu() {
  const toggle   = document.getElementById("menu-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");

  const closeSidebar = () => document.body.classList.remove("sidebar-open");

  toggle?.addEventListener("click", () =>
    document.body.classList.toggle("sidebar-open")
  );

  backdrop?.addEventListener("click", closeSidebar);

  // Close when a nav link is tapped on mobile
  document.querySelectorAll(".nav-item").forEach((el) =>
    el.addEventListener("click", () => {
      if (window.innerWidth <= 768) closeSidebar();
    })
  );
}


/* ── Auto-init on every page ─────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  highlightActiveNav();
  refreshKeyDot();
  initSettingsModal();
  initMobileMenu();
});
