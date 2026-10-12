"""Thread-safe, in-memory FAISS indexes scoped to individual bots."""

import threading
from collections.abc import Callable

from langchain_community.vectorstores import FAISS
from langchain_core.embeddings import Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter


class _DuckEmbeddings(Embeddings):
    """Adapt a test double or compatible embedding client for LangChain."""

    def __init__(self, inner):
        self._inner = inner

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._inner.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._inner.embed_query(text)


class IndexStore:
    def __init__(self, embeddings_factory: Callable[[], object] | None = None):
        self._embeddings_factory = embeddings_factory
        self._embeddings: Embeddings | object | None = None
        self._indexes: dict[int, FAISS] = {}
        self._lock = threading.Lock()

    def _get_embeddings(self) -> Embeddings:
        if self._embeddings is None:
            if self._embeddings_factory is None:
                from app.ollama_clients import get_embeddings

                self._embeddings = get_embeddings()
            else:
                self._embeddings = self._embeddings_factory()
        if isinstance(self._embeddings, Embeddings):
            return self._embeddings
        return _DuckEmbeddings(self._embeddings)

    def build_for_bot(self, bot_id: int, texts: list[str]) -> None:
        splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=40)
        chunks = [chunk for text in texts for chunk in splitter.split_text(text)]
        if not chunks:
            raise ValueError("No text chunks to index.")

        # Build outside the lock. An indexing error leaves the previous index intact.
        index = FAISS.from_texts(chunks, self._get_embeddings(), normalize_L2=True)
        with self._lock:
            self._indexes[bot_id] = index

    def has_index(self, bot_id: int) -> bool:
        with self._lock:
            return bot_id in self._indexes

    def retrieve(
        self, bot_id: int, query: str, k: int = 3
    ) -> list[tuple[str, float]]:
        with self._lock:
            index = self._indexes.get(bot_id)
        if index is None:
            return []

        results = index.similarity_search_with_score(query, k=k)
        return [
            (
                document.page_content,
                max(0.0, min(1.0, 1.0 - float(distance) / 2.0)),
            )
            for document, distance in results
        ]

    def clear_bot(self, bot_id: int) -> None:
        with self._lock:
            self._indexes.pop(bot_id, None)
