# Task 4 Report: Pydantic models and API routes

**Status:** DONE
**Branch:** `feature/replydesk`

## Scope delivered

- Added Pydantic request/response models for bots, knowledge documents, and service status.
- Added FastAPI lifespan initialization: SQLite schema/seed, per-bot FAISS rebuild, and app-scoped `IndexStore`.
- Added CORS and the `/health`, `/status`, `/bots`, and bot knowledge routes.
- Knowledge uploads validate UTF-8 `.txt`/`.md` content, rebuild from every document for the bot, return validation failures as 400, and return rebuild failures as 503 without replacing the prior index.
- Added an isolated TestClient fixture using a temporary SQLite database, mocked Ollama health, and deterministic fake embeddings.

## TDD evidence

1. **RED:** `backend/.venv/bin/python -m pytest backend/tests/test_bots_knowledge.py -q` failed because `app.main` did not exist.
2. **GREEN:** Implemented the models and routes; the new API tests passed.

## Verification

```text
backend/.venv/bin/python -m pytest backend/tests -q
13 passed, 1 warning in 0.14s
```

`git diff --check` and editor diagnostics reported no issues.

## Concerns

The test run retains the pre-existing upstream `langchain_community` deprecation warning from FAISS imports.

## Review fix: transactional knowledge upload

- On a failed FAISS rebuild after an upload, the API deletes the newly inserted
  knowledge document and returns 503. The previously swapped-in index remains
  untouched.
- Added an API regression test that establishes an index, forces the second
  rebuild to fail, verifies the failed document is absent from the knowledge
  listing, and verifies the original index remains available.

## Review fix verification

```text
backend/.venv/bin/python -m pytest backend/tests/test_bots_knowledge.py -q
5 passed, 1 warning in 0.14s

backend/.venv/bin/python -m pytest backend/tests -q
14 passed, 1 warning in 0.16s
```

The warning is the existing `langchain_community` FAISS deprecation warning.
