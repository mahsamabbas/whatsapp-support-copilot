import { useState } from 'react'

import { threadBadge } from '../lib/badges'
import type { Message, ThreadDetail } from '../lib/api'
import type { ThreadWithRole } from './ThreadList'

interface ChatPaneProps {
  thread: ThreadDetail | null
  threadSummary: ThreadWithRole | null
  isSending: boolean
  active: boolean
  onSend: (role: Message['role'], body: string) => Promise<void>
}

const badgeLabels = {
  needs_draft: 'Needs draft',
  escalated: 'Escalated',
  replied: 'Replied',
  open: 'Open',
}

function messageTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function ChatPane({ thread, threadSummary, isSending, active, onSend }: ChatPaneProps) {
  const [role, setRole] = useState<Message['role']>('customer')
  const [body, setBody] = useState('')

  if (!thread || !threadSummary) {
    return (
      <section className="pane pane-thread" data-active={active}>
        <div className="chat-empty">Select a conversation to view its messages.</div>
      </section>
    )
  }

  const badge = threadBadge(threadSummary, thread.latest_draft)
  const canSend = role === 'customer' && body.trim().length > 0 && !isSending

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSend) return
    await onSend(role, body.trim())
    setBody('')
  }

  return (
    <section className="pane pane-thread" data-active={active}>
      <header className="thread-header">
        <div className="thread-header__who">
          <div className="thread-avatar">{thread.customer_name.charAt(0)}</div>
          <div className="thread-header__meta">
            <p className="thread-header__name">{thread.customer_name}</p>
            <p className="thread-header__sub">WhatsApp conversation</p>
          </div>
        </div>
        <div className="thread-header__actions">
          <span className={`chip ${badge} badge-in`}>{badgeLabels[badge]}</span>
        </div>
      </header>

      <div className="chat-wallpaper">
        <div className="message-list">
          <span className="msg-day">Messages</span>
          {thread.messages.map((message) => (
            <div key={message.id} className={`bubble ${message.role}`}>
              <p className="bubble__text">{message.body}</p>
              <span className="bubble__time">{messageTime(message.created_at)}</span>
            </div>
          ))}
        </div>
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <div className="role-toggle" aria-label="Message sender">
          {(['customer', 'agent'] as const).map((option) => (
            <button
              key={option}
              className={`role-toggle__option${role === option ? ' active' : ''}`}
              type="button"
              onClick={() => setRole(option)}
            >
              {option === 'customer' ? 'Customer' : 'Agent'}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={body}
          placeholder={role === 'customer' ? 'Type a customer message…' : 'Agent messages are disabled'}
          disabled={role !== 'customer' || isSending}
          onChange={(event) => setBody(event.target.value)}
        />
        <button className="composer__send" type="submit" disabled={!canSend} aria-label="Send">
          ➤
        </button>
      </form>
    </section>
  )
}
