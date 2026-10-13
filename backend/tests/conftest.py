import sys
import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "test.db"))

    import app.config as config
    import app.db as db
    import app.main as main
    import app.ollama_clients as ollama_clients
    from app.index_store import IndexStore
    from tests.fakes import FakeEmbeddings

    importlib.reload(config)
    importlib.reload(db)
    importlib.reload(ollama_clients)
    monkeypatch.setattr(ollama_clients, "ollama_ok", lambda: True)
    importlib.reload(main)
    monkeypatch.setattr(
        main,
        "IndexStore",
        lambda: IndexStore(embeddings_factory=lambda: FakeEmbeddings()),
    )

    # Tests still use the demo seed; production lifespan no longer seeds.
    conn = db.get_connection()
    try:
        db.init_db(conn)
        db.seed_if_empty(conn)
    finally:
        conn.close()

    with TestClient(main.app) as test_client:
        yield test_client
