# main.py — API handling

from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import MODEL, BASE_URL, TEMPERATURE, API_KEY
from rag import RAGPipeline

# ── App setup ────────────────────────────────────────────────────────

app = FastAPI(
    title="RAG API",
    description="API to call my LLM and RAG operations (loading docs, etc..)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── RAG instance (loads embedding model + FAISS index once at startup) ──

rag = RAGPipeline(model=MODEL, url=BASE_URL, temperature=TEMPERATURE)


# ── Request models ───────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    conversation_id: str


# ── Helper: resolve API key ──────────────────────────────────────────

def resolve_key(x_api_key: str | None) -> str:
    """
    Use the key from the request header if present,
    fall back to the .env key for debugging.
    """
    key = x_api_key or API_KEY
    if not key:
        raise HTTPException(status_code=401, detail="No API key provided")
    return key


# ── Endpoints ────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(request: ChatRequest, x_api_key: str | None = Header(None)):
    key = resolve_key(x_api_key)
    answer = rag.query(request.message, conversation_id=request.conversation_id, api_key=key)
    return {"answer": answer}


@app.post("/documents/upload")          # you had "documents/upload" — missing leading /
async def upload_document(
    file: UploadFile = File(...),
    x_api_key: str | None = Header(None),
):
    resolve_key(x_api_key)             # validate key even if upload doesn't need it
    contents = await file.read()
    record = rag.ingest(contents, filename=file.filename)
    return record                       # rag.ingest() already returns the right shape


@app.get("/documents")
async def list_documents(x_api_key: str | None = Header(None)):
    resolve_key(x_api_key)
    return rag.list_documents()


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, x_api_key: str | None = Header(None)):
    resolve_key(x_api_key)
    deleted = rag.delete_document(doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    return {"deleted": doc_id}