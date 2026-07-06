/* ══════════════════════════════════════════════════════════════════
   chat.js — Chat page logic
══════════════════════════════════════════════════════════════════ */

import { sendMessage, getApiKey, showToast } from "./api.js";

/* ── State ───────────────────────────────────────────────────────── */
let conversationId = crypto.randomUUID();
let messageCount   = 0;
let isLoading      = false;


/* ── DOM refs ────────────────────────────────────────────────────── */
const messagesEl  = document.getElementById("chat-messages");
const emptyEl     = document.getElementById("empty-state");
const inputEl     = document.getElementById("chat-input");
const sendBtn     = document.getElementById("send-btn");
const warningEl   = document.getElementById("api-warning");
const newChatEl   = document.getElementById("new-chat-btn");
const bannerBtn   = document.getElementById("banner-settings-btn");
const openSettings = () => document.getElementById("open-settings")?.click();


/* ── Init ────────────────────────────────────────────────────────── */
function init() {
  // Show warning if no API key
  if (!getApiKey()) warningEl?.classList.remove("hidden");

  // Banner settings link
  bannerBtn?.addEventListener("click", openSettings);

  // Send on button click
  sendBtn?.addEventListener("click", handleSend);

  // Send on Enter (Shift+Enter = new line)
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-grow textarea
  inputEl?.addEventListener("input", autoGrow);

  // Prompt chips in empty state
  document.querySelectorAll(".prompt-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!inputEl) return;
      inputEl.value = chip.dataset.prompt || chip.textContent.trim();
      inputEl.focus();
      autoGrow();
    });
  });

  // New chat button — intercept on the chat page
  newChatEl?.addEventListener("click", (e) => {
    e.preventDefault();
    newConversation();
  });
}


/* ── Auto-grow textarea ──────────────────────────────────────────── */
function autoGrow() {
  if (!inputEl) return;
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}


/* ── Send message ────────────────────────────────────────────────── */
async function handleSend() {
  const text = inputEl?.value.trim();
  if (!text || isLoading) return;

  if (!getApiKey()) {
    showToast("Add your API key in Settings first", "warning");
    openSettings();
    return;
  }

  // Clear input
  inputEl.value = "";
  autoGrow();

  // Render user message
  appendMessage(text, "user");

  // Set loading state
  isLoading = true;
  sendBtn.disabled = true;
  const typingEl = renderTyping();

  try {
    const data = await sendMessage(text, conversationId);
    typingEl.remove();

    // Accept whatever field the backend sends the answer in
    const reply =
      data.answer   ||
      data.response ||
      data.message  ||
      data.content  ||
      "No response received.";

    appendMessage(reply, "assistant");
  } catch (err) {
    typingEl.remove();
    appendMessage(`⚠ ${err.message}`, "assistant", true);
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}


/* ── Render a message bubble ─────────────────────────────────────── */
function appendMessage(content, role, isError = false) {
  // Hide empty state once conversation starts
  if (messageCount === 0 && emptyEl) {
    emptyEl.classList.add("hidden");
  }
  messageCount++;

  const wrap = document.createElement("div");
  wrap.className = `message message-${role}${isError ? " message-error" : ""}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = renderMarkdown(content);

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "You" : "Recall";

  wrap.appendChild(bubble);
  wrap.appendChild(meta);
  messagesEl.appendChild(wrap);

  scrollToBottom();
}


/* ── Typing / loading indicator ──────────────────────────────────── */
function renderTyping() {
  const wrap = document.createElement("div");
  wrap.className = "message message-assistant";
  wrap.innerHTML = `
    <div class="message-bubble typing-bubble">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>`;
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}


/* ── Reset conversation ──────────────────────────────────────────── */
function newConversation() {
  conversationId = crypto.randomUUID();
  messageCount   = 0;
  messagesEl.innerHTML = "";
  emptyEl?.classList.remove("hidden");
  inputEl.value = "";
  autoGrow();
  inputEl.focus();
}


/* ── Scroll ──────────────────────────────────────────────────────── */
function scrollToBottom() {
  messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
}


/* ── Lightweight markdown renderer ──────────────────────────────── */
function renderMarkdown(raw) {
  // 1. Escape HTML to prevent XSS
  let text = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Fenced code blocks (``` lang \n code ```)
  text = text.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code${lang ? ` class="lang-${lang}"` : ""}>${code.trimEnd()}</code></pre>`
  );

  // 3. Inline code
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // 4. Bold & italic
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g,     "<em>$1</em>");

  // 5. Line breaks (outside code blocks — crude but sufficient for chat)
  text = text.replace(/\n/g, "<br>");

  return text;
}


init();
