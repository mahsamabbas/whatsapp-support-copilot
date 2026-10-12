import importlib

import pytest


@pytest.fixture()
def db_connection(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("SQLITE_PATH", str(path))

    import app.config as config
    import app.db as db

    importlib.reload(config)
    importlib.reload(db)
    conn = db.get_connection()
    db.init_db(conn)
    db.seed_if_empty(conn)
    yield conn
    conn.close()


def test_seed_creates_demo_bot_and_threads(db_connection):
    bots = db_connection.execute("SELECT * FROM bots").fetchall()
    assert len(bots) == 1
    assert bots[0]["name"]

    docs = db_connection.execute("SELECT * FROM knowledge_documents").fetchall()
    assert len(docs) >= 1

    threads = db_connection.execute("SELECT * FROM threads").fetchall()
    assert len(threads) >= 2

    messages = db_connection.execute("SELECT * FROM messages").fetchall()
    assert len(messages) >= 2
