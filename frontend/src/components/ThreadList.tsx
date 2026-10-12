import { threadBadge } from '../lib/badges'
import type { Draft, Thread } from '../lib/api'

export type ThreadWithRole = Thread & {
  last_role?: 'customer' | 'agent'
}

interface ThreadListProps {
  threads: ThreadWithRole[]
  selectedThreadId: number | null
  latestDraft: Draft | null
  flashThreadId: number | null
  active: boolean
  hasActiveBot: boolean
  onSelect: (threadId: number) => void
}

const badgeLabels = {
  needs_draft: 'Needs draft',
  escalated: 'Escalated',
  replied: 'Replied',
  open: 'Open',
}

function timestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function ThreadList({
  threads,
  selectedThreadId,
  latestDraft,
  flashThreadId,
  active,
  hasActiveBot,
  onSelect,
}: ThreadListProps) {
  return (
    <section className="pane pane-threads" data-active={active}>
      <div className="pane-threads__header">
        <h2 className="pane-threads__title">Chats</h2>
        <input className="thread-search" type="text" placeholder="Search conversations" disabled />
      </div>
      <nav className="thread-list" aria-label="Conversations">
        {threads.map((thread) => {
          const draft = selectedThreadId === thread.id ? latestDraft : null
          const badge = threadBadge(thread, draft)
          return (
            <button
              key={thread.id}
              className={`thread-row${selectedThreadId === thread.id ? ' active' : ''}${
                flashThreadId === thread.id ? ' flash-row' : ''
              }`}
              type="button"
              onClick={() => onSelect(thread.id)}
            >
              <div className="thread-avatar">{thread.customer_name.charAt(0)}</div>
              <div className="thread-main">
                <div className="thread-row__top">
                  <p className="thread-name">{thread.customer_name}</p>
                  <span className="thread-time">{timestamp(thread.updated_at)}</span>
                </div>
                <p className="thread-preview">{thread.last_message_preview ?? 'No messages yet'}</p>
                <div className="thread-row__bottom">
                  <span className={`chip ${badge}${badge === 'escalated' ? ' badge-in' : ''}`}>
                    {badgeLabels[badge]}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
        {threads.length === 0 && (
          <p className="thread-list__empty">
            {hasActiveBot
              ? 'No conversations yet. Customer messages will appear here.'
              : 'No bot selected. Create a bot to start helping customers.'}
          </p>
        )}
      </nav>
    </section>
  )
}
