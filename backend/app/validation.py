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
