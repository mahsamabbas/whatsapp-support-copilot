from unittest.mock import MagicMock


def _first_thread_id(client) -> int:
    bot_id = client.get("/bots").json()[0]["id"]
    return client.get(f"/bots/{bot_id}/threads").json()[0]["id"]


def test_grounded_draft_not_escalated(client, monkeypatch):
    tid = _first_thread_id(client)

    def fake_retrieve(bot_id, query, k=3):
        return [("Returns are accepted within 30 days of delivery.", 0.91)]

    fake_chat = MagicMock()
    fake_chat.invoke.return_value = MagicMock(
        content="You can return items within 30 days."
    )

    monkeypatch.setattr(
        "app.draft_service.get_chat", lambda: fake_chat
    )
    # Patch the store on the app (adjust path to match main.py wiring)
    store = client.app.state.index_store
    monkeypatch.setattr(store, "retrieve", fake_retrieve)
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)

    r = client.post(f"/threads/{tid}/draft")
    assert r.status_code == 200
    data = r.json()
    assert data["escalated"] is False
    assert "30 days" in data["body"]
    assert data["sources"]


def test_low_confidence_escalates_without_inventing(client, monkeypatch):
    tid = _first_thread_id(client)
    store = client.app.state.index_store
    monkeypatch.setattr(
        store,
        "retrieve",
        lambda bot_id, query, k=3: [("unrelated trivia", 0.12)],
    )
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)
    chat = MagicMock()
    monkeypatch.setattr("app.draft_service.get_chat", lambda: chat)

    r = client.post(f"/threads/{tid}/draft")
    assert r.status_code == 200
    data = r.json()
    assert data["escalated"] is True
    assert data["reason"]
    chat.invoke.assert_not_called()
    assert "World Cup" not in (data.get("body") or "")
    detail = client.get(f"/threads/{tid}").json()
    assert any(
        m["role"] == "agent" and "escalated to a human agent" in m["body"].lower()
        for m in detail["messages"]
    )


def test_approve_writes_agent_message(client, monkeypatch):
    tid = _first_thread_id(client)
    store = client.app.state.index_store
    monkeypatch.setattr(
        store,
        "retrieve",
        lambda bot_id, query, k=3: [("Returns within 30 days.", 0.9)],
    )
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)
    fake_chat = MagicMock()
    fake_chat.invoke.return_value = MagicMock(content="30-day returns apply.")
    monkeypatch.setattr("app.draft_service.get_chat", lambda: fake_chat)

    assert client.post(f"/threads/{tid}/draft").status_code == 200
    r = client.post(
        f"/threads/{tid}/approve",
        json={"body": "Happy to help — 30-day returns apply."},
    )
    assert r.status_code == 200
    detail = client.get(f"/threads/{tid}").json()
    assert any(m["role"] == "agent" for m in detail["messages"])


def test_approve_sets_thread_resolved(client, monkeypatch):
    tid = _first_thread_id(client)
    store = client.app.state.index_store
    monkeypatch.setattr(
        store,
        "retrieve",
        lambda bot_id, query, k=3: [("Returns within 30 days.", 0.9)],
    )
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)
    fake_chat = MagicMock()
    fake_chat.invoke.return_value = MagicMock(content="30-day returns apply.")
    monkeypatch.setattr("app.draft_service.get_chat", lambda: fake_chat)

    client.post(f"/threads/{tid}/draft")
    r = client.post(f"/threads/{tid}/approve")
    assert r.status_code == 200
    detail = client.get(f"/threads/{tid}").json()
    assert detail["status"] == "resolved"


def test_escalate_marks_approved_draft_escalated(client, monkeypatch):
    tid = _first_thread_id(client)
    store = client.app.state.index_store
    monkeypatch.setattr(
        store,
        "retrieve",
        lambda bot_id, query, k=3: [("Returns within 30 days.", 0.9)],
    )
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)
    fake_chat = MagicMock()
    fake_chat.invoke.return_value = MagicMock(content="30-day returns apply.")
    monkeypatch.setattr("app.draft_service.get_chat", lambda: fake_chat)

    assert client.post(f"/threads/{tid}/draft").status_code == 200
    assert client.post(f"/threads/{tid}/approve").status_code == 200
    assert client.post(f"/threads/{tid}/escalate").status_code == 200

    detail = client.get(f"/threads/{tid}").json()
    assert detail["status"] == "escalated"
    assert detail["latest_draft"]["state"] == "escalated"


def test_draft_without_index_returns_409(client, monkeypatch):
    tid = _first_thread_id(client)
    store = client.app.state.index_store
    monkeypatch.setattr(store, "has_index", lambda bot_id: False)

    r = client.post(f"/threads/{tid}/draft")
    assert r.status_code == 409


def test_draft_without_customer_message_returns_400(client, monkeypatch):
    bot_id = client.get("/bots").json()[0]["id"]
    store = client.app.state.index_store
    monkeypatch.setattr(store, "has_index", lambda bot_id: True)

    created = client.post(
        f"/bots/{bot_id}/threads", json={"customer_name": "No Messages"}
    )
    tid = created.json()["id"]

    r = client.post(f"/threads/{tid}/draft")
    assert r.status_code == 400


def test_manual_escalate_sets_status_and_creates_escalation(client, monkeypatch):
    bot_id = client.get("/bots").json()[0]["id"]
    tid = _first_thread_id(client)

    r = client.post(f"/threads/{tid}/escalate", json={"reason": "Angry customer"})
    assert r.status_code == 200

    detail = client.get(f"/threads/{tid}").json()
    assert detail["status"] == "escalated"
    assert any(
        m["role"] == "agent" and "escalated to a human agent" in m["body"].lower()
        for m in detail["messages"]
    )

    escalations = client.get(f"/bots/{bot_id}/escalations").json()
    assert any(e["thread_id"] == tid and e["reason"] == "Angry customer" for e in escalations)
