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
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage

# Where to persist the vector store and doc metadata on disk
INDEX_DIR = "faiss_index"
META_FILE  = "documents_meta.json"
MAX_HISTORY = 10  # max messages to keep per conversation (human + AI combined)


# ── Metadata helpers ──────────────────────────────────────────────────

def _load_meta() -> list[dict]:
    if os.path.exists(META_FILE):
        with open(META_FILE, "r") as f:
            return json.load(f)
    return []

def _save_meta(meta: list[dict]):
    with open(META_FILE, "w") as f:
        json.dump(meta, f, indent=2)


# ── Loader selector ───────────────────────────────────────────────────

def _load_file(tmp_path: str, filename: str):
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return PyPDFLoader(tmp_path).load()
    elif ext in (".docx", ".doc"):
        return Docx2txtLoader(tmp_path).load()
    else:
        return TextLoader(tmp_path, encoding="utf-8").load()


# ── Main RAG class ────────────────────────────────────────────────────

class RAGPipeline:
    def __init__(self, model: str, url: str, temperature: float = 0.7):
        self.model       = model
        self.url         = url
        self.temperature = temperature

        self.embedding = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        self.vectorstore = None
        self._try_load_index()

        # { conversation_id: [HumanMessage, AIMessage, ...] }
        self._history: dict[str, list] = {}

    # ── Internal helpers ──────────────────────────────────────────────

    def _try_load_index(self):
        if os.path.exists(INDEX_DIR):
            try:
                self.vectorstore = FAISS.load_local(
                    INDEX_DIR,
                    self.embedding,
                    allow_dangerous_deserialization=True
                )
                print(f"[RAG] Loaded existing index from {INDEX_DIR}")
            except Exception as e:
                print(f"[RAG] Could not load index: {e}")
                self.vectorstore = None

    def _save_index(self):
        if self.vectorstore:
            self.vectorstore.save_local(INDEX_DIR)

    def _get_llm(self, api_key: str) -> ChatOpenAI:
        return ChatOpenAI(
            api_key=api_key,
            base_url=self.url,
            model=self.model,
            temperature=self.temperature,
        )

    def _get_history(self, conversation_id: str) -> list:
        """Get history for a conversation, default to empty list."""
        return self._history.get(conversation_id, [])

    def _update_history(self, conversation_id: str, human_msg: str, ai_msg: str):
        """Append new exchange and trim to MAX_HISTORY messages."""
        history = self._history.get(conversation_id, [])
        history.append(HumanMessage(content=human_msg))
        history.append(AIMessage(content=ai_msg))

        # Trim — keep only the last MAX_HISTORY messages
        if len(history) > MAX_HISTORY:
            history = history[-MAX_HISTORY:]

        self._history[conversation_id] = history

    # ── Public methods ────────────────────────────────────────────────

    def ingest(self, file_bytes: bytes, filename: str) -> dict:
        suffix = Path(filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            docs = _load_file(tmp_path, filename)
        finally:
            os.unlink(tmp_path)

        doc_id = str(uuid.uuid4())
        for doc in docs:
            doc.metadata["doc_id"]   = doc_id
            doc.metadata["filename"] = filename

        splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
        chunks   = splitter.split_documents(docs)

        if self.vectorstore is None:
            self.vectorstore = FAISS.from_documents(chunks, self.embedding)
        else:
            self.vectorstore.add_documents(chunks)

        self._save_index()

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

    def query(self, message: str, conversation_id: str, api_key: str) -> str:
        history = self._get_history(conversation_id)

        # No docs — answer from general knowledge but still keep memory
        if self.vectorstore is None:
            answer = self._get_llm(api_key).invoke(
                history + [HumanMessage(content=message)]
            ).content
            self._update_history(conversation_id, message, answer)
            return answer

        retriever = self.vectorstore.as_retriever(search_kwargs={"k": 4})

        def format_docs(docs):
            return "\n\n---\n\n".join(doc.page_content for doc in docs)

        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a helpful personal assistant with access to the user's documents.
Use the context below to answer the question as accurately as possible.
If the answer isn't in the context, say you don't know — don't make things up.

Context:
{context}"""),
            MessagesPlaceholder(variable_name="history"),  # chat history slots in here
            ("human", "{question}"),
        ])

        chain = (
            {
                "context":  retriever | format_docs,
                "history":  lambda _: history,          # inject history from our dict
                "question": RunnablePassthrough(),
            }
            | prompt
            | self._get_llm(api_key)
            | StrOutputParser()
        )

        answer = chain.invoke(message)
        self._update_history(conversation_id, message, answer)
        return answer

    def list_documents(self) -> list[dict]:
        return _load_meta()

    def delete_document(self, doc_id: str) -> bool:
        meta      = _load_meta()
        remaining = [d for d in meta if d["id"] != doc_id]

        if len(remaining) == len(meta):
            return False

        _save_meta(remaining)

        if not remaining:
            self.vectorstore = None
            if os.path.exists(INDEX_DIR):
                shutil.rmtree(INDEX_DIR)
        else:
            all_chunks = list(self.vectorstore.docstore._dict.values())
            kept       = [c for c in all_chunks if c.metadata.get("doc_id") != doc_id]

            if kept:
                self.vectorstore = FAISS.from_documents(kept, self.embedding)
                self._save_index()
            else:
                self.vectorstore = None

        return True