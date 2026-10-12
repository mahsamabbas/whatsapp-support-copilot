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
    created_at: str


class StatusResponse(BaseModel):
    ollama_ok: bool
    bot_count: int
    db_ok: bool
