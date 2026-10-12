"""Thin, lazily imported wrappers for Ollama-backed LangChain clients."""


def get_embeddings():
    from langchain_ollama import OllamaEmbeddings

    from app.config import OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL

    return OllamaEmbeddings(model=OLLAMA_EMBED_MODEL, base_url=OLLAMA_BASE_URL)


def get_chat():
    from langchain_ollama import ChatOllama

    from app.config import OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL

    return ChatOllama(
        model=OLLAMA_CHAT_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
    )


def ollama_ok() -> bool:
    import httpx

    from app.config import OLLAMA_BASE_URL

    try:
        response = httpx.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2.0)
        return response.status_code == 200
    except Exception:
        return False
