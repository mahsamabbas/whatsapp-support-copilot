class FakeEmbeddings:
    def embed_documents(self, texts):
        return [[float(len(text) % 7), 1.0, 0.0] for text in texts]

    def embed_query(self, text):
        return [float(len(text) % 7), 1.0, 0.0]
