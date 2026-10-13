from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class BotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class BotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: str


class KnowledgeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int
    filename: str
    content_text: str
    created_at: str


class StatusResponse(BaseModel):
    ollama_ok: bool
    bot_count: int
    db_ok: bool


class ThreadCreate(BaseModel):
    customer_name: str = Field(min_length=1)


class ThreadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bot_id: int
    customer_name: str
    status: str
    updated_at: str
    last_message_preview: str | None = None


class MessageCreate(BaseModel):
    role: Literal["customer", "agent"]
    body: str


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    role: Literal["customer", "agent"]
    body: str
    created_at: str


class DraftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    body: str
    confidence: float
    sources_json: str
    state: str
    created_at: str


class ThreadDetailResponse(ThreadResponse):
    messages: list[MessageResponse]
    latest_draft: DraftResponse | None


class DraftResultResponse(BaseModel):
    body: str
    confidence: float
    sources: list[str]
    escalated: bool
    reason: str | None
    draft_id: int


class ApproveRequest(BaseModel):
    body: str | None = None


class EscalateRequest(BaseModel):
    reason: str | None = None


class EscalationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    reason: str
    status: str
    created_at: str
