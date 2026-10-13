from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGINS
from app.db import (
    add_message,
    add_knowledge,
    approve_draft,
    create_escalation,
    create_thread,
    create_bot,
    delete_knowledge,
    get_bot,
    get_connection,
    get_latest_draft,
    get_thread,
    init_db,
    list_bots,
    list_escalations,
    list_knowledge,
    list_messages,
    list_threads,
    set_draft_state,
    set_thread_status,
)
from app.draft_service import NoCustomerMessageError, NoIndexError, generate_draft
from app.index_store import IndexStore
from app.models import (
    ApproveRequest,
    BotCreate,
    BotResponse,
    DraftResponse,
    DraftResultResponse,
    EscalateRequest,
    EscalationResponse,
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

logger = logging.getLogger(__name__)


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


def _thread_detail(conn, thread_id: int) -> ThreadDetailResponse:
    thread = get_thread(conn, thread_id)
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
        # No demo seed — operators create bots and upload knowledge themselves.
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
            except Exception as exc:
                logger.warning("Failed to rebuild FAISS index for bot_id=%s: %s", bot_id, exc)
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
        if get_thread(conn, thread_id) is None:
            raise HTTPException(status_code=404, detail="Thread not found.")
        return _thread_detail(conn, thread_id)
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


@app.post("/threads/{thread_id}/draft", response_model=DraftResultResponse)
def create_draft_route(thread_id: int, request: Request) -> DraftResultResponse:
    conn = get_connection()
    try:
        thread = get_thread(conn, thread_id)
        if thread is None:
            raise HTTPException(status_code=404, detail="Thread not found.")
        try:
            result = generate_draft(
                conn, request.app.state.index_store, thread["bot_id"], thread_id
            )
        except NoIndexError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except NoCustomerMessageError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return DraftResultResponse(
            body=result.body,
            confidence=result.confidence,
            sources=result.sources,
            escalated=result.escalated,
            reason=result.reason,
            draft_id=result.draft_id,
        )
    finally:
        conn.close()


@app.post("/threads/{thread_id}/approve", response_model=ThreadDetailResponse)
def approve_draft_route(
    thread_id: int, payload: ApproveRequest | None = None
) -> ThreadDetailResponse:
    conn = get_connection()
    try:
        if get_thread(conn, thread_id) is None:
            raise HTTPException(status_code=404, detail="Thread not found.")

        draft = get_latest_draft(conn, thread_id)
        override_body = (payload.body if payload else None) or ""
        body = override_body.strip() or (draft["body"] if draft else "")
        if not body:
            raise HTTPException(status_code=400, detail="No draft body to approve.")

        add_message(conn, thread_id, "agent", body)
        if draft is not None:
            approve_draft(conn, draft["id"])
        set_thread_status(conn, thread_id, "resolved")
        return _thread_detail(conn, thread_id)
    finally:
        conn.close()


@app.post("/threads/{thread_id}/escalate", response_model=ThreadDetailResponse)
def escalate_thread_route(
    thread_id: int, payload: EscalateRequest | None = None
) -> ThreadDetailResponse:
    conn = get_connection()
    try:
        if get_thread(conn, thread_id) is None:
            raise HTTPException(status_code=404, detail="Thread not found.")

        reason = (payload.reason if payload else None) or "Escalated by agent."
        create_escalation(conn, thread_id, reason)
        set_thread_status(conn, thread_id, "escalated")

        draft = get_latest_draft(conn, thread_id)
        if draft is not None:
            set_draft_state(conn, draft["id"], "escalated")
        return _thread_detail(conn, thread_id)
    finally:
        conn.close()


@app.get("/bots/{bot_id}/escalations", response_model=list[EscalationResponse])
def escalations_route(bot_id: int) -> list[EscalationResponse]:
    _bot_or_404(bot_id)
    conn = get_connection()
    try:
        return [
            _model(EscalationResponse, escalation)
            for escalation in list_escalations(conn, bot_id)
        ]
    finally:
        conn.close()
