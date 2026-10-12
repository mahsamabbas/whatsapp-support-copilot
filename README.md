# ReplyDesk

ReplyDesk is a local, multi-bot support inbox that drafts grounded replies to
customer messages. Each bot has its own uploaded Markdown or text knowledge
base; ReplyDesk retrieves relevant excerpts with FAISS, asks Ollama for a short
reply, and lets a human approve or escalate it. It simulates a WhatsApp-style
workflow—it does not connect to WhatsApp or send real messages.

## Prerequisites

- Docker Desktop (for the containerized run), or Python 3.12+ and Node.js 22+
  (for local development)
- [Ollama](https://ollama.com/) running on the host

Pull the default chat and embedding models before starting:

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

## Run with Docker Compose

Docker Compose serves the frontend at http://localhost:3003 and the API at
http://localhost:8003. Ollama remains on your host machine; the backend reaches
it through `host.docker.internal`.

```bash
cp .env.example .env
docker compose up --build
```

Use the root `.env.example` for Docker Compose; use `backend/.env.example` when
running local `uvicorn`.

The SQLite database is persisted on the host at `backend/data/replydesk.db`.
Stop the stack with `docker compose down`; omit `-v` so the demo data remains.

On Linux, Docker Compose maps `host.docker.internal` with `host-gateway`.
If your Docker version does not support that mapping, set `OLLAMA_BASE_URL` in
`.env` to an address reachable from the backend container.

## Run locally

Terminal 1:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8003
```

Terminal 2:

```bash
cd frontend
npm ci
VITE_API_BASE=http://localhost:8003 npm run dev -- --port 3003
```

Open http://localhost:3003. The backend seeds a Demo Shop Support bot with
policy content and sample conversations on first start.

## Multi-bot demo

1. Open the seeded **Demo Shop Support** bot and select a customer thread.
2. Generate a reply, review the grounded source excerpts, then approve it to
   simulate sending—or escalate it to a human.
3. Click **Create bot**, name a second bot, and upload a UTF-8 `.txt` or `.md`
   policy between 200 and 12,000 characters.
4. Create or select a thread for that bot, add a customer message, and generate
   a reply. Its knowledge remains isolated from the demo bot.

## Tests

Backend tests mock Ollama and must not require a running Ollama server:

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. pytest -v
```

Expected result: all pytest tests pass.

```bash
cd frontend
npx vitest run
```

Expected result: all Vitest tests pass.

## Limitations

- No WhatsApp integration, outbound sending, or automatic messaging.
- Ollama must run locally and the selected models must already be pulled.
- Knowledge uploads accept only UTF-8 `.txt` and `.md` files.
- Retrieval indexes are rebuilt in memory when the backend starts; SQLite
  persists bots, policies, threads, drafts, and escalations.
- This is a local demo, not a production authentication, authorization, or
  multi-user deployment.

## Design and implementation plan

- [Design specification](docs/superpowers/specs/2026-10-12-whatsapp-support-copilot-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-12-whatsapp-support-copilot.md)
