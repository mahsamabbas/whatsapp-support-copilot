from app.index_store import IndexStore

from tests.fakes import FakeEmbeddings


def test_build_and_retrieve():
    store = IndexStore(embeddings_factory=lambda: FakeEmbeddings())

    store.build_for_bot(
        1, ["Returns are accepted within 30 days of delivery. Keep your receipt."]
    )

    hits = store.retrieve(1, "How long do I have to return?", k=1)

    assert len(hits) == 1
    assert "30 days" in hits[0][0]
    assert 0.0 <= hits[0][1] <= 1.0


def test_indexes_are_isolated_per_bot():
    store = IndexStore(embeddings_factory=lambda: FakeEmbeddings())
    store.build_for_bot(1, ["First bot policy."])
    store.build_for_bot(2, ["Second bot policy."])

    assert store.retrieve(1, "policy", k=1)[0][0] == "First bot policy."
    assert store.retrieve(2, "policy", k=1)[0][0] == "Second bot policy."


def test_clear_bot_removes_only_its_index():
    store = IndexStore(embeddings_factory=lambda: FakeEmbeddings())
    store.build_for_bot(1, ["First bot policy."])
    store.build_for_bot(2, ["Second bot policy."])

    store.clear_bot(1)

    assert not store.has_index(1)
    assert store.retrieve(1, "policy") == []
    assert store.has_index(2)


def test_build_requires_text_chunks():
    store = IndexStore(embeddings_factory=lambda: FakeEmbeddings())

    try:
        store.build_for_bot(1, [])
    except ValueError as error:
        assert str(error) == "No text chunks to index."
    else:
        raise AssertionError("Expected ValueError")
