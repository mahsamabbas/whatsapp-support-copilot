import io


def test_health_and_status_report_service_state(client):
    assert client.get("/health").json() == {"ok": True}

    status = client.get("/status")
    assert status.status_code == 200
    assert status.json() == {"ollama_ok": True, "bot_count": 1, "db_ok": True}


def test_create_and_get_bot(client):
    created = client.post("/bots", json={"name": "Acme Support"})
    assert created.status_code == 200
    bot = created.json()
    assert bot["id"] > 0
    assert bot["name"] == "Acme Support"
    assert "created_at" in bot

    fetched = client.get(f"/bots/{bot['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == bot


def test_create_bot_and_reject_bad_upload(client):
    bot_id = client.post("/bots", json={"name": "Acme Support"}).json()["id"]
    bad = client.post(
        f"/bots/{bot_id}/knowledge",
        files={"file": ("x.pdf", io.BytesIO(b"abc"), "application/pdf")},
    )
    assert bad.status_code == 400


def test_upload_rebuilds_index_and_lists_document(client):
    bot_id = client.post("/bots", json={"name": "Acme"}).json()["id"]
    body = ("Shipping takes 3 to 5 business days for standard orders. " * 10).encode()

    upload = client.post(
        f"/bots/{bot_id}/knowledge",
        files={"file": ("policy.md", io.BytesIO(body), "text/markdown")},
    )
    assert upload.status_code == 200
    assert upload.json()["filename"] == "policy.md"

    documents = client.get(f"/bots/{bot_id}/knowledge")
    assert documents.status_code == 200
    docs = documents.json()
    assert [doc["filename"] for doc in docs] == ["policy.md"]
    assert "Shipping takes 3 to 5 business days" in docs[0]["content_text"]
    assert client.app.state.index_store.has_index(bot_id)


def test_failed_upload_rolls_back_document_and_preserves_existing_index(
    client, monkeypatch
):
    bot_id = client.post("/bots", json={"name": "Acme"}).json()["id"]
    first_upload = client.post(
        f"/bots/{bot_id}/knowledge",
        files={
            "file": (
                "policy.md",
                io.BytesIO(
                    b"Shipping takes 3 to 5 business days for standard orders. " * 10
                ),
                "text/markdown",
            )
        },
    )
    assert first_upload.status_code == 200
    assert client.app.state.index_store.has_index(bot_id)

    monkeypatch.setattr(
        client.app.state.index_store,
        "build_for_bot",
        lambda *_: (_ for _ in ()).throw(RuntimeError("FAISS unavailable")),
    )
    failed_upload = client.post(
        f"/bots/{bot_id}/knowledge",
        files={
            "file": (
                "returns.md",
                io.BytesIO(b"Returns are accepted within 30 days of delivery. " * 10),
                "text/markdown",
            )
        },
    )

    assert failed_upload.status_code == 503
    documents = client.get(f"/bots/{bot_id}/knowledge")
    assert [document["filename"] for document in documents.json()] == ["policy.md"]
    assert client.app.state.index_store.has_index(bot_id)
