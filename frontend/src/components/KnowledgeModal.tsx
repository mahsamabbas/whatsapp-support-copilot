import { useEffect, useState } from 'react'

import {
  ApiError,
  listKnowledge,
  uploadKnowledge,
  type KnowledgeDocument,
} from '../lib/api'

interface KnowledgeModalProps {
  open: boolean
  botId: number | null
  botName: string | null
  onClose: () => void
  onKnowledgeChanged: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function KnowledgeModal({
  open,
  botId,
  botName,
  onClose,
  onKnowledgeChanged,
}: KnowledgeModalProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const selected = documents.find((doc) => doc.id === selectedId) ?? null

  useEffect(() => {
    if (!open || botId === null) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setFile(null)

    void listKnowledge(botId)
      .then((docs) => {
        if (cancelled) return
        setDocuments(docs)
        setSelectedId(docs[0]?.id ?? null)
      })
      .catch((requestError) => {
        if (cancelled) return
        setDocuments([])
        setSelectedId(null)
        setError(errorMessage(requestError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, botId])

  if (!open || botId === null) return null

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setError('Choose a .txt or .md knowledge file.')
      return
    }

    setError(null)
    setUploading(true)
    try {
      const created = await uploadKnowledge(botId, file)
      const docs = await listKnowledge(botId)
      setDocuments(docs)
      setSelectedId(created.id)
      setFile(null)
      onKnowledgeChanged()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="knowledge-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h2 id="knowledge-modal-title">Knowledge files</h2>
        <p className="bot-modal__intro">
          {botName
            ? `Docs indexed for ${botName}. Select a file to preview its full text.`
            : 'Docs indexed for this bot.'}
        </p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="knowledge-modal__body">
          <aside className="knowledge-modal__list" aria-label="Uploaded files">
            {loading ? (
              <p className="knowledge-modal__empty">Loading…</p>
            ) : documents.length === 0 ? (
              <p className="knowledge-modal__empty">No knowledge files yet.</p>
            ) : (
              <ul>
                {documents.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      className={`knowledge-file${doc.id === selectedId ? ' active' : ''}`}
                      onClick={() => setSelectedId(doc.id)}
                    >
                      <span className="knowledge-file__name">{doc.filename}</span>
                      <span className="knowledge-file__meta">
                        {doc.content_text.length.toLocaleString()} chars · {formatWhen(doc.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div className="knowledge-modal__preview" aria-live="polite">
            {selected ? (
              <>
                <div className="knowledge-preview__header">
                  <strong>{selected.filename}</strong>
                  <span>{selected.content_text.length.toLocaleString()} characters</span>
                </div>
                <pre className="knowledge-preview__content">{selected.content_text}</pre>
              </>
            ) : (
              <p className="knowledge-modal__empty">
                {loading ? 'Loading…' : 'Select a file to view its contents.'}
              </p>
            )}
          </div>
        </div>

        <form className="knowledge-modal__upload" onSubmit={handleUpload}>
          <label htmlFor="knowledge-view-file">Upload another file</label>
          <div className="knowledge-modal__upload-row">
            <input
              id="knowledge-view-file"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <button className="btn-primary" type="submit" disabled={uploading || !file}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
