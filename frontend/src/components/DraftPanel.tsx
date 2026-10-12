import { useEffect, useState } from 'react'

import type { ThreadDetail } from '../lib/api'

export interface DraftView {
  draftId: number
  body: string
  confidence: number
  sources: string[]
  escalated: boolean
  reason: string | null
}

interface DraftPanelProps {
  thread: ThreadDetail | null
  draft: DraftView | null
  isGenerating: boolean
  isApproving: boolean
  isEscalating: boolean
  error: string | null
  pulseGenerate: boolean
  active: boolean
  onGenerate: () => void
  onApprove: (body: string) => void
  onEscalate: (reason?: string) => void
}

export function DraftPanel({
  thread,
  draft,
  isGenerating,
  isApproving,
  isEscalating,
  error,
  pulseGenerate,
  active,
  onGenerate,
  onApprove,
  onEscalate,
}: DraftPanelProps) {
  const [body, setBody] = useState(draft?.body ?? '')

  // Reset the editable textarea whenever a new draft arrives, without
  // clobbering in-progress edits on re-renders of the same draft.
  useEffect(() => {
    setBody(draft?.body ?? '')
  }, [draft?.draftId, draft?.body])

  if (!thread) {
    return (
      <section className="pane pane-draft" data-active={active}>
        <div className="draft-header">
          <h2 className="draft-title">Copilot</h2>
          <p className="draft-sub">Grounded suggestions for this conversation</p>
        </div>
        <div className="draft-empty">Select a conversation to draft a reply.</div>
      </section>
    )
  }

  const busy = isGenerating || isApproving || isEscalating
  const hasDraft = draft !== null
  const confidencePct = draft ? Math.round(draft.confidence * 100) : 0
  const canApprove = hasDraft && body.trim().length > 0 && !busy
  const showEditor = hasDraft && (!draft.escalated || draft.body.length > 0)

  const handleEscalateClick = () => {
    const input = window.prompt('Reason for escalating (optional):', '')
    if (input === null) return
    onEscalate(input.trim() || undefined)
  }

  return (
    <section className="pane pane-draft" data-active={active}>
      <div className="draft-header">
        <h2 className="draft-title">Copilot</h2>
        <p className="draft-sub">Grounded suggestions for this conversation</p>
      </div>

      <div className="draft-body">
        {error && (
          <p className="draft-error" role="alert">
            {error}
          </p>
        )}

        {isGenerating && (
          <div>
            <p className="draft-section-label">Generating next draft</p>
            <div className="shimmer-stack" style={{ marginTop: '0.4rem' }}>
              <div className="shimmer w-full" />
              <div className="shimmer w-80" />
              <div className="shimmer w-60" />
            </div>
          </div>
        )}

        {!isGenerating && draft?.escalated && (
          <div className="draft-reason badge-in">
            <p className="draft-reason__label">Escalated to a human</p>
            <p className="draft-reason__text">
              {draft.reason ?? 'This conversation needs a person to take over.'}
            </p>
          </div>
        )}

        {!isGenerating && showEditor && (
          <>
            <div className="confidence">
              <div className="confidence__row">
                <span>Confidence</span>
                <strong>{confidencePct}%</strong>
              </div>
              <div className="confidence__bar">
                <div className="confidence__fill" style={{ width: `${confidencePct}%` }} />
              </div>
            </div>

            {draft.sources.length > 0 && (
              <div>
                <p className="draft-section-label">Grounded in</p>
                <ul className="source-list">
                  {draft.sources.map((source, index) => (
                    <li key={`${draft.draftId}-${index}`} className="source-item">
                      {source}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="draft-section-label">Suggested reply</p>
              <textarea
                className="draft-textarea"
                value={body}
                disabled={busy}
                rows={6}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
          </>
        )}

        {!isGenerating && !hasDraft && !error && (
          <div className="draft-empty">
            {thread.status === 'resolved'
              ? 'Reply sent. A new draft will appear after the next customer message.'
              : 'No draft yet — generate a grounded reply for this conversation.'}
          </div>
        )}
      </div>

      <div className="draft-actions">
        <button
          className={`btn-generate${pulseGenerate && !busy ? ' pulse-cta' : ''}`}
          type="button"
          disabled={busy}
          onClick={onGenerate}
        >
          {isGenerating ? 'Generating…' : hasDraft ? '↻ Regenerate' : '✦ Generate reply'}
        </button>
        {showEditor && (
          <button
            className="btn-approve"
            type="button"
            disabled={!canApprove}
            onClick={() => onApprove(body.trim())}
          >
            {isApproving ? 'Sending…' : 'Approve & send'}
          </button>
        )}
        <button
          className="btn-escalate"
          type="button"
          disabled={busy}
          onClick={handleEscalateClick}
        >
          {isEscalating ? 'Escalating…' : 'Escalate to human'}
        </button>
      </div>
    </section>
  )
}
