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
