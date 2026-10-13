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
ESCALATION_CUSTOMER_NOTICE = (
    "Your case has been escalated to a human agent. "
    "Someone from our team will follow up shortly."
)
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3003,http://127.0.0.1:3003",
    ).split(",")
    if o.strip()
]
