# RECALL 🧠

A personal RAG (Retrieval-Augmented Generation) chatbot that answers questions about you based on your own uploaded documents — CV, life story, LinkedIn data, or any personal file.

Built with LangChain, FAISS, and FastAPI. Powered by any OpenAI-compatible LLM provider (OpenRouter by default).

---

## What it does

- Upload your personal documents (PDF, TXT, DOCX)
- Ask questions about yourself in natural language
- Get accurate answers retrieved directly from your files
- Remembers the last 10 messages of your conversation

---

## Project Structure

```
RECALL/
├── docs and screenshots/       # Screenshots and test files
├── src/
│   ├── backend/
│   │   ├── config.py           # Loads environment variables
│   │   ├── main.py             # FastAPI endpoints
│   │   ├── rag.py              # LangChain RAG logic
│   │   ├── requirements.txt    # Python dependencies
│   │   └── uploads/            # Upload folder (empty by default)
│   ├── experiments/            # Jupyter notebooks and test scripts
│   └── frontend/
│       ├── index.html          # Main entry point
│       ├── pages/              # Chat, Documents, Upload pages
│       ├── css/
│       │   └── style.css
│       └── js/
│           ├── api.js          # All backend calls
│           ├── chat.js
│           ├── documents.js
│           └── upload.js
├── .env.example                # Environment variable template
├── .gitignore
├── LICENSE
└── README.md
```

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/Neurova-oximas/Task6.git
cd Task6
```

### 2. Set up the backend

```bash
cd src/backend
pip install -r requirements.txt
```

### 3. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
API_KEY=your-key-here        # Only used for debugging (curl testing etc.)
MODEL=openrouter/auto        # Or any model your provider supports
BASE_URL=https://openrouter.ai/api/v1
TEMPERATURE=0.7
```

> **Note:** The API key you set here is only used for server-side debugging.
> The key actually used for chat comes from the Settings modal in the UI — stored in your browser and sent with every request. It never touches the server permanently.

### 4. Start the backend

```bash
cd src/backend
uvicorn main:app --reload
```

You should see:

```
INFO: Uvicorn running on http://127.0.0.1:8000
```

### 5. Open the frontend

Open `src/frontend/index.html` using **VS Code Live Server** (right click → Open with Live Server).

> ⚠️ **Do not open it by double-clicking.** The settings modal won't work on the `file://` protocol. Always use Live Server or any local HTTP server.

### 6. Set your API key

Click **Settings** (bottom left) → paste your OpenRouter (or other provider) API key → Save.

---

## Usage

1. Go to **Upload** → upload your CV, life story, or any personal document (PDF, TXT, or DOCX)
2. Go to **Chat** → start asking questions:
   - *Who is this person?*
   - *What are his skills?*
   - *What projects did he work on?*
   - *Summarize his career.*
3. Go to **Documents** → view or delete uploaded files

---

## Changing the model or provider

The frontend only lets you change the API key. To change the model or provider, open `.env` directly:

```env
MODEL=gpt-4o-mini
BASE_URL=https://api.openai.com/v1
```

Any OpenAI-compatible provider works (OpenRouter, OpenAI, Together AI, Groq, etc.) as long as you have an API key for it.

---

## Common issues

**Settings modal doesn't open**  
You're opening `index.html` by double-clicking. Use VS Code Live Server instead.

**`Could not import module "main"`**  
You're running `uvicorn` from the wrong folder. Make sure you're in `src/backend/`:

```bash
cd src/backend
uvicorn main:app --reload
```

**`No documents uploaded yet`**  
You haven't uploaded any files. Go to the Upload page first.

**Embeddings warning on startup**

```
LangChainDeprecationWarning: HuggingFaceEmbeddings...
```

Harmless. The app works fine. Will be cleaned up in a future update.

**`embeddings.position_ids UNEXPECTED`**  
Also harmless. Just a version mismatch note from the embedding model. Ignore it.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | FastAPI, Python |
| RAG | LangChain, FAISS |
| Embeddings | `all-MiniLM-L6-v2` (local, no API needed) |
| LLM | Any OpenAI-compatible provider via API |
| Default provider | OpenRouter |

---

## Notes

- The FAISS index and document metadata are stored locally in `src/backend/` and are not committed to git
- Conversation memory is in-memory only — resets when the server restarts
- The embedding model runs locally — only the LLM calls go to the API