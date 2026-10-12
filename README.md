# ReplyDesk — WhatsApp-Style Support Reply Copilot

**App 4** portfolio demo. Simulated WhatsApp-style **agent inbox** that drafts grounded support replies from each bot’s uploaded knowledge, lets a human edit and approve a simulated send, and escalates unclear questions. Multi-bot: create a bot → upload policy docs → work its threads.

Drafts only — **no real WhatsApp**, Twilio, or automatic external sending. The browser never calls Ollama.

**Flow:** Agent opens a thread → FastAPI retrieves policy chunks (FAISS) for that bot → Ollama (`qwen2.5:7b`) drafts a short reply (or escalates on low confidence) → human **Approve & send** (SQLite agent message) or **Escalate**.

## What’s included

- Multi-bot switcher + create bot + per-bot `.txt` / `.md` knowledge upload
- WhatsApp-inspired three-pane desk: conversation list · chat · AI draft copilot
- Seeded **Demo Shop Support** bot with sample policy and threads
- Act as **Customer** or **Agent**; **+ New chat** for new conversations
- Grounded drafts with confidence + source excerpts
- Auto-escalate below similarity cutoff + manual escalate anytime
- Approve = simulated send into the thread (persisted in SQLite)
- Docker Compose (nginx frontend + FastAPI); Ollama on the host

## Tech stack

| Layer | Choices |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + custom ReplyDesk CSS (Outfit / DM Sans) |
| Backend | Python 3.12, FastAPI, Uvicorn |
| Validation | Pydantic v2 |
| Persistence | SQLite (`sqlite3` stdlib) — bots, knowledge docs, threads, messages, drafts, escalations |
| RAG | LangChain + `langchain-text-splitters` + `langchain-ollama` + `langchain-community` |
| Vector store | FAISS (`faiss-cpu`, **in-memory per bot**, rebuilt from SQLite on boot / upload) |
| Chat LLM | Local [Ollama](https://ollama.com) — default `qwen2.5:7b` |
| Embeddings | Local Ollama — default `nomic-embed-text` |
| Uploads | `python-multipart` (UTF-8 `.txt` / `.md`, 200–12,000 chars) |
| Config | `python-dotenv` + `.env` / `.env.example` |
| Delivery | Docker Compose (frontend **nginx** + backend); host Ollama via `host.docker.internal` |
| Tests | Backend: `pytest` + `httpx` / TestClient (Ollama mocked). Frontend: Vitest |

### Libraries & smaller pieces

**Backend**

| Package / piece | Role |
| --- | --- |
| `fastapi` / `uvicorn[standard]` | HTTP API, CORS, lifespan seed + FAISS rebuild |
| `pydantic` | Request/response models |
| `python-multipart` | Knowledge file uploads |
| `python-dotenv` | Env loading |
| `sqlite3` | Persistent app data (`backend/data/replydesk.db`) |
| `langchain-text-splitters` | Chunk policies (~400 / ~40 overlap) |
| `langchain-ollama` | Chat + embeddings against local Ollama |
| `langchain-community` | FAISS vector store wrapper |
| `faiss-cpu` | Similarity search; score vs `SIMILARITY_CUTOFF` (default `0.45`) |
| `httpx` | Ollama health probe + API tests |
| `pytest` | Unit/API tests with mocked embeddings/chat |

**Frontend**

| Package / piece | Role |
| --- | --- |
| `react` / `react-dom` | ReplyDesk agent workstation UI |
| `vite` / `typescript` | Dev server, typecheck, production build |
| `tailwindcss` / `@tailwindcss/vite` | Utility styling |
| Custom CSS | Chat wallpaper, bubbles (`#DCF8C6` agent / white customer), motions (`flash-row`, `pulse-cta`, `shimmer`, `badge-in`) |
| Google Fonts | **Outfit** (display) + **DM Sans** (UI) |
| `vitest` | Badge helpers + API client unit tests |
| `oxlint` | Lint (optional local) |

**Infrastructure**

| Piece | Role |
| --- | --- |
| Docker / Docker Compose | `backend` + `frontend` services |
| nginx | Serve Vite `dist` in the frontend image |
| Ollama (host) | Models stay outside Compose |

### API surface (browser → FastAPI only)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `GET` | `/status` | `ollama_ok`, `bot_count`, `db_ok` |
| `GET` / `POST` | `/bots` | List / create bots |
| `GET` | `/bots/{id}` | Bot detail |
| `GET` / `POST` | `/bots/{id}/knowledge` | List docs / upload `.txt`/`.md` |
| `GET` / `POST` | `/bots/{id}/threads` | List / create conversations |
| `GET` | `/threads/{id}` | Thread + messages + latest draft |
| `POST` | `/threads/{id}/messages` | Append customer (or agent) message |
| `POST` | `/threads/{id}/draft` | Generate / regenerate grounded draft |
| `POST` | `/threads/{id}/approve` | Simulated send (agent message) |
| `POST` | `/threads/{id}/escalate` | Manual human handoff |
| `GET` | `/bots/{id}/escalations` | Escalation list |

## Ports

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3003 |
| API | http://localhost:8003 |
| Ollama | http://localhost:11434 |

## Prerequisites

- Docker Desktop (Compose run), **or** Python 3.12+ and Node.js 22+ (local)
- [Ollama](https://ollama.com/) on the host with both models pulled:

```bash
ollama serve   # skip if the Ollama app is already running
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

## Run with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Open http://localhost:3003.

- Backend → Ollama: `OLLAMA_BASE_URL=http://host.docker.internal:11434`
- Frontend build arg: `VITE_API_BASE=http://localhost:8003` (browser → host API, not Docker DNS)
- SQLite persisted at `backend/data/replydesk.db` (bind mount)
- Root `.env.example` is for Compose; use `backend/.env.example` for local uvicorn

Stop: `Ctrl+C` or `docker compose down` (omit `-v` to keep demo data).

## Run locally

**Backend**

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8003
```

**Frontend**

```bash
cd frontend
npm ci
VITE_API_BASE=http://localhost:8003 npm run dev -- --port 3003
```

On first API start, SQLite seeds **Demo Shop Support** + sample policy + sample threads.

## Multi-bot demo

1. Select **Demo Shop Support** → open a customer thread (e.g. returns question).
2. **Generate** draft → review sources → **Approve & send** (or open the off-topic thread and see auto-escalate).
3. **Create bot** → upload your own `.txt`/`.md` policy (200–12,000 chars, UTF-8).
4. **+ New chat** → Act as **Customer** → message → Generate. Knowledge stays isolated per bot.

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` (local) / `http://host.docker.internal:11434` (Compose) | Ollama base |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b` | Chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `SIMILARITY_CUTOFF` | `0.45` | Below → escalate, no invented answer |
| `SQLITE_PATH` | `backend/data/replydesk.db` | DB file |
| `CORS_ORIGINS` | `http://localhost:3003,...` | Allowed frontend origins |
| `VITE_API_BASE` | `http://localhost:8003` | Browser → API (baked at frontend build) |

## Tests

Ollama is **mocked** in pytest — no live model required for CI/local unit runs.

```bash
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest -v
```

```bash
cd frontend && npx vitest run
```

Expected: all backend and frontend unit tests pass.

## Limitations

- No WhatsApp / Cloud API / Twilio / auto-send to customers
- No URL / website crawl for knowledge (upload only)
- FAISS indexes are in-memory (rebuilt from SQLite on restart)
- Single-operator demo — no auth / multi-user roles
- Answer quality and latency depend on local Ollama hardware
- Chrome or a modern desktop browser recommended for the UI

## Design docs

- [Design specification](docs/superpowers/specs/2026-10-12-whatsapp-support-copilot-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-12-whatsapp-support-copilot.md)
