import { useEffect, useState } from 'react'

import { listKnowledge, type Bot } from '../lib/api'

interface TopBarProps {
  bots: Bot[]
  activeBotId: number | null
  knowledgeRevision: number
  onBotChange: (botId: number) => void
  onCreateBot: () => void
  onViewKnowledge: () => void
}

export function TopBar({
  bots,
  activeBotId,
  knowledgeRevision,
  onBotChange,
  onCreateBot,
  onViewKnowledge,
}: TopBarProps) {
  const [hasKnowledge, setHasKnowledge] = useState<boolean | null>(null)
  const [docCount, setDocCount] = useState(0)

  useEffect(() => {
    if (activeBotId === null) {
      setHasKnowledge(null)
      setDocCount(0)
      return
    }

    let cancelled = false
    setHasKnowledge(null)
    void listKnowledge(activeBotId)
      .then((documents) => {
        if (cancelled) return
        setHasKnowledge(documents.length > 0)
        setDocCount(documents.length)
      })
      .catch(() => {
        if (cancelled) return
        setHasKnowledge(false)
        setDocCount(0)
      })

    return () => {
      cancelled = true
    }
  }, [activeBotId, bots, knowledgeRevision])

  const knowledgeLabel =
    hasKnowledge === true
      ? docCount === 1
        ? '1 file · Ready'
        : `${docCount} files · Ready`
      : 'Needs docs'

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <h1 className="wordmark">
          Reply<em>Desk</em>
        </h1>
        <span className="topbar__tagline">WhatsApp support, one pane ahead</span>
      </div>

      <div className="topbar__controls">
        <label className="sr-only" htmlFor="bot-selector">
          Active bot
        </label>
        <select
          id="bot-selector"
          className="bot-selector"
          value={activeBotId ?? ''}
          onChange={(event) => onBotChange(Number(event.target.value))}
          disabled={bots.length === 0}
        >
          {bots.length === 0 ? (
            <option value="">No bots yet</option>
          ) : (
            bots.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))
          )}
        </select>
        {hasKnowledge !== null && (
          <button
            type="button"
            className={`knowledge-pill${hasKnowledge ? ' ready' : ''}${activeBotId === null ? '' : ' clickable'}`}
            onClick={onViewKnowledge}
            disabled={activeBotId === null}
            title="View knowledge files"
          >
            {knowledgeLabel}
          </button>
        )}
        <button
          className="btn-secondary btn-knowledge"
          type="button"
          onClick={onViewKnowledge}
          disabled={activeBotId === null}
        >
          Knowledge
        </button>
        <button className="btn-create-bot" type="button" onClick={onCreateBot}>
          Create bot
        </button>
      </div>
    </header>
  )
}
