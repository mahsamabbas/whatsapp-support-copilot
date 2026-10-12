# ReplyDesk (WhatsApp Support Reply Copilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ReplyDesk — a multi-bot WhatsApp-style agent inbox that drafts grounded support replies from per-bot uploaded knowledge (SQLite + FAISS + Ollama), supports approve (simulated send) and human escalation, with a polished three-pane UI.

**Architecture:** React (Vite) owns the ReplyDesk workstation UI. FastAPI owns SQLite persistence, knowledge validation, per-bot in-memory FAISS indexes, similarity cutoff, and ChatOllama drafting. Ollama runs on the host; the browser never calls the LLM. No real WhatsApp.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, FastAPI, Pydantic v2, SQLite (`sqlite3` stdlib), LangChain (`langchain-ollama`, `langchain-community`, `langchain-text-splitters`), FAISS (`faiss-cpu`), Ollama (`qwen2.5:7b`, `nomic-embed-text`), pytest, httpx, Vitest, Docker Compose.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-12-whatsapp-support-copilot-design.md`
- Similarity cutoff default: `0.45`
- Chat model default: `qwen2.5:7b`; embed model default: `nomic-embed-text`
- Ports: frontend `3003`, API `8003`, Ollama `11434`
- Upload: `.txt`/`.md`, UTF-8, 200–12,000 characters
- No Gemini/OpenAI; no URL scrape; no real WhatsApp / auto-send
- Brand: **ReplyDesk** — Outfit + DM Sans; accent `#25D366`; ink `#111B21`; no Meta logo/WhatsApp wordmark; no EchoFAQ orb; no purple/cream-terracotta AI clichés
- Required motion: new-message highlight, draft shimmer, escalate badge slide-in
- Tests mock Ollama — no live network in pytest/Vitest unit tests
- Git author on commits: **mahsamabbas** `<6658043+mahsamabbas@users.noreply.github.com>`; strip any `Co-authored-by: Cursor` trailer (use `git -c user.name=... -c user.email=... commit` or `commit-tree` if needed)
- Work at repo root `whatsapp-support-copilot/`

## File map

| Path | Responsibility |
| --- | --- |
| `backend/app/config.py` | Env, paths, cutoff, CORS, SQLite path |
| `backend/app/validation.py` | Knowledge upload byte validation |
| `backend/app/db.py` | SQLite connect, schema, seed |
| `backend/app/models.py` | Pydantic request/response models |
| `backend/app/ollama_clients.py` | Embeddings + chat factory; `ollama_ok()` |
| `backend/app/index_store.py` | Per-bot FAISS build/retrieve + locks |
| `backend/app/draft_service.py` | Retrieve → cutoff → draft or escalate |
| `backend/app/main.py` | FastAPI routes + lifespan |
| `backend/data/sample_policy.md` | Demo e-commerce policy for seed bot |
| `backend/tests/*` | pytest coverage |
| `frontend/src/styles.css` | ReplyDesk tokens, wallpaper, motion |
| `frontend/src/lib/api.ts` | HTTP client for all routes |
| `frontend/src/lib/badges.ts` | Thread badge helpers (Vitest) |
| `frontend/src/components/TopBar.tsx` | Brand + bot switcher + knowledge status |
| `frontend/src/components/ThreadList.tsx` | Left inbox |
| `frontend/src/components/ChatPane.tsx` | Center bubbles + role toggle |
| `frontend/src/components/DraftPanel.tsx` | Right copilot |
| `frontend/src/components/BotModal.tsx` | Create bot + upload knowledge |
| `frontend/src/App.tsx` | Layout composition + state |
| `docker-compose.yml` | frontend + backend; Ollama on host |
| `README.md` | Setup, ports, tests, limits |

---

### Task 1: Backend scaffold, config, validation, sample policy

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/validation.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_validation.py`
- Create: `backend/data/sample_policy.md`
- Create: `backend/.gitignore` (`.venv/`, `__pycache__/`, `data/*.db`, `.env`)

**Interfaces:**
- Produces: `validate_knowledge_bytes(filename: str, raw: bytes) -> str` raises `ValidationError`
- Produces: `MIN_CHARS=200`, `MAX_CHARS=12000`, `ALLOWED_EXTENSIONS={".txt", ".md"}`, `SIMILARITY_CUTOFF`, `SQLITE_PATH`, `ESCALATION_REASON_LOW_CONFIDENCE`

- [ ] **Step 1: Write `backend/requirements.txt`**

```text
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
python-multipart>=0.0.9
python-dotenv>=1.0.0
pydantic>=2.0.0
langchain>=0.3.0
langchain-core>=0.3.0
langchain-community>=0.3.0
langchain-ollama>=0.2.0
langchain-text-splitters>=0.3.0
faiss-cpu>=1.8.0
httpx>=0.27.0
pytest>=8.0.0
```

- [ ] **Step 2: Write failing validation tests**

```python
# backend/tests/test_validation.py
import pytest

from app.validation import ValidationError, validate_knowledge_bytes


def test_rejects_empty():
    with pytest.raises(ValidationError, match="empty"):
        validate_knowledge_bytes("policy.md", b"")


def test_rejects_pdf_extension():
    with pytest.raises(ValidationError, match="extension"):
        validate_knowledge_bytes("policy.pdf", b"x" * 300)


def test_rejects_too_short():
    with pytest.raises(ValidationError, match="at least"):
        validate_knowledge_bytes("policy.md", b"short")


def test_accepts_valid_md():
    text = validate_knowledge_bytes("policy.md", ("A" * 250).encode("utf-8"))
    assert len(text) == 250
```

- [ ] **Step 3: Run tests — expect fail**

```bash
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. pytest tests/test_validation.py -v
```

Expected: FAIL (module not found or import error).

- [ ] **Step 4: Implement config + validation + sample policy**

```python
# backend/app/config.py
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")

DATA_DIR = BACKEND_ROOT / "data"
SAMPLE_POLICY_PATH = DATA_DIR / "sample_policy.md"
SQLITE_PATH = Path(os.getenv("SQLITE_PATH", str(DATA_DIR / "replydesk.db")))
ALLOWED_EXTENSIONS = {".txt", ".md"}
MIN_CHARS = 200
MAX_CHARS = 12_000
SIMILARITY_CUTOFF = float(os.getenv("SIMILARITY_CUTOFF", "0.45"))
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:7b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
ESCALATION_REASON_LOW_CONFIDENCE = (
    "Not enough matching policy content to draft a safe reply."
)
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3003,http://127.0.0.1:3003",
    ).split(",")
    if o.strip()
]
```

```python
# backend/app/validation.py
from pathlib import PurePosixPath

from app.config import ALLOWED_EXTENSIONS, MAX_CHARS, MIN_CHARS


class ValidationError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def validate_knowledge_bytes(filename: str, raw: bytes) -> str:
    if not raw:
        raise ValidationError("File is empty.")
    ext = PurePosixPath(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError("Unsupported file extension. Use .txt or .md.")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationError("File must be valid UTF-8.") from exc
    if len(text.strip()) < MIN_CHARS:
        raise ValidationError(f"File must be at least {MIN_CHARS} characters.")
    if len(text) > MAX_CHARS:
        raise ValidationError(f"File must be at most {MAX_CHARS} characters.")
    return text
```

`sample_policy.md`: English e-commerce support policy ≥200 chars covering returns (30 days), shipping (3–5 business days), refunds, order tracking, support hours Mon–Fri 9:00–17:00.

`.env.example`:

```text
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=qwen2.5:7b
OLLAMA_EMBED_MODEL=nomic-embed-text
SIMILARITY_CUTOFF=0.45
SQLITE_PATH=./data/replydesk.db
CORS_ORIGINS=http://localhost:3003,http://127.0.0.1:3003
```

`conftest.py`: add `BACKEND_ROOT` to `sys.path` if needed; set `SQLITE_PATH` to a temp path via env in later tasks.

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_validation.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend && git -c user.name="mahsamabbas" -c user.email="6658043+mahsamabbas@users.noreply.github.com" commit -m "$(cat <<'EOF'
Add ReplyDesk backend scaffold and knowledge validation.

EOF
)"
```

---

### Task 2: SQLite schema, repositories, seed

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/tests/test_db.py`

**Interfaces:**
- Produces: `get_connection() -> sqlite3.Connection` (row_factory=sqlite3.Row)
- Produces: `init_db(conn)` — create tables
- Produces: `seed_if_empty(conn)` — demo bot + sample policy text + 3 threads/messages when no bots
- Produces helpers: `create_bot`, `list_bots`, `get_bot`, `add_knowledge`, `list_knowledge`, `list_threads`, `create_thread`, `get_thread`, `add_message`, `list_messages`, `upsert_draft`, `get_latest_draft`, `approve_draft`, `create_escalation`, `list_escalations`, `set_thread_status`

Schema columns exactly as spec: `bots`, `knowledge_documents`, `threads` (`open|escalated|resolved`), `messages` (`customer|agent`), `drafts` (`pending|approved|escalated`), `escalations` (`open|resolved`).

- [ ] **Step 1: Write failing db seed test**

```python
# backend/tests/test_db.py
import os
from pathlib import Path

import pytest

# Ensure temp DB before import side effects
@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("SQLITE_PATH", str(path))
    # reload config + db modules if already imported
    import importlib
    import app.config as config
    import app.db as db

    importlib.reload(config)
    importlib.reload(db)
    conn = db.get_connection()
    db.init_db(conn)
    db.seed_if_empty(conn)
    yield conn
    conn.close()


def test_seed_creates_demo_bot_and_threads(db_path):
    bots = db_path.execute("SELECT * FROM bots").fetchall()
    assert len(bots) == 1
    assert bots[0]["name"]
    docs = db_path.execute("SELECT * FROM knowledge_documents").fetchall()
    assert len(docs) >= 1
    threads = db_path.execute("SELECT * FROM threads").fetchall()
    assert len(threads) >= 2
    msgs = db_path.execute("SELECT * FROM messages").fetchall()
    assert len(msgs) >= 2
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest tests/test_db.py -v
```

- [ ] **Step 3: Implement `db.py`**

Use `CREATE TABLE IF NOT EXISTS` for all six tables with `INTEGER PRIMARY KEY AUTOINCREMENT` ids and `TEXT` timestamps (`datetime('now')`).

`seed_if_empty`:
1. If `SELECT COUNT(*) FROM bots` > 0 → return
2. Insert bot name `Demo Shop Support`
3. Read `SAMPLE_POLICY_PATH` text; insert `knowledge_documents`
4. Thread A (in-policy): customer “Aisha Khan”, message asking about return window
5. Thread B (escalate-worthy): customer “Omar Ali”, message about politics / unrelated topic
6. Thread C (optional): shipping question

Do **not** build FAISS here — that is Task 3 lifespan.

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit** — `Add SQLite schema and demo seed for ReplyDesk.`

---

### Task 3: Ollama clients + per-bot FAISS index store

**Files:**
- Create: `backend/app/ollama_clients.py`
- Create: `backend/app/index_store.py`
- Create: `backend/tests/test_index_store.py`

**Interfaces:**
- Produces: `get_embeddings()`, `get_chat()`, `ollama_ok() -> bool`
- Produces: class `IndexStore`:
  - `build_for_bot(bot_id: int, texts: list[str]) -> None`
  - `has_index(bot_id: int) -> bool`
  - `retrieve(bot_id: int, query: str, k: int = 3) -> list[tuple[str, float]]`  # (chunk, score in [0,1])
  - `clear_bot(bot_id: int) -> None`
- Chunking: `RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=40)`

- [ ] **Step 1: Write failing retrieve test with mocked embeddings**

```python
# backend/tests/test_index_store.py
from unittest.mock import MagicMock

from app.index_store import IndexStore


class FakeEmbeddings:
    def embed_documents(self, texts):
        # deterministic tiny vectors
        return [[float(len(t) % 7), 1.0, 0.0] for t in texts]

    def embed_query(self, text):
        return [float(len(text) % 7), 1.0, 0.0]


def test_build_and_retrieve(monkeypatch):
    store = IndexStore(embeddings_factory=lambda: FakeEmbeddings())
    store.build_for_bot(1, ["Returns are accepted within 30 days of delivery. Keep your receipt."])
    hits = store.retrieve(1, "How long do I have to return?", k=1)
    assert len(hits) == 1
    assert "30 days" in hits[0][0]
    assert 0.0 <= hits[0][1] <= 1.0
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

`ollama_clients.py`: wrap `OllamaEmbeddings` / `ChatOllama` with base_url + model from config; `ollama_ok` GETs `{OLLAMA_BASE_URL}/api/tags` via httpx timeout 2s.

`index_store.py`: dict `bot_id -> FAISS`; lock with `threading.Lock`; on rebuild replace entry atomically; convert FAISS distance to similarity in \([0,1]\) the same way as App 3 (`voice-faq-assistant` `index_store.py` — prefer `1/(1+distance)` or cosine if using `similarity_search_with_score` consistently). Match App 3 scoring so cutoff `0.45` remains meaningful.

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit** — `Add per-bot FAISS index store and Ollama clients.`

---

### Task 4: Pydantic models + bots/knowledge/status routes

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/app/main.py` (start lifespan + routes; grow in later tasks)
- Create: `backend/tests/test_bots_knowledge.py`

**Interfaces:**
- Produces routes:
  - `GET /health` → `{ "ok": true }`
  - `GET /status` → `{ "ollama_ok": bool, "bot_count": int, "db_ok": bool }`
  - `GET /bots`, `POST /bots` body `{ "name": str }`
  - `GET /bots/{id}`
  - `GET /bots/{id}/knowledge`
  - `POST /bots/{id}/knowledge` multipart `file`
- On knowledge success: persist doc, `index_store.build_for_bot` from **all** docs for that bot
- Lifespan: `init_db`, `seed_if_empty`, rebuild FAISS for every bot that has docs; keep `IndexStore` on `app.state`

- [ ] **Step 1: Write API tests with TestClient + temp DB + mocked embed**

```python
# backend/tests/test_bots_knowledge.py
import io
from unittest.mock import MagicMock

from fastapi.testclient import TestClient


def test_create_bot_and_reject_bad_upload(client):
    r = client.post("/bots", json={"name": "Acme Support"})
    assert r.status_code == 200
    bot_id = r.json()["id"]
    bad = client.post(
        f"/bots/{bot_id}/knowledge",
        files={"file": ("x.pdf", io.BytesIO(b"abc"), "application/pdf")},
    )
    assert bad.status_code == 400


def test_upload_rebuilds_index(client, monkeypatch):
    # client fixture patches IndexStore.build_for_bot to record calls
    r = client.post("/bots", json={"name": "Acme"})
    bot_id = r.json()["id"]
    body = ("Shipping takes 3 to 5 business days for standard orders. " * 10).encode()
    ok = client.post(
        f"/bots/{bot_id}/knowledge",
        files={"file": ("policy.md", io.BytesIO(body), "text/markdown")},
    )
    assert ok.status_code == 200
    docs = client.get(f"/bots/{bot_id}/knowledge").json()
    assert len(docs) >= 1
```

`conftest.py` `client` fixture: temp `SQLITE_PATH`, reload modules, monkeypatch `ollama_ok` True, monkeypatch embeddings used by IndexStore to `FakeEmbeddings` from Task 3 (importable helper — move FakeEmbeddings to `tests/fakes.py` if cleaner).

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement models + main routes**

CORSMiddleware with `CORS_ORIGINS`. ValidationError → 400. Embed/build failure → 503, previous index kept (`IndexStore` only swap after successful build — build into temp then assign).

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit** — `Add bots, knowledge upload, and status API.`

---

### Task 5: Threads + messages API

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/models.py`
- Create: `backend/tests/test_threads.py`

**Interfaces:**
- `GET /bots/{id}/threads` → list with `id`, `customer_name`, `status`, `last_message_preview`, `updated_at`, derived badge hint fields optional
- `POST /bots/{id}/threads` body `{ "customer_name": str }`
- `GET /threads/{id}` → thread + messages + `latest_draft` (or null)
- `POST /threads/{id}/messages` body `{ "role": "customer"|"agent", "body": str }` — reject blank; 404 unknown thread

- [ ] **Step 1: Failing tests**

```python
def test_customer_message_appends(client):
    bots = client.get("/bots").json()
    bot_id = bots[0]["id"]
    threads = client.get(f"/bots/{bot_id}/threads").json()
    tid = threads[0]["id"]
    r = client.post(f"/threads/{tid}/messages", json={"role": "customer", "body": "Where is my order?"})
    assert r.status_code == 200
    detail = client.get(f"/threads/{tid}").json()
    assert any(m["body"] == "Where is my order?" for m in detail["messages"])


def test_blank_message_400(client):
    bots = client.get("/bots").json()
    tid = client.get(f"/bots/{bots[0]['id']}/threads").json()[0]["id"]
    r = client.post(f"/threads/{tid}/messages", json={"role": "customer", "body": "   "})
    assert r.status_code == 400
```

- [ ] **Step 2: Implement routes + run pass**

- [ ] **Step 3: Commit** — `Add thread and message endpoints.`

---

### Task 6: Draft, approve, escalate (core RAG loop) — TDD

**Files:**
- Create: `backend/app/draft_service.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_draft.py`

**Interfaces:**
- `generate_draft(conn, store, bot_id, thread_id) -> DraftResult`
  - `DraftResult`: `body: str`, `confidence: float`, `sources: list[str]`, `escalated: bool`, `reason: str | None`, `draft_id: int`
- Routes:
  - `POST /threads/{id}/draft`
  - `POST /threads/{id}/approve` body optional `{ "body": str }`
  - `POST /threads/{id}/escalate` body optional `{ "reason": str }`
  - `GET /bots/{id}/escalations`

**Logic:**
1. Resolve thread → bot_id; require `store.has_index(bot_id)` else 409 `"Bot has no knowledge index."`
2. Latest customer message required else 400
3. `retrieve` top 3; `confidence = best score`
4. If `confidence < SIMILARITY_CUTOFF`: persist draft state `escalated` with empty or short placeholder body `""`, create escalation with `ESCALATION_REASON_LOW_CONFIDENCE`, set thread `escalated`; **do not call chat**
5. Else: prompt chat to draft a short WhatsApp-style agent reply using ONLY excerpts; persist draft `pending` with sources_json
6. Approve: use override body or draft body; `add_message` role agent; draft `approved`; thread status `resolved` (or keep `open` — **use `resolved`** after approve for badge `Replied`)
7. Manual escalate: escalation row + thread `escalated` + draft state `escalated` if draft exists

- [ ] **Step 1: Write failing tests with mocked retrieve + chat**

```python
# backend/tests/test_draft.py
from unittest.mock import MagicMock


def _first_thread_id(client) -> int:
    bot_id = client.get("/bots").json()[0]["id"]
    return client.get(f"/bots/{bot_id}/threads").json()[0]["id"]


def test_grounded_draft_not_escalated(client, monkeypatch):
    tid = _first_thread_id(client)

    def fake_retrieve(bot_id, query, k=3):
        return [("Returns are accepted within 30 days of delivery.", 0.91)]

    fake_chat = MagicMock()
    fake_chat.invoke.return_value = MagicMock(
        content="You can return items within 30 days."
    )

    monkeypatch.setattr(
        "app.draft_service.get_chat", lambda: fake_chat
    )
    # Patch the store on the app (adjust path to match main.py wiring)
    store = client.app.state.index_store
    monkeypatch.setattr(store, "retrieve", fake_retrieve)
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)

    r = client.post(f"/threads/{tid}/draft")
    assert r.status_code == 200
    data = r.json()
    assert data["escalated"] is False
    assert "30 days" in data["body"]
    assert data["sources"]


def test_low_confidence_escalates_without_inventing(client, monkeypatch):
    tid = _first_thread_id(client)
    store = client.app.state.index_store
    monkeypatch.setattr(
        store,
        "retrieve",
        lambda bot_id, query, k=3: [("unrelated trivia", 0.12)],
    )
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)
    chat = MagicMock()
    monkeypatch.setattr("app.draft_service.get_chat", lambda: chat)

    r = client.post(f"/threads/{tid}/draft")
    assert r.status_code == 200
    data = r.json()
    assert data["escalated"] is True
    assert data["reason"]
    chat.invoke.assert_not_called()
    assert "World Cup" not in (data.get("body") or "")


def test_approve_writes_agent_message(client, monkeypatch):
    tid = _first_thread_id(client)
    store = client.app.state.index_store
    monkeypatch.setattr(
        store,
        "retrieve",
        lambda bot_id, query, k=3: [("Returns within 30 days.", 0.9)],
    )
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)
    fake_chat = MagicMock()
    fake_chat.invoke.return_value = MagicMock(content="30-day returns apply.")
    monkeypatch.setattr("app.draft_service.get_chat", lambda: fake_chat)

    assert client.post(f"/threads/{tid}/draft").status_code == 200
    r = client.post(
        f"/threads/{tid}/approve",
        json={"body": "Happy to help — 30-day returns apply."},
    )
    assert r.status_code == 200
    detail = client.get(f"/threads/{tid}").json()
    assert any(m["role"] == "agent" for m in detail["messages"])
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `draft_service.py` + routes**

Chat system prompt must forbid inventing policy. Temperature low (0.2).

- [ ] **Step 4: Run full backend suite — expect pass**

```bash
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest -v
```

- [ ] **Step 5: Commit** — `Add draft, approve, and escalate RAG flow with tests.`

---

### Task 7: Frontend scaffold + ReplyDesk design system (UI foundation)

**Files:**
- Create: `frontend/package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `index.html`, `tailwind`/Vite CSS setup matching App 3 Tailwind v4 pattern
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/styles.css` (full tokens + wallpaper + keyframes)
- Create: `frontend/src/App.tsx` (static shell layout first — three panes visible with placeholder content)
- Create: `frontend/src/vite-env.d.ts`

**UI requirements (non-negotiable for “best UI”):**

| Token | Value |
| --- | --- |
| Display font | Outfit (Google Fonts) |
| UI font | DM Sans |
| Accent | `#25D366` |
| Ink | `#111B21` |
| Panel | `#F0F2F5` |
| Chat wallpaper | subtle green radial + soft doodle pattern (CSS only, not Meta assets) |
| Agent bubble | `#DCF8C6` |
| Customer bubble | `#FFFFFF` with soft shadow |
| Copilot panel | white / ink with green CTA buttons |

Layout: full viewport `100dvh`; top bar ~56px with **ReplyDesk** wordmark at brand scale; left ~280px thread list; center flex chat; right ~320px draft. Mobile: stack with tabs `Chats | Thread | Draft` (simple), desktop three columns.

Motion CSS classes:
- `.flash-row` — 1.2s background highlight
- `.pulse-cta` — soft scale pulse on Generate
- `.shimmer` — draft skeleton
- `.badge-in` — slide/fade for Escalated badge

- [ ] **Step 1: Scaffold Vite React-TS app**

```bash
cd frontend && npm create vite@latest . -- --template react-ts
# install: tailwind v4 per App 3 (`@tailwindcss/vite`), then
npm install
```

Set `server.port` to `3003` in `vite.config.ts`. Proxy `/api` → `http://127.0.0.1:8003` **or** use `VITE_API_BASE=http://localhost:8003`.

- [ ] **Step 2: Implement `styles.css` tokens + `App.tsx` static shell**

Wordmark must dominate the top bar (brand-first). Placeholder panes labeled so the composition already looks like a support desk, not a dashboard card grid.

- [ ] **Step 3: Manual visual check**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3003` — confirm fonts, green wash, three panes, no purple theme.

- [ ] **Step 4: Commit** — `Scaffold ReplyDesk UI shell with design tokens.`

---

### Task 8: API client + bot modal + top bar wiring

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/TopBar.tsx`
- Create: `frontend/src/components/BotModal.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces (`api.ts`):**
- `getStatus()`, `listBots()`, `createBot(name)`, `listKnowledge(botId)`, `uploadKnowledge(botId, file)`, `listThreads(botId)`, `getThread(threadId)`, `postMessage(threadId, role, body)`, `generateDraft(threadId)`, `approveDraft(threadId, body?)`, `escalateThread(threadId, reason?)`, `listEscalations(botId)`
- Base URL: `import.meta.env.VITE_API_BASE ?? 'http://localhost:8003'`

- [ ] **Step 1: Implement `api.ts` with typed JSON helpers and `ApiError`**

- [ ] **Step 2: TopBar** — ReplyDesk wordmark, `<select>` of bots, Create button, knowledge pill `Ready` / `Needs docs` from `listKnowledge(activeBotId).length` and/or status

- [ ] **Step 3: BotModal** — name field; after create, file input `.txt,.md`; upload; show errors; close refreshes bots

- [ ] **Step 4: App loads bots on mount; select first bot; open modal if zero bots

- [ ] **Step 5: Commit** — `Wire bot switcher, create bot, and knowledge upload UI.`

---

### Task 9: Thread list + chat pane + customer role

**Files:**
- Create: `frontend/src/components/ThreadList.tsx`
- Create: `frontend/src/components/ChatPane.tsx`
- Create: `frontend/src/lib/badges.ts`
- Create: `frontend/src/lib/badges.test.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- `threadBadge(thread, latestDraft): 'needs_draft' | 'escalated' | 'replied' | 'open'`
  - `escalated` if `thread.status === 'escalated'`
  - `replied` if `status === 'resolved'` or last message role agent
  - `needs_draft` if last message role customer and no pending/approved handling
  - else `open`

- [ ] **Step 1: Vitest for badges**

```ts
import { describe, expect, it } from "vitest";
import { threadBadge } from "./badges";

describe("threadBadge", () => {
  it("marks escalated", () => {
    expect(threadBadge({ status: "escalated" }, null)).toBe("escalated");
  });
  it("marks needs_draft when last customer", () => {
    expect(
      threadBadge({ status: "open", last_role: "customer" }, null),
    ).toBe("needs_draft");
  });
});
```

- [ ] **Step 2: Run Vitest — fail then implement `badges.ts` — pass**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 3: ThreadList** — rows with name, preview, badge chips; `flash-row` class when `flashThreadId` matches; click selects thread

- [ ] **Step 4: ChatPane** — bubbles (customer left / agent right), timestamps optional, role toggle Customer|Agent; composer enabled only in Customer mode; on send → `postMessage` → reload thread → set `flashThreadId` + `pulseGenerate`

- [ ] **Step 5: Commit** — `Add inbox list, WhatsApp thread pane, and badge helpers.`

---

### Task 10: Draft panel + motions + full App state machine

**Files:**
- Create: `frontend/src/components/DraftPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css` if motion gaps remain

**Behavior:**
- Show Generate / Regenerate; while loading apply `.shimmer` skeleton
- On success: editable `<textarea>`, confidence %, source excerpts list
- If `escalated`: reason callout + `.badge-in` on thread badge; still allow manual edits only if body present; Escalate button still available
- Approve & send → `approveDraft` → reload thread (agent bubble appears)
- Escalate → prompt optional reason → `escalateThread`
- After customer message: auto-call `generateDraft` once (debounced) OR strongly pulse Generate — **prefer auto-generate** for demo wow
- Errors (409 no knowledge, 503 Ollama): red inline message in panel

- [ ] **Step 1: Implement DraftPanel + wire App**

- [ ] **Step 2: Manual integration smoke** (Ollama running)

```bash
# A
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8003
# B
cd frontend && npm run dev
```

Checklist:
1. Open demo bot → see seeded threads  
2. Select return-window thread → Generate → grounded draft → Approve → agent bubble  
3. Select escalate-worthy thread → Generate → escalated reason  
4. Act as Customer → new message → draft regenerates  
5. Create second bot → upload policy → new thread → draft works  

- [ ] **Step 3: Commit** — `Add draft copilot panel with approve and escalate UX.`

---

### Task 11: Docker Compose + README

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `docker-compose.yml`
- Create: `.env.example` (root)
- Create: `README.md`
- Create: `.gitignore` (root)

- [ ] **Step 1: Docker**

- Backend: Python 3.12, install requirements, `uvicorn app.main:app --host 0.0.0.0 --port 8000`; compose map `8003:8000`; `OLLAMA_BASE_URL=http://host.docker.internal:11434`; persist sqlite via volume `./backend/data:/app/data`
- Frontend: multi-stage `npm run build` + nginx; browser calls `http://localhost:8003` (bake `VITE_API_BASE` at build)
- `extra_hosts: host.docker.internal:host-gateway` if needed on Linux

- [ ] **Step 2: README sections**

- What ReplyDesk is  
- Ollama pulls  
- Docker + local run (ports 3003/8003)  
- Multi-bot demo script  
- Test commands + expected results  
- Limitations  
- Links to design + plan  

- [ ] **Step 3: Verify**

```bash
cd backend && source .venv/bin/activate && PYTHONPATH=. pytest -v
cd frontend && npx vitest run
```

- [ ] **Step 4: Commit** — `Add Docker Compose and README for ReplyDesk.`

---

### Task 12: UI polish pass + final verification

**Files:**
- Modify: `frontend/src/styles.css`, components as needed
- Modify: `README.md` if setup friction found

- [ ] **Step 1: Visual polish checklist**

- [ ] ReplyDesk wordmark reads as brand hero in top bar  
- [ ] Chat wallpaper + bubble colors feel WhatsApp-inspired (not Meta-branded)  
- [ ] Three motions present and noticeable  
- [ ] Empty states: no bot, no knowledge, no thread selected — friendly copy  
- [ ] Focus rings / button hover for accessibility  
- [ ] No EchoFAQ / App1 / App2 visual clones  
- [ ] pytest + vitest green  

- [ ] **Step 2: Final commit if needed** — `Polish ReplyDesk UI and verify demo flows.`

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Multi-bot create/select | 4, 8 |
| Per-bot `.txt`/`.md` knowledge, no URL | 1, 4, 8 |
| SQLite bots/docs/threads/messages/drafts/escalations | 2, 5, 6 |
| FAISS per bot rebuilt from SQLite | 3, 4 |
| Ollama qwen2.5:7b + nomic-embed-text | 3, 6 |
| Agent inbox 3-pane ReplyDesk UI | 7, 9, 10, 12 |
| Seeded threads + Act as Customer | 2, 9 |
| Auto + manual escalate | 6, 10 |
| Approve simulated send | 6, 10 |
| Cutoff 0.45, no invented facts | 6 |
| Upload validation 200–12000 | 1, 4 |
| Ports 3003/8003 | 7, 11 + Global |
| pytest mocked Ollama | 3, 4, 6 |
| Vitest badge helpers | 9 |
| Docker + README | 11 |
| Motions (flash / shimmer / badge-in) | 7, 10, 12 |
| Out of scope WhatsApp/URL/Gemini | Global |

**Placeholder scan:** clean — Task 6 tests are fully specified with mocks.

**Type consistency:** `IndexStore.retrieve -> list[tuple[str,float]]`, draft route returns `escalated`, `confidence`, `sources`, `body`, `reason`; approve writes `agent` messages; thread statuses `open|escalated|resolved`; frontend `threadBadge` unions align with UI chips.
