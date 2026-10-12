# Task 11 report: Docker Compose + README

## Completed

- Added production Dockerfiles for FastAPI (Python 3.12) and the Vite frontend
  (Node 22 build stage + nginx runtime), plus nginx SPA fallback configuration.
- Added Compose services on ports `3003` (frontend) and `8003` (API). The browser
  API base is baked as `http://localhost:8003`; the backend connects to host
  Ollama through `host.docker.internal:11434`, including the Linux
  `host-gateway` mapping.
- Persisted SQLite with `./backend/data:/app/data`, added `.env.example`, root
  ignore rules, Docker build-context ignores, and a README covering setup,
  Ollama pulls, local/Docker runs, multi-bot demo, tests, limits, and project
  documents.

## Verification

- `cd backend && source .venv/bin/activate && PYTHONPATH=. pytest -v`:
  **27 passed**. One pre-existing `langchain-community` deprecation warning.
- `cd frontend && npx vitest run`: **1 file, 6 tests passed**.
- `docker compose config --quiet && docker compose build`: **passed**. Both
  backend and frontend images built successfully.

## Concerns

- Compose does not include an Ollama container by design. Ollama and the
  `qwen2.5:7b` / `nomic-embed-text` models must be available on the host before
  draft generation can work.
