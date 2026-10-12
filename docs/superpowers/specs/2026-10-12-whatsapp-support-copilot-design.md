# WhatsApp-Style Support Reply Copilot (ReplyDesk)

Design for App 4. Simulated WhatsApp-style **agent inbox** that drafts support replies from each bot’s uploaded knowledge, lets the agent edit and approve a simulated send, and escalates unclear questions to a human. Multi-bot: create a bot, give it knowledge (doc upload), then work its threads. Drafts only — no real WhatsApp connection, no automatic external sending, no URL scraping.

## Decisions

- **Product goal:** Portfolio-ready, WhatsApp-faithful agent desk (Approach 1 — Multi-bot Support Desk), balanced for ~4 hours: strong UI + complete copilot loop.
- **Bots:** Multiple bots per install. Each bot has its own name, knowledge documents, threads, drafts, and escalations.
- **Knowledge:** Per-bot `.txt` / `.md` upload only (v1). No URL ingest. Text stored in SQLite; FAISS index per bot built in memory on boot and after upload.
- **LLM:** Local **Ollama** (same family as App 3): chat `qwen2.5:7b`, embeddings `nomic-embed-text`. Browser never calls Ollama. No Gemini/OpenAI required for the core demo.
- **Persistence:** **SQLite** for bots, knowledge document text, threads, messages, drafts, escalations. FAISS stays in-memory (rebuilt from SQLite).
- **Layout:** Agent inbox — left conversation list · center WhatsApp-style thread · right AI draft panel. Top bar bot switcher + create bot.
- **Customer input:** Seeded sample threads per demo bot **and** “Act as Customer” to append new customer messages.
- **Escalation:** Auto-flag when retrieval confidence is below cutoff **and** manual Escalate anytime. Unclear answers must not invent policy facts.
- **Send:** Approve & send appends an **agent** message to the thread in SQLite only (simulated). Never hits WhatsApp or any messaging network.
- **Frontend identity:** Branded **ReplyDesk** — WhatsApp-inspired (green accents, bubbles), clearly a demo product; do not copy Meta brand assets or Apps 1–3 layouts.
- **Ports:** Frontend **3003**, API **8003**, Ollama **11434**.

## Architecture

Three runtime pieces on the developer machine:

1. **Chrome + React (Vite) + TypeScript + Tailwind** — ReplyDesk agent desk UI. Default port **3003**.
2. **FastAPI** — bots CRUD, knowledge upload, threads/messages, draft generation, approve/escalate, SQLite, FAISS per bot, Ollama. Default port **8003**.
3. **Ollama on the host** (`http://127.0.0.1:11434`) — `qwen2.5:7b` and `nomic-embed-text`. Dockerized API reaches Ollama via `host.docker.internal` (or `OLLAMA_BASE_URL`).

```
[Chrome / ReplyDesk]
  bot switcher · inbox list · WhatsApp thread · draft panel · customer/agent role
        │ HTTP/JSON only
        ▼
[FastAPI :8003]
  SQLite (bots, docs, threads, messages, drafts, escalations)
  FAISS per bot ← rebuild from knowledge_documents
  retrieve → cutoff → ChatOllama draft or escalate
        │
        ▼
[Ollama :11434]
  nomic-embed-text · qwen2.5:7b
```

## Frontend — ReplyDesk

**Concept:** One composition that reads as a **support agent workstation**: familiar messaging chrome + a copilot column. Not a generic three-column dashboard of cards.

| Token | Choice |
| --- | --- |
| Brand | **ReplyDesk** as hero-level wordmark in the top bar |
| Canvas | Soft chat green wash over warm off-white (WhatsApp-inspired atmosphere, not flat white) |
| Accent | WhatsApp-adjacent green `#25D366` on deep ink `#111B21` |
| Type | Display **Outfit**; UI **DM Sans** |
| Layout | Top: brand + bot switcher · Left: threads · Center: bubbles · Right: draft copilot |

**Motion (required):**

1. **New customer message** — brief highlight on the thread row + soft pulse on draft panel “Generate”.
2. **Drafting** — skeleton / shimmer in the draft panel while the API runs.
3. **Escalated** — badge slide-in on the thread + reason callout in the draft panel.

**Anti-copy rules:** No EchoFAQ orb / Wavelength studio; no App 1 teal/coral FAQ chrome; no App 2 lead sidebar; no purple gradient theme; no cream/terracotta serif look; no Meta logo or WhatsApp wordmark.

### UI regions

**Top bar.** ReplyDesk wordmark, bot select/create, knowledge status for active bot (`Ready` / `Needs docs`).

**Left — Conversations.** Threads for the active bot: customer name, last preview, badges `Needs draft` / `Escalated` / `Replied`.

**Center — Thread.** Customer bubbles left, agent right. Role toggle: **Customer** | **Agent**. Customer mode types into the thread. Agent mode uses the right panel for replies (no free-form agent composer that bypasses the draft flow for the primary demo path).

**Right — Copilot.** Generate draft (also triggerable after a new customer message), editable text, confidence, policy excerpts, actions: **Approve & send (simulated)**, **Escalate**, **Regenerate**. Auto-escalation shows reason; agent can still take over manually.

**Bot setup.** Modal or light screen: create bot (name); upload `.txt` / `.md`; list current knowledge files; re-index on successful upload. No URL field in v1.

## Data model (SQLite)

- `bots` — id, name, created_at
- `knowledge_documents` — id, bot_id, filename, content_text, created_at
- `threads` — id, bot_id, customer_name, status (`open` | `escalated` | `resolved`), updated_at
- `messages` — id, thread_id, role (`customer` | `agent`), body, created_at
- `drafts` — id, thread_id, body, confidence, sources_json, state (`pending` | `approved` | `escalated`), created_at
- `escalations` — id, thread_id, reason, status (`open` | `resolved`), created_at

FAISS indexes are **not** stored in SQLite. On startup and after knowledge changes, rebuild the in-memory index for each bot that has documents.

## Components (backend)

**Bot service.** Create/list bots; select active context for inbox queries.

**Knowledge service.** Accept UTF-8 `.txt` / `.md`; validate size; store full text in SQLite; chunk (≈400 / ≈40 overlap); embed with `nomic-embed-text`; replace or refresh that bot’s FAISS index. Reject empty / too-short / too-long uploads with 400; leave previous index intact on failure.

**Thread service.** List/create threads; append customer or agent messages; seed demo threads for the sample bot.

**Draft service.** Build query from latest customer message (+ light thread context). Retrieve top chunks for that bot. If best similarity **&lt; 0.45** (env-overridable), do not invent an answer: create/update draft state escalated (or empty draft) + escalation reason, set thread status `escalated`. Otherwise call chat model grounded on excerpts; return draft body, confidence, sources.

**Approve.** Persist agent message from draft body; mark draft `approved`; clear or resolve “needs draft”.

**Escalate.** Manual path creates/opens an escalation row and sets thread `escalated` with agent-provided or default reason.

## Data flow

**Startup.** Open SQLite; ensure schema; if empty, seed one demo bot + sample policy doc + 2–3 threads (at least one in-policy, one escalate-worthy). Build FAISS for bots that have docs. `GET /status` reports DB path, bot count, Ollama reachability.

**Create bot.** Insert bot row; inbox empty until knowledge + threads exist.

**Upload knowledge.** Validate → store → rebuild that bot’s FAISS → return status. Failed embed/Ollama → 503, previous index kept when possible.

**Customer message.** Save message; UI offers / triggers draft generation for that thread.

**Generate draft.** Retrieve → cutoff → draft or auto-escalate → persist draft (+ escalation if needed) → return payload to UI.

**Approve & send.** Write agent message; draft `approved`; thread can show `Replied`.

**Manual escalate.** Escalation row + badge regardless of confidence.

**Restart.** SQLite keeps bots, docs, threads, messages, drafts, escalations. FAISS rebuilt from stored document text.

## API

- `GET /health` — liveness
- `GET /status` — `{ "ollama_ok": boolean, "bot_count": number, "db_ok": boolean }`
- `GET /bots`, `POST /bots` — `{ "name": string }`
- `GET /bots/{id}`
- `GET /bots/{id}/knowledge`, `POST /bots/{id}/knowledge` — multipart `file`
- `GET /bots/{id}/threads`, `POST /bots/{id}/threads` — optional `{ "customer_name": string }`
- `GET /threads/{id}` — thread + messages + latest draft summary
- `POST /threads/{id}/messages` — `{ "role": "customer" | "agent", "body": string }` (demo uses customer; agent primarily via approve)
- `POST /threads/{id}/draft` — generate/regenerate draft
- `POST /threads/{id}/approve` — `{ "body"?: string }` optional edit override; simulated send
- `POST /threads/{id}/escalate` — `{ "reason"?: string }`
- `GET /bots/{id}/escalations`

### Config (`.env` / `.env.example`)

- `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- `OLLAMA_CHAT_MODEL` (default `qwen2.5:7b`)
- `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`)
- `SIMILARITY_CUTOFF` (default `0.45`)
- `DATABASE_URL` or `SQLITE_PATH` (default under `backend/data/replydesk.db`)
- CORS for the Vite origin (`http://localhost:3003`)

No cloud API keys required for the core demo. Secrets never committed; parent `.github_key` stays outside this repo.

## Error handling

| Case | Result |
| --- | --- |
| Wrong extension, empty, &lt;200 or &gt;12,000 chars, not UTF-8 | 400; previous knowledge/index unchanged |
| No knowledge for bot when drafting | 400/409 with clear message; UI blocks draft |
| Best similarity &lt; cutoff | Escalation path; no fabricated policy answer |
| Ollama down / missing models | 503 on draft or upload-embed; UI shows error in draft panel |
| Unknown bot/thread id | 404 |
| Blank message body | 400 |

## Testing

Minimum (Ollama mocked in unit/API tests):

1. **Normal:** Uploaded policy supports a customer question → draft returned with sources, not escalated.
2. **Failure / unclear:** Out-of-policy question → escalated flag/reason, no invented facts.
3. **Approve (optional but preferred):** Approve writes an agent message to the thread.
4. **Upload validation:** Empty or wrong-type file rejected.

Frontend: light Vitest for pure helpers if any (e.g. badge/status mapping); not required to E2E Ollama in CI.

## Delivery

- Repo: `whatsapp-support-copilot` (public under `mahsamabbas` when pushed).
- `docker-compose.yml` — frontend (nginx) + backend; Ollama on host.
- README — stack, ports, setup, API summary, limitations, what was built.
- Screenshots or short demo video for the assignment thread.
- Known limitations documented: in-memory FAISS (rebuild on boot), no real WhatsApp, no URL knowledge, single-operator demo (no auth), answer quality depends on local Ollama hardware.

## Out of scope

- Real WhatsApp, Twilio, Cloud API, or any auto-send to customers
- URL / website crawl ingest
- Multi-user auth, roles, or analytics dashboards
- Telephony, voice, or App 3–style TTS
- Gemini or other cloud LLMs for the core path

## Success criteria

Matches portfolio “done means”: working multi-bot create → knowledge upload → draft → approve/escalate loop; README + `.env.example`; at least one normal and one failure-case test with results; clear limitations; no secrets in git.
