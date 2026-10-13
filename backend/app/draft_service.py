"""Core RAG loop: retrieve grounded excerpts, draft a reply, or escalate."""

import json
import sqlite3
from dataclasses import dataclass

from app.config import (
    ESCALATION_CUSTOMER_NOTICE,
    ESCALATION_REASON_LOW_CONFIDENCE,
    SIMILARITY_CUTOFF,
)
from app.db import (
    add_message,
    create_escalation,
    list_messages,
    set_thread_status,
    upsert_draft,
)
from app.ollama_clients import get_chat

SYSTEM_PROMPT = (
    "You are a WhatsApp customer support agent. Using ONLY the policy excerpts "
    "provided below, write a short, friendly WhatsApp-style reply to the "
    "customer's message. Never invent or assume any policy, price, date, or "
    "fact that is not explicitly present in the excerpts. If the excerpts do "
    "not fully answer the question, respond only with what is supported by "
    "them and keep the reply brief."
)


class NoIndexError(Exception):
    """Raised when the bot has no knowledge index built yet."""


class NoCustomerMessageError(Exception):
    """Raised when the thread has no customer message to respond to."""


@dataclass
class DraftResult:
    body: str
    confidence: float
    sources: list[str]
    escalated: bool
    reason: str | None
    draft_id: int


def _latest_customer_message(conn: sqlite3.Connection, thread_id: int) -> str | None:
    for message in reversed(list_messages(conn, thread_id)):
        if message["role"] == "customer":
            return message["body"]
    return None


def _build_prompt(query: str, sources: list[str]) -> str:
    excerpts = "\n\n".join(f"- {source}" for source in sources)
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Policy excerpts:\n{excerpts}\n\n"
        f"Customer message: {query}\n\n"
        "Agent reply:"
    )


def generate_draft(conn: sqlite3.Connection, store, bot_id: int, thread_id: int) -> DraftResult:
    if not store.has_index(bot_id):
        raise NoIndexError("Bot has no knowledge index.")

    query = _latest_customer_message(conn, thread_id)
    if query is None:
        raise NoCustomerMessageError("Thread has no customer message to respond to.")

    results = store.retrieve(bot_id, query, k=3)
    sources = [text for text, _score in results]
    confidence = max((score for _text, score in results), default=0.0)

    if confidence < SIMILARITY_CUTOFF:
        draft = upsert_draft(
            conn,
            thread_id,
            "",
            confidence,
            json.dumps(sources),
            state="escalated",
        )
        create_escalation(conn, thread_id, ESCALATION_REASON_LOW_CONFIDENCE)
        set_thread_status(conn, thread_id, "escalated")
        add_message(conn, thread_id, "agent", ESCALATION_CUSTOMER_NOTICE)
        return DraftResult(
            body="",
            confidence=confidence,
            sources=sources,
            escalated=True,
            reason=ESCALATION_REASON_LOW_CONFIDENCE,
            draft_id=draft["id"],
        )

    chat = get_chat()
    response = chat.invoke(_build_prompt(query, sources))
    body = str(getattr(response, "content", response)).strip()

    draft = upsert_draft(
        conn,
        thread_id,
        body,
        confidence,
        json.dumps(sources),
        state="pending",
    )
    return DraftResult(
        body=body,
        confidence=confidence,
        sources=sources,
        escalated=False,
        reason=None,
        draft_id=draft["id"],
    )
