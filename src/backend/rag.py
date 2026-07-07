# rag.py — LangChain logic: ingestion, retrieval, generation

import os
import uuid
import json
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from langchain_openai import ChatOpenAI
from langchain_community.document_loaders import TextLoader, PyPDFLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# Where to persist the vector store and doc metadata on disk
INDEX_DIR = "faiss_index"
META_FILE  = "documents_meta.json"


# ── Metadata helpers (simple JSON file as a "database") ──────────────

def _load_meta() -> list[dict]:
    if os.path.exists(META_FILE):
        with open(META_FILE, "r") as f:
            return json.load(f)
    return []

def _save_meta(meta: list[dict]):
    with open(META_FILE, "w") as f:
        json.dump(meta, f, indent=2)


# ── Pick the right loader based on file extension ────────────────────

def _load_file(tmp_path: str, filename: str):
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return PyPDFLoader(tmp_path).load()
    elif ext in (".docx", ".doc"):
        return Docx2txtLoader(tmp_path).load()
    else:  # .txt, .md
        return TextLoader(tmp_path, encoding="utf-8").load()


# ── Main RAG class ────────────────────────────────────────────────────

class RAGPipeline:
    """
    Handles document ingestion and RAG queries.
    
    API key is NOT stored here — it comes per-request from the user's browser
    and is passed into query(). This way the embedding model loads once at
    startup and gets reused, which is the expensive part.
    """

    def __init__(self, model: str, url: str, temperature: float = 0.7):
        self.model       = model
        self.url         = url
        self.temperature = temperature

        # Embedding model is local (no API key needed), load it once
        self.embedding = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

        # Try to load an existing index from disk
        self.vectorstore = None
        self._try_load_index()

    # ── Internal helpers ─────────────────────────────────────────────

    def _try_load_index(self):
        """Load persisted FAISS index from disk if it exists."""
        if os.path.exists(INDEX_DIR):
            try:
                self.vectorstore = FAISS.load_local(
                    INDEX_DIR,
                    self.embedding,
                    allow_dangerous_deserialization=True  # safe since it's your own files
                )
                print(f"[RAG] Loaded existing index from {INDEX_DIR}")
            except Exception as e:
                print(f"[RAG] Could not load index: {e}")
                self.vectorstore = None

    def _save_index(self):
        """Persist the current FAISS index to disk."""
        if self.vectorstore:
            self.vectorstore.save_local(INDEX_DIR)

    def _get_llm(self, api_key: str) -> ChatOpenAI:
        """Create a fresh LLM client using the user's API key."""
        return ChatOpenAI(
            api_key=api_key,
            base_url=self.url,
            model=self.model,
            temperature=self.temperature,
        )

    # ── Public methods (called by main.py) ───────────────────────────

    def ingest(self, file_bytes: bytes, filename: str) -> dict:
        """
        Take raw file bytes, chunk + embed them, add to the vector store.
        Returns a metadata dict that main.py sends back to the frontend.
        """
        # Write bytes to a temp file — loaders need a file path
        suffix = Path(filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            docs = _load_file(tmp_path, filename)
        finally:
            os.unlink(tmp_path)  # clean up temp file regardless

        # Tag every chunk with a shared doc_id so we can delete later
        doc_id = str(uuid.uuid4())
        for doc in docs:
            doc.metadata["doc_id"]   = doc_id
            doc.metadata["filename"] = filename

        # Chunk into pieces the LLM context window can handle
        splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
        chunks   = splitter.split_documents(docs)

        # Add to existing index or create a new one
        if self.vectorstore is None:
            self.vectorstore = FAISS.from_documents(chunks, self.embedding)
        else:
            self.vectorstore.add_documents(chunks)

        self._save_index()

        # Record metadata and return it
        record = {
            "id":         doc_id,
            "filename":   filename,
            "size":       len(file_bytes),
            "created_at": datetime.utcnow().isoformat(),
        }
        meta = _load_meta()
        meta.append(record)
        _save_meta(meta)

        return record

    def query(self, message: str, api_key: str) -> str:
        """
        RAG query: retrieve relevant chunks → build prompt → call LLM.
        Returns the answer as a plain string.
        """
        if self.vectorstore is None:
            return "No documents uploaded yet. Go to the Upload page and add some files first."

        retriever = self.vectorstore.as_retriever(search_kwargs={"k": 4})

        def format_docs(docs):
            return "\n\n---\n\n".join(doc.page_content for doc in docs)

        prompt = ChatPromptTemplate.from_template("""
You are a helpful personal assistant with access to the user's documents.
Use the context below to answer the question as accurately as possible.
If the answer isn't in the context, say you don't know — don't make things up.

Context:
{context}

Question: {question}

Answer:""")

        chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | prompt
            | self._get_llm(api_key)
            | StrOutputParser()
        )

        return chain.invoke(message)

    def list_documents(self) -> list[dict]:
        """Return metadata for all uploaded documents."""
        return _load_meta()

    def delete_document(self, doc_id: str) -> bool:
        """
        Delete a document by ID.
        FAISS doesn't support deletion, so we filter out that doc's chunks
        and rebuild the index from what's left.
        """
        meta      = _load_meta()
        remaining = [d for d in meta if d["id"] != doc_id]

        if len(remaining) == len(meta):
            return False  # nothing deleted — ID not found

        _save_meta(remaining)

        if not remaining:
            # No documents left — wipe everything
            self.vectorstore = None
            if os.path.exists(INDEX_DIR):
                shutil.rmtree(INDEX_DIR)
        else:
            # Grab all chunks from the in-memory store, filter, rebuild
            all_chunks = list(self.vectorstore.docstore._dict.values())
            kept       = [c for c in all_chunks if c.metadata.get("doc_id") != doc_id]

            if kept:
                self.vectorstore = FAISS.from_documents(kept, self.embedding)
                self._save_index()
            else:
                self.vectorstore = None

        return True