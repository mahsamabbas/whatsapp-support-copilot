import { useEffect, useState } from 'react'

import { listKnowledge, type Bot } from '../lib/api'

interface TopBarProps {
  bots: Bot[]
  activeBotId: number | null
  onBotChange: (botId: number) => void
  onCreateBot: () => void
}

export function TopBar({ bots, activeBotId, onBotChange, onCreateBot }: TopBarProps) {
  const [hasKnowledge, setHasKnowledge] = useState<boolean | null>(null)

  useEffect(() => {
    if (activeBotId === null) {
      setHasKnowledge(null)
      return
    }

    let cancelled = false
    setHasKnowledge(null)
    void listKnowledge(activeBotId)
      .then((documents) => {
        if (!cancelled) setHasKnowledge(documents.length > 0)
      })
      .catch(() => {
        if (!cancelled) setHasKnowledge(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeBotId, bots])

  const knowledgeLabel = hasKnowledge ? 'Ready' : 'Needs docs'

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
        <span className={`knowledge-pill${hasKnowledge ? ' ready' : ''}`}>{knowledgeLabel}</span>
        <button className="btn-create-bot" type="button" onClick={onCreateBot}>
          Create bot
        </button>
      </div>
    </header>
  )
}
