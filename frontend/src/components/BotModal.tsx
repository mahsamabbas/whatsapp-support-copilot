import { useState } from 'react'

import { ApiError, createBot, uploadKnowledge, type Bot } from '../lib/api'

interface BotModalProps {
  open: boolean
  onClose: () => void
  onBotCreated: (bot: Bot) => void
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}

export function BotModal({ open, onClose, onBotCreated }: BotModalProps) {
  const [name, setName] = useState('')
  const [bot, setBot] = useState<Bot | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const close = () => {
    setName('')
    setBot(null)
    setFile(null)
    setError(null)
    onClose()
  }

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Enter a bot name.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const createdBot = await createBot(trimmedName)
      setBot(createdBot)
      onBotCreated(createdBot)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!bot || !file) {
      setError('Choose a .txt or .md knowledge file.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await uploadKnowledge(bot.id, file)
      close()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="bot-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bot-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" type="button" aria-label="Close" onClick={close}>
          ×
        </button>
        <h2 id="bot-modal-title">{bot ? 'Add knowledge' : 'Create a bot'}</h2>
        <p className="bot-modal__intro">
          {bot
            ? `Upload a knowledge file for ${bot.name}. You can add more later.`
            : 'Name the support bot your team will use.'}
        </p>

        {bot ? (
          <form className="bot-modal__form" onSubmit={handleUpload}>
            <label htmlFor="knowledge-file">Knowledge file</label>
            <input
              id="knowledge-file"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" type="button" onClick={close}>
                Skip for now
              </button>
              <button className="btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Uploading…' : 'Upload knowledge'}
              </button>
            </div>
          </form>
        ) : (
          <form className="bot-modal__form" onSubmit={handleCreate}>
            <label htmlFor="bot-name">Bot name</label>
            <input
              id="bot-name"
              autoFocus
              value={name}
              maxLength={200}
              placeholder="Acme Support"
              onChange={(event) => setName(event.target.value)}
            />
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" type="button" onClick={close}>
                Cancel
              </button>
              <button className="btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create bot'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
