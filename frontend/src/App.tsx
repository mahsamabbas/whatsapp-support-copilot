import { useState } from 'react'

type Pane = 'chats' | 'thread' | 'draft'

interface ThreadPreview {
  id: string
  name: string
  preview: string
  time: string
  unread: number
  status: 'open' | 'escalated'
  active?: boolean
  justUpdated?: boolean
}

interface Message {
  id: string
  from: 'customer' | 'agent'
  text: string
  time: string
}

const THREADS: ThreadPreview[] = [
  {
    id: 't1',
    name: 'Amara Chen',
    preview: 'My order #4821 still shows "processing" after 5 days…',
    time: '2m',
    unread: 2,
    status: 'escalated',
    active: true,
    justUpdated: true,
  },
  {
    id: 't2',
    name: 'Diego Fernandez',
    preview: 'Thank you! That solved it 🙌',
    time: '14m',
    unread: 0,
    status: 'open',
  },
  {
    id: 't3',
    name: 'Priya Nair',
    preview: 'Can I get a refund instead of a replacement?',
    time: '41m',
    unread: 1,
    status: 'open',
  },
  {
    id: 't4',
    name: 'Jonas Weber',
    preview: 'Is the warranty international?',
    time: '1h',
    unread: 0,
    status: 'open',
  },
  {
    id: 't5',
    name: 'Grace Okafor',
    preview: "Still waiting on a reply from yesterday's chat.",
    time: '3h',
    unread: 0,
    status: 'open',
  },
]

const MESSAGES: Message[] = [
  { id: 'm1', from: 'customer', text: 'Hi! My order #4821 still shows "processing" after 5 days.', time: '09:12' },
  { id: 'm2', from: 'customer', text: 'Can someone check what is going on? It was supposed to ship already.', time: '09:12' },
  { id: 'm3', from: 'agent', text: "Hi Amara, thanks for flagging this — let me pull up order #4821 right now.", time: '09:14' },
  { id: 'm4', from: 'customer', text: 'Appreciate it, this is a gift so timing matters 🙏', time: '09:15' },
]

export default function App() {
  const [activePane, setActivePane] = useState<Pane>('thread')

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <h1 className="wordmark">
            Reply<em>Desk</em>
          </h1>
          <span className="topbar__tagline">WhatsApp support, one pane ahead</span>
        </div>
        <div className="topbar__status">
          <span className="status-dot" aria-hidden="true" />
          Connected
        </div>
      </header>

      <div className="workspace">
        {/* Left pane — thread list */}
        <section className="pane pane-threads" data-active={activePane === 'chats'}>
          <div className="pane-threads__header">
            <h2 className="pane-threads__title">Chats</h2>
            <input className="thread-search" type="text" placeholder="Search conversations" disabled />
          </div>
          <nav className="thread-list">
            {THREADS.map((thread) => (
              <div
                key={thread.id}
                className={`thread-row${thread.active ? ' active' : ''}${thread.justUpdated ? ' flash-row' : ''}`}
              >
                <div className="thread-avatar">{thread.name.charAt(0)}</div>
                <div className="thread-main">
                  <div className="thread-row__top">
                    <p className="thread-name">{thread.name}</p>
                    <span className="thread-time">{thread.time}</span>
                  </div>
                  <p className="thread-preview">{thread.preview}</p>
                  <div className="thread-row__bottom">
                    <span className={`chip ${thread.status}`}>
                      {thread.status === 'escalated' ? 'Escalated' : 'Open'}
                    </span>
                    {thread.unread > 0 && <span className="unread-badge">{thread.unread}</span>}
                  </div>
                </div>
              </div>
            ))}
          </nav>
        </section>

        {/* Center pane — active thread */}
        <section className="pane pane-thread" data-active={activePane === 'thread'}>
          <div className="thread-header">
            <div className="thread-header__who">
              <div className="thread-avatar">A</div>
              <div className="thread-header__meta">
                <p className="thread-header__name">Amara Chen</p>
                <p className="thread-header__sub">+1 (415) 555-0138 · last seen 2m ago</p>
              </div>
            </div>
            <div className="thread-header__actions">
              <span className="chip escalated badge-in">Escalated</span>
            </div>
          </div>

          <div className="chat-wallpaper">
            <div className="message-list">
              <span className="msg-day">Today</span>
              {MESSAGES.map((message) => (
                <div key={message.id} className={`bubble ${message.from}`}>
                  <p className="bubble__text">{message.text}</p>
                  <span className="bubble__time">{message.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="composer">
            <input type="text" placeholder="Type a message… (wiring in Task 9)" disabled />
            <button className="composer__send" type="button" disabled aria-label="Send">
              ➤
            </button>
          </div>
        </section>

        {/* Right pane — copilot draft panel */}
        <section className="pane pane-draft" data-active={activePane === 'draft'}>
          <div className="draft-header">
            <h2 className="draft-title">Copilot</h2>
            <p className="draft-sub">Grounded suggestions for this conversation</p>
          </div>

          <div className="draft-body">
            <div className="confidence">
              <div className="confidence__row">
                <span>Confidence</span>
                <strong>86%</strong>
              </div>
              <div className="confidence__bar">
                <div className="confidence__fill" style={{ width: '86%' }} />
              </div>
            </div>

            <div>
              <p className="draft-section-label">Suggested reply</p>
              <div className="suggested-reply" style={{ marginTop: '0.4rem' }}>
                <p className="suggested-reply__label">Grounded in Order Policy FAQ</p>
                <p className="suggested-reply__text">
                  Thanks for your patience, Amara — I can see order #4821 is still in our fulfillment
                  queue. I've escalated it for same-day dispatch and will send tracking the moment it
                  ships.
                </p>
              </div>
            </div>

            <div>
              <p className="draft-section-label">Generating next draft</p>
              <div className="shimmer-stack" style={{ marginTop: '0.4rem' }}>
                <div className="shimmer w-full" />
                <div className="shimmer w-80" />
                <div className="shimmer w-60" />
              </div>
            </div>
          </div>

          <div className="draft-actions">
            <button className="btn-generate pulse-cta" type="button">
              ✦ Generate reply
            </button>
            <button className="btn-escalate" type="button">
              Escalate to human
            </button>
          </div>
        </section>
      </div>

      <nav className="tabbar">
        {(['chats', 'thread', 'draft'] as Pane[]).map((pane) => (
          <button
            key={pane}
            type="button"
            className={`tabbar__btn${activePane === pane ? ' active' : ''}`}
            onClick={() => setActivePane(pane)}
          >
            {pane === 'chats' ? 'Chats' : pane === 'thread' ? 'Thread' : 'Draft'}
          </button>
        ))}
      </nav>
    </div>
  )
}
