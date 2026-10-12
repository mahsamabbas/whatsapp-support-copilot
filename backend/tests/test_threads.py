def test_list_and_create_threads(client):
    bot_id = client.get("/bots").json()[0]["id"]

    listed = client.get(f"/bots/{bot_id}/threads")
    assert listed.status_code == 200
    assert {"id", "customer_name", "status", "last_message_preview", "updated_at"} <= set(
        listed.json()[0]
    )

    created = client.post(
        f"/bots/{bot_id}/threads", json={"customer_name": "Priya Shah"}
    )
    assert created.status_code == 200
    assert created.json()["customer_name"] == "Priya Shah"
    assert created.json()["status"] == "open"


def test_blank_customer_name_is_rejected(client):
    bot_id = client.get("/bots").json()[0]["id"]

    response = client.post(f"/bots/{bot_id}/threads", json={"customer_name": ""})

    assert response.status_code == 422


def test_thread_detail_includes_messages_and_latest_draft(client):
    bot_id = client.get("/bots").json()[0]["id"]
    thread_id = client.get(f"/bots/{bot_id}/threads").json()[0]["id"]

    detail = client.get(f"/threads/{thread_id}")

    assert detail.status_code == 200
    assert detail.json()["id"] == thread_id
    assert detail.json()["messages"]
    assert detail.json()["latest_draft"] is None


def test_customer_message_appends(client):
    bot_id = client.get("/bots").json()[0]["id"]
    thread_id = client.get(f"/bots/{bot_id}/threads").json()[0]["id"]

    response = client.post(
        f"/threads/{thread_id}/messages",
        json={"role": "customer", "body": "Where is my order?"},
    )

    assert response.status_code == 200
    detail = client.get(f"/threads/{thread_id}").json()
    assert any(message["body"] == "Where is my order?" for message in detail["messages"])


def test_blank_message_is_rejected(client):
    bot_id = client.get("/bots").json()[0]["id"]
    thread_id = client.get(f"/bots/{bot_id}/threads").json()[0]["id"]

    blank = client.post(
        f"/threads/{thread_id}/messages",
        json={"role": "customer", "body": "   "},
    )

    assert blank.status_code == 400


def test_message_for_unknown_thread_is_rejected(client):
    missing = client.post(
        "/threads/999999/messages",
        json={"role": "agent", "body": "Hello"},
    )

    assert missing.status_code == 404
