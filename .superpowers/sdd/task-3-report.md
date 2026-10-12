# Task 3 Report: Ollama clients and per-bot FAISS indexes

**Status:** DONE  
**Branch:** `feature/replydesk`

## Scope delivered

- Added `backend/app/ollama_clients.py` with lazy Ollama embedding/chat client
  factories and a 2-second `/api/tags` health check.
- Added `backend/app/index_store.py`, which maintains independently scoped,
  thread-safe in-memory FAISS indexes per bot.
- Indexes chunk input at 400 characters with 40-character overlap, normalize
  vectors with L2, atomically swap rebuilt indexes, and map squared-L2
  distances to clamped cosine similarities using `1 - distance / 2`.
- Added deterministic FakeEmbeddings tests for retrieval, bot isolation,
  clearing, and empty input.

## TDD evidence

1. **RED:** `pytest tests/test_index_store.py -q` failed as expected because
   `app.index_store` did not yet exist.
2. **GREEN:** Implemented the store and Ollama wrappers; all tests pass.

## Verification

```text
cd backend && .venv/bin/python -m pytest -q
9 passed, 1 warning in 0.08s
```

`git diff --check` and editor diagnostics reported no issues.

## Concerns

The passing test run emits an upstream `langchain_community` deprecation
warning. FAISS remains imported from that installed package to match the
existing project dependency and the App 3 reference implementation.
