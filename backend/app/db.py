import sqlite3
from pathlib import Path

from app.config import SAMPLE_POLICY_PATH, SQLITE_PATH


def get_connection() -> sqlite3.Connection:
    Path(SQLITE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS bots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS knowledge_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            content_text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS threads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
            customer_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'escalated', 'resolved')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('customer', 'agent')),
            body TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS drafts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
            body TEXT NOT NULL,
            confidence REAL NOT NULL,
            sources_json TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'pending'
                CHECK (state IN ('pending', 'approved', 'escalated')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS escalations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'resolved')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """
    )
    conn.commit()


def _inserted_row(conn: sqlite3.Connection, query: str, params: tuple) -> sqlite3.Row:
    cursor = conn.execute(query, params)
    conn.commit()
    return conn.execute(
        f"SELECT * FROM {query.split('INTO ', 1)[1].split(' ', 1)[0]} WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()


def create_bot(conn: sqlite3.Connection, name: str) -> sqlite3.Row:
    return _inserted_row(conn, "INSERT INTO bots (name) VALUES (?)", (name,))


def list_bots(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM bots ORDER BY id").fetchall()


def get_bot(conn: sqlite3.Connection, bot_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM bots WHERE id = ?", (bot_id,)).fetchone()


def add_knowledge(
    conn: sqlite3.Connection, bot_id: int, filename: str, content_text: str
) -> sqlite3.Row:
    return _inserted_row(
        conn,
        "INSERT INTO knowledge_documents (bot_id, filename, content_text) VALUES (?, ?, ?)",
        (bot_id, filename, content_text),
    )


def list_knowledge(conn: sqlite3.Connection, bot_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM knowledge_documents WHERE bot_id = ? ORDER BY id", (bot_id,)
    ).fetchall()


def delete_knowledge(conn: sqlite3.Connection, document_id: int) -> None:
    conn.execute("DELETE FROM knowledge_documents WHERE id = ?", (document_id,))
    conn.commit()


def list_threads(conn: sqlite3.Connection, bot_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT threads.*,
               (
                   SELECT body FROM messages
                   WHERE thread_id = threads.id
                   ORDER BY id DESC LIMIT 1
               ) AS last_message_preview
        FROM threads
        WHERE bot_id = ?
        ORDER BY updated_at DESC, id DESC
        """,
        (bot_id,),
    ).fetchall()


def create_thread(
    conn: sqlite3.Connection, bot_id: int, customer_name: str
) -> sqlite3.Row:
    return _inserted_row(
        conn,
        "INSERT INTO threads (bot_id, customer_name) VALUES (?, ?)",
        (bot_id, customer_name),
    )


def get_thread(conn: sqlite3.Connection, thread_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM threads WHERE id = ?", (thread_id,)).fetchone()


def add_message(
    conn: sqlite3.Connection, thread_id: int, role: str, body: str
) -> sqlite3.Row:
    message = _inserted_row(
        conn,
        "INSERT INTO messages (thread_id, role, body) VALUES (?, ?, ?)",
        (thread_id, role, body),
    )
    conn.execute(
        "UPDATE threads SET updated_at = datetime('now') WHERE id = ?", (thread_id,)
    )
    conn.commit()
    return message


def list_messages(conn: sqlite3.Connection, thread_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM messages WHERE thread_id = ? ORDER BY id", (thread_id,)
    ).fetchall()


def upsert_draft(
    conn: sqlite3.Connection,
    thread_id: int,
    body: str,
    confidence: float,
    sources_json: str,
    state: str = "pending",
) -> sqlite3.Row:
    existing = conn.execute(
        "SELECT id FROM drafts WHERE thread_id = ? AND state = 'pending' ORDER BY id DESC LIMIT 1",
        (thread_id,),
    ).fetchone()
    if existing:
        conn.execute(
            """
            UPDATE drafts
            SET body = ?, confidence = ?, sources_json = ?, state = ?
            WHERE id = ?
            """,
            (body, confidence, sources_json, state, existing["id"]),
        )
        conn.commit()
        return conn.execute(
            "SELECT * FROM drafts WHERE id = ?", (existing["id"],)
        ).fetchone()
    return _inserted_row(
        conn,
        """
        INSERT INTO drafts (thread_id, body, confidence, sources_json, state)
        VALUES (?, ?, ?, ?, ?)
        """,
        (thread_id, body, confidence, sources_json, state),
    )


def get_latest_draft(conn: sqlite3.Connection, thread_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM drafts WHERE thread_id = ? ORDER BY id DESC LIMIT 1", (thread_id,)
    ).fetchone()


def approve_draft(conn: sqlite3.Connection, draft_id: int) -> sqlite3.Row | None:
    conn.execute("UPDATE drafts SET state = 'approved' WHERE id = ?", (draft_id,))
    conn.commit()
    return conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()


def set_draft_state(
    conn: sqlite3.Connection, draft_id: int, state: str
) -> sqlite3.Row | None:
    conn.execute("UPDATE drafts SET state = ? WHERE id = ?", (state, draft_id))
    conn.commit()
    return conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()


def create_escalation(
    conn: sqlite3.Connection, thread_id: int, reason: str
) -> sqlite3.Row:
    return _inserted_row(
        conn,
        "INSERT INTO escalations (thread_id, reason) VALUES (?, ?)",
        (thread_id, reason),
    )


def list_escalations(conn: sqlite3.Connection, bot_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT escalations.*
        FROM escalations
        JOIN threads ON threads.id = escalations.thread_id
        WHERE threads.bot_id = ?
        ORDER BY escalations.id DESC
        """,
        (bot_id,),
    ).fetchall()


def set_thread_status(
    conn: sqlite3.Connection, thread_id: int, status: str
) -> sqlite3.Row | None:
    conn.execute(
        "UPDATE threads SET status = ?, updated_at = datetime('now') WHERE id = ?",
        (status, thread_id),
    )
    conn.commit()
    return get_thread(conn, thread_id)


def seed_if_empty(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT COUNT(*) FROM bots").fetchone()[0] > 0:
        return

    bot = create_bot(conn, "Demo Shop Support")
    add_knowledge(conn, bot["id"], SAMPLE_POLICY_PATH.name, SAMPLE_POLICY_PATH.read_text())

    aisha = create_thread(conn, bot["id"], "Aisha Khan")
    add_message(
        conn,
        aisha["id"],
        "customer",
        "What is the return window for an item I received?",
    )

    omar = create_thread(conn, bot["id"], "Omar Ali")
    add_message(
        conn,
        omar["id"],
        "customer",
        "What do you think about the latest politics news?",
    )

    liam = create_thread(conn, bot["id"], "Liam Chen")
    add_message(
        conn,
        liam["id"],
        "customer",
        "How long does standard shipping take?",
    )
