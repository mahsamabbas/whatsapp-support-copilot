import { useEffect, useId, useRef, useState } from 'react'

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
  const listId = useId()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [hasKnowledge, setHasKnowledge] = useState<boolean | null>(null)
  const [docCount, setDocCount] = useState(0)
  const [isBotMenuOpen, setIsBotMenuOpen] = useState(false)

  const activeBot = bots.find((bot) => bot.id === activeBotId) ?? null
  const triggerLabel = activeBot?.name ?? (bots.length === 0 ? 'No bots yet' : 'Select a bot')

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

  useEffect(() => {
    if (!isBotMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsBotMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsBotMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isBotMenuOpen])

  useEffect(() => {
    setIsBotMenuOpen(false)
  }, [activeBotId, bots.length])

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
        <div className="bot-dropdown" ref={dropdownRef}>
          <button
            id="bot-selector"
            type="button"
            className={`bot-dropdown__trigger${isBotMenuOpen ? ' open' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={isBotMenuOpen}
            aria-controls={listId}
            disabled={bots.length === 0}
            onClick={() => setIsBotMenuOpen((open) => !open)}
          >
            <span className="bot-dropdown__label">{triggerLabel}</span>
            <span className="bot-dropdown__chevron" aria-hidden="true" />
          </button>

          {isBotMenuOpen && bots.length > 0 && (
            <ul id={listId} className="bot-dropdown__menu" role="listbox" aria-label="Active bot">
              {bots.map((bot) => {
                const selected = bot.id === activeBotId
                return (
                  <li key={bot.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`bot-dropdown__option${selected ? ' selected' : ''}`}
                      onClick={() => {
                        onBotChange(bot.id)
                        setIsBotMenuOpen(false)
                      }}
                    >
                      <span className="bot-dropdown__option-name">{bot.name}</span>
                      {selected && <span className="bot-dropdown__check" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

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
