import { useEffect, useState } from 'react'

import { BotModal } from './components/BotModal'
import { ChatPane } from './components/ChatPane'
import { ThreadList, type ThreadWithRole } from './components/ThreadList'
import { TopBar } from './components/TopBar'
import {
  getThread,
  listBots,
  listThreads,
  postMessage,
  type Bot,
  type Message,
  type ThreadDetail,
} from './lib/api'

type Pane = 'chats' | 'thread' | 'draft'

export default function App() {
  const [activePane, setActivePane] = useState<Pane>('thread')
  const [bots, setBots] = useState<Bot[]>([])
  const [activeBotId, setActiveBotId] = useState<number | null>(null)
  const [isBotModalOpen, setIsBotModalOpen] = useState(false)
  const [threads, setThreads] = useState<ThreadWithRole[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null)
  const [selectedThread, setSelectedThread] = useState<ThreadDetail | null>(null)
  const [flashThreadId, setFlashThreadId] = useState<number | null>(null)
  const [pulseGenerate, setPulseGenerate] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)

  const loadBots = async () => {
    try {
      const nextBots = await listBots()
      setBots(nextBots)
      setActiveBotId((currentBotId) =>
        currentBotId !== null && nextBots.some((bot) => bot.id === currentBotId)
          ? currentBotId
          : (nextBots[0]?.id ?? null),
      )
      if (nextBots.length === 0) setIsBotModalOpen(true)
    } catch {
      setBots([])
      setActiveBotId(null)
    }
  }

  useEffect(() => {
    void loadBots()
  }, [])

  useEffect(() => {
    if (activeBotId === null) {
      setThreads([])
      setSelectedThreadId(null)
      setSelectedThread(null)
      return
    }

    let cancelled = false
    setThreadError(null)
    void listThreads(activeBotId)
      .then((nextThreads) => {
        if (cancelled) return
        setThreads(nextThreads)
        setSelectedThreadId((currentThreadId) =>
          currentThreadId !== null && nextThreads.some((thread) => thread.id === currentThreadId)
            ? currentThreadId
            : (nextThreads[0]?.id ?? null),
        )
      })
      .catch(() => {
        if (!cancelled) {
          setThreads([])
          setSelectedThreadId(null)
          setSelectedThread(null)
          setThreadError('Could not load conversations.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeBotId])

  const loadThread = async (threadId: number) => {
    const detail = await getThread(threadId)
    const lastRole = detail.messages.at(-1)?.role
    setSelectedThread(detail)
    setThreads((currentThreads) =>
      currentThreads.map((thread) =>
        thread.id === threadId ? { ...thread, last_role: lastRole } : thread,
      ),
    )
    return detail
  }

  useEffect(() => {
    if (selectedThreadId === null) return
    let cancelled = false
    setThreadError(null)
    void loadThread(selectedThreadId).catch(() => {
      if (!cancelled) {
        setSelectedThread(null)
        setThreadError('Could not load this conversation.')
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedThreadId])

  const handleSelectThread = (threadId: number) => {
    setSelectedThreadId(threadId)
    setActivePane('thread')
  }

  const handleSend = async (role: Message['role'], body: string) => {
    if (selectedThreadId === null) return
    setIsSending(true)
    setThreadError(null)
    try {
      await postMessage(selectedThreadId, role, body)
      await loadThread(selectedThreadId)
      if (activeBotId !== null) {
        const refreshedThreads = await listThreads(activeBotId)
        setThreads((currentThreads) =>
          refreshedThreads.map((thread) => ({
            ...thread,
            last_role: currentThreads.find((current) => current.id === thread.id)?.last_role,
          })),
        )
      }
      setFlashThreadId(selectedThreadId)
      setPulseGenerate(true)
    } catch {
      setThreadError('Could not send the message. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  const selectedThreadSummary =
    threads.find((thread) => thread.id === selectedThreadId) ?? null

  return (
    <div className="app">
      <TopBar
        bots={bots}
        activeBotId={activeBotId}
        onBotChange={setActiveBotId}
        onCreateBot={() => setIsBotModalOpen(true)}
      />

      <div className="workspace">
        <ThreadList
          threads={threads}
          selectedThreadId={selectedThreadId}
          latestDraft={selectedThread?.latest_draft ?? null}
          flashThreadId={flashThreadId}
          active={activePane === 'chats'}
          onSelect={handleSelectThread}
        />

        <ChatPane
          thread={selectedThread}
          threadSummary={selectedThreadSummary}
          isSending={isSending}
          active={activePane === 'thread'}
          onSend={handleSend}
        />

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
            <button className={`btn-generate${pulseGenerate ? ' pulse-cta' : ''}`} type="button">
              ✦ Generate reply
            </button>
            <button className="btn-escalate" type="button">
              Escalate to human
            </button>
          </div>
        </section>
      </div>
      {threadError && (
        <p className="thread-error" role="alert">
          {threadError}
        </p>
      )}

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

      <BotModal
        open={isBotModalOpen}
        onClose={() => {
          setIsBotModalOpen(false)
          void loadBots()
        }}
        onBotCreated={(bot) => {
          setBots((currentBots) => [...currentBots, bot])
          setActiveBotId(bot.id)
        }}
      />
    </div>
  )
}
