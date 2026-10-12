import { useEffect, useRef, useState } from 'react'

import { BotModal } from './components/BotModal'
import { ChatPane } from './components/ChatPane'
import { DraftPanel, type DraftView } from './components/DraftPanel'
import { ThreadList, type ThreadWithRole } from './components/ThreadList'
import { TopBar } from './components/TopBar'
import {
  ApiError,
  approveDraft,
  createThread,
  escalateThread,
  generateDraft,
  getThread,
  listBots,
  listThreads,
  postMessage,
  type Bot,
  type Message,
  type ThreadDetail,
} from './lib/api'

type Pane = 'chats' | 'thread' | 'draft'

const AUTO_GENERATE_DEBOUNCE_MS = 650

function hydrateDraftView(thread: ThreadDetail): DraftView | null {
  const latest = thread.latest_draft
  if (!latest) return null

  let sources: string[] = []
  try {
    const parsed: unknown = JSON.parse(latest.sources_json)
    if (Array.isArray(parsed)) {
      sources = parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    sources = []
  }

  const escalated = thread.status === 'escalated'
  return {
    draftId: latest.id,
    body: latest.body,
    confidence: latest.confidence,
    sources,
    escalated,
    reason: escalated ? 'This conversation was escalated to a human agent.' : null,
  }
}

function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return 'No knowledge base is indexed for this bot yet — upload a policy document first.'
    }
    if (error.status === 503) {
      return 'The AI backend (Ollama) is unavailable right now. Please try again shortly.'
    }
    return error.message || `Request failed with status ${error.status}.`
  }
  return 'Something went wrong. Please try again.'
}

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
  const [draftView, setDraftView] = useState<DraftView | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [isApprovingDraft, setIsApprovingDraft] = useState(false)
  const [isEscalatingThread, setIsEscalatingThread] = useState(false)

  // Always reflects the *current* selected thread, independent of any
  // closures captured when an in-flight async request started. Async
  // handlers must compare against this ref (not the `selectedThreadId`
  // state value they closed over) before applying results, so a response
  // for a thread the user has since navigated away from is ignored instead
  // of clobbering the newly selected thread's state.
  const selectedThreadIdRef = useRef<number | null>(null)
  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId
  }, [selectedThreadId])

  // Monotonic id bumped on every new draft generation request/thread switch
  // so an older, still in-flight generateDraft call can tell it has been
  // superseded (by a newer request OR a thread switch) and must not touch
  // draftLoading/draftView/draftError.
  const draftRequestIdRef = useRef(0)

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

  const loadThread = async (threadId: number, isStale: () => boolean = () => false) => {
    const detail = await getThread(threadId)
    if (isStale()) return detail
    const lastRole = detail.messages.at(-1)?.role
    setSelectedThread(detail)
    setThreads((currentThreads) =>
      currentThreads.map((thread) =>
        thread.id === threadId ? { ...thread, last_role: lastRole } : thread,
      ),
    )
    return detail
  }

  const refreshThreadsList = async () => {
    if (activeBotId === null) return
    const refreshedThreads = await listThreads(activeBotId)
    setThreads((currentThreads) =>
      refreshedThreads.map((thread) => ({
        ...thread,
        last_role: currentThreads.find((current) => current.id === thread.id)?.last_role,
      })),
    )
  }

  useEffect(() => {
    if (selectedThreadId === null) return
    const threadId = selectedThreadId
    let cancelled = false
    setThreadError(null)
    setDraftError(null)
    setPulseGenerate(false)
    // Invalidate any in-flight draft request for the previous thread and
    // reset the loading flag immediately — otherwise, if that request's
    // `finally` happens to run after this switch, the newly selected
    // thread could be left stuck showing "Generating…" (or, conversely,
    // the old thread's result could flip loading back on for this thread).
    draftRequestIdRef.current += 1
    setDraftLoading(false)
    void loadThread(threadId, () => cancelled)
      .then((detail) => {
        if (!cancelled) setDraftView(hydrateDraftView(detail))
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedThread(null)
          setDraftView(null)
          setThreadError('Could not load this conversation.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedThreadId])

  useEffect(() => {
    if (flashThreadId === null) return
    const timer = window.setTimeout(() => setFlashThreadId(null), 1200)
    return () => window.clearTimeout(timer)
  }, [flashThreadId])

  const handleSelectThread = (threadId: number) => {
    setSelectedThreadId(threadId)
    setActivePane('thread')
  }

  const handleCreateThread = async (customerName: string) => {
    const botId = activeBotId
    if (botId === null) return

    setThreadError(null)
    try {
      const createdThread = await createThread(botId, customerName)
      const refreshedThreads = await listThreads(botId)
      setThreads((currentThreads) =>
        refreshedThreads.map((thread) => ({
          ...thread,
          last_role: currentThreads.find((current) => current.id === thread.id)?.last_role,
        })),
      )
      setSelectedThreadId(createdThread.id)
      setActivePane('thread')
    } catch (error) {
      setThreadError(describeApiError(error))
    }
  }

  const handleSend = async (role: Message['role'], body: string) => {
    const threadId = selectedThreadId
    if (threadId === null) return
    const isStale = () => threadId !== selectedThreadIdRef.current
    setIsSending(true)
    setThreadError(null)
    try {
      await postMessage(threadId, role, body)
      await loadThread(threadId, isStale)
      if (isStale()) return
      await refreshThreadsList()
      setFlashThreadId(threadId)
      if (role === 'customer') {
        setDraftError(null)
        setDraftView(null)
        setPulseGenerate(true)
      }
    } catch {
      if (!isStale()) setThreadError('Could not send the message. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  const handleGenerateDraft = async (threadId: number) => {
    setPulseGenerate(false)
    setDraftError(null)
    setDraftLoading(true)
    const requestId = ++draftRequestIdRef.current
    // Stale if the user switched threads since this request started, OR a
    // newer generateDraft request (e.g. Regenerate clicked again) has
    // superseded this one.
    const isStale = () =>
      threadId !== selectedThreadIdRef.current || requestId !== draftRequestIdRef.current
    try {
      const result = await generateDraft(threadId)
      if (isStale()) return
      setDraftView({
        draftId: result.draft_id,
        body: result.body,
        confidence: result.confidence,
        sources: result.sources,
        escalated: result.escalated,
        reason: result.reason,
      })
      await loadThread(threadId, isStale)
      if (isStale()) return
      await refreshThreadsList()
    } catch (error) {
      if (!isStale()) setDraftError(describeApiError(error))
    } finally {
      // Only the request that still owns the active thread+generation slot
      // may clear the loading flag — otherwise a stale request finishing
      // late could either leave the new thread stuck "Generating…" or
      // incorrectly flip loading back on for it.
      if (!isStale()) setDraftLoading(false)
    }
  }

  const handleApproveDraft = async (threadId: number, body: string) => {
    const isStale = () => threadId !== selectedThreadIdRef.current
    setDraftError(null)
    setIsApprovingDraft(true)
    try {
      await approveDraft(threadId, body)
      await loadThread(threadId, isStale)
      if (isStale()) return
      await refreshThreadsList()
      setDraftView(null)
    } catch (error) {
      if (!isStale()) setDraftError(describeApiError(error))
    } finally {
      setIsApprovingDraft(false)
    }
  }

  const handleEscalateDraft = async (threadId: number, reason?: string) => {
    const isStale = () => threadId !== selectedThreadIdRef.current
    setDraftError(null)
    setIsEscalatingThread(true)
    try {
      await escalateThread(threadId, reason)
      await loadThread(threadId, isStale)
      if (isStale()) return
      await refreshThreadsList()
      setDraftView((current) => ({
        draftId: current?.draftId ?? -1,
        body: current?.body ?? '',
        confidence: current?.confidence ?? 0,
        sources: current?.sources ?? [],
        escalated: true,
        reason: reason?.trim() ? reason.trim() : 'Escalated by agent.',
      }))
    } catch (error) {
      if (!isStale()) setDraftError(describeApiError(error))
    } finally {
      setIsEscalatingThread(false)
    }
  }

  // Prefer auto-generating a draft shortly after a new customer message
  // (set via pulseGenerate) instead of waiting for a manual click.
  useEffect(() => {
    if (!pulseGenerate || selectedThreadId === null || draftLoading) return
    const threadId = selectedThreadId
    const timer = window.setTimeout(() => {
      void handleGenerateDraft(threadId)
    }, AUTO_GENERATE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseGenerate, selectedThreadId, draftLoading])

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
          hasActiveBot={activeBotId !== null}
          onSelect={handleSelectThread}
          onCreate={handleCreateThread}
        />

        <ChatPane
          thread={selectedThread}
          threadSummary={selectedThreadSummary}
          isSending={isSending}
          active={activePane === 'thread'}
          onSend={handleSend}
        />

        <DraftPanel
          thread={selectedThread}
          draft={draftView}
          isGenerating={draftLoading}
          isApproving={isApprovingDraft}
          isEscalating={isEscalatingThread}
          error={draftError}
          pulseGenerate={pulseGenerate}
          active={activePane === 'draft'}
          onGenerate={() => {
            if (selectedThreadId !== null) void handleGenerateDraft(selectedThreadId)
          }}
          onApprove={(body) => {
            if (selectedThreadId !== null) void handleApproveDraft(selectedThreadId, body)
          }}
          onEscalate={(reason) => {
            if (selectedThreadId !== null) void handleEscalateDraft(selectedThreadId, reason)
          }}
        />
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
