from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGINS
from app.db import (
    add_message,
    add_knowledge,
    create_thread,
    create_bot,
    delete_knowledge,
    get_bot,
    get_connection,
    get_latest_draft,
    get_thread,
    init_db,
    list_bots,
    list_knowledge,
    list_messages,
    list_threads,
    seed_if_empty,
)
from app.index_store import IndexStore
from app.models import (
    BotCreate,
    BotResponse,
    DraftResponse,
    KnowledgeDocumentResponse,
    MessageCreate,
    MessageResponse,
    StatusResponse,
    ThreadCreate,
    ThreadDetailResponse,
    ThreadResponse,
)
from app.ollama_clients import ollama_ok
from app.validation import ValidationError, validate_knowledge_bytes


def _bot_or_404(bot_id: int):
    conn = get_connection()
    try:
        bot = get_bot(conn, bot_id)
    finally:
        conn.close()
    if bot is None:
        raise HTTPException(status_code=404, detail="Bot not found.")
    return bot


def _model(model_type, row):
    return model_type.model_validate(dict(row))


def _build_index_for_bot(index_store: IndexStore, bot_id: int) -> None:
    conn = get_connection()
    try:
        texts = [document["content_text"] for document in list_knowledge(conn, bot_id)]
    finally:
        conn.close()
    index_store.build_for_bot(bot_id, texts)


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = get_connection()
    try:
        init_db(conn)
        seed_if_empty(conn)
        bots = list_bots(conn)
        documents_by_bot = {
            bot["id"]: [doc["content_text"] for doc in list_knowledge(conn, bot["id"])]
            for bot in bots
        }
    finally:
        conn.close()

    index_store = IndexStore()
    app.state.index_store = index_store
    for bot_id, texts in documents_by_bot.items():
        if texts:
            try:
                index_store.build_for_bot(bot_id, texts)
            except Exception:
                pass
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValidationError)
async def validation_error_handler(_: Request, exc: ValidationError):
    return JSONResponse(status_code=400, content={"detail": exc.message})


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/status", response_model=StatusResponse)
def status() -> StatusResponse:
    try:
        conn = get_connection()
        try:
            bot_count = len(list_bots(conn))
        finally:
            conn.close()
        db_ok = True
    except Exception:
        bot_count = 0
        db_ok = False
    return StatusResponse(ollama_ok=ollama_ok(), bot_count=bot_count, db_ok=db_ok)


@app.get("/bots", response_model=list[BotResponse])
def bots() -> list[BotResponse]:
    conn = get_connection()
    try:
        return [_model(BotResponse, bot) for bot in list_bots(conn)]
    finally:
        conn.close()


@app.post("/bots", response_model=BotResponse)
def create_bot_route(payload: BotCreate) -> BotResponse:
    conn = get_connection()
    try:
        return _model(BotResponse, create_bot(conn, payload.name))
    finally:
        conn.close()


@app.get("/bots/{bot_id}", response_model=BotResponse)
def bot(bot_id: int) -> BotResponse:
    return _model(BotResponse, _bot_or_404(bot_id))


@app.get("/bots/{bot_id}/threads", response_model=list[ThreadResponse])
def threads(bot_id: int) -> list[ThreadResponse]:
    _bot_or_404(bot_id)
    conn = get_connection()
    try:
        return [_model(ThreadResponse, thread) for thread in list_threads(conn, bot_id)]
    finally:
        conn.close()


@app.post("/bots/{bot_id}/threads", response_model=ThreadResponse)
def create_thread_route(bot_id: int, payload: ThreadCreate) -> ThreadResponse:
    _bot_or_404(bot_id)
    conn = get_connection()
    try:
        return _model(ThreadResponse, create_thread(conn, bot_id, payload.customer_name))
    finally:
        conn.close()


@app.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
def thread_detail(thread_id: int) -> ThreadDetailResponse:
    conn = get_connection()
    try:
        thread = get_thread(conn, thread_id)
        if thread is None:
            raise HTTPException(status_code=404, detail="Thread not found.")
        return ThreadDetailResponse(
            **_model(ThreadResponse, thread).model_dump(),
            messages=[
                _model(MessageResponse, message)
                for message in list_messages(conn, thread_id)
            ],
            latest_draft=(
                _model(DraftResponse, draft)
                if (draft := get_latest_draft(conn, thread_id)) is not None
                else None
            ),
        )
    finally:
        conn.close()


@app.post("/threads/{thread_id}/messages", response_model=MessageResponse)
def create_message(thread_id: int, payload: MessageCreate) -> MessageResponse:
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Message body cannot be blank.")
    conn = get_connection()
    try:
        if get_thread(conn, thread_id) is None:
            raise HTTPException(status_code=404, detail="Thread not found.")
        return _model(
            MessageResponse, add_message(conn, thread_id, payload.role, payload.body)
        )
    finally:
        conn.close()


@app.get("/bots/{bot_id}/knowledge", response_model=list[KnowledgeDocumentResponse])
def knowledge(bot_id: int) -> list[KnowledgeDocumentResponse]:
    _bot_or_404(bot_id)
    conn = get_connection()
    try:
        return [
            _model(KnowledgeDocumentResponse, document)
            for document in list_knowledge(conn, bot_id)
        ]
    finally:
        conn.close()


@app.post(
    "/bots/{bot_id}/knowledge",
    response_model=KnowledgeDocumentResponse,
)
async def upload_knowledge(
    bot_id: int, request: Request, file: UploadFile = File(...)
) -> KnowledgeDocumentResponse:
    _bot_or_404(bot_id)
    text = validate_knowledge_bytes(file.filename or "", await file.read())

    conn = get_connection()
    try:
        document = add_knowledge(conn, bot_id, file.filename or "", text)
    finally:
        conn.close()

    try:
        _build_index_for_bot(request.app.state.index_store, bot_id)
    except Exception as exc:
        conn = get_connection()
        try:
            delete_knowledge(conn, document["id"])
        finally:
            conn.close()
        raise HTTPException(
            status_code=503, detail="Knowledge index is temporarily unavailable."
        ) from exc
    return _model(KnowledgeDocumentResponse, document)
