import { useEffect, useId, useState } from 'react'

interface PromptModalProps {
  open: boolean
  title: string
  description?: string
  label: string
  placeholder?: string
  submitLabel: string
  cancelLabel?: string
  required?: boolean
  multiline?: boolean
  initialValue?: string
  onClose: () => void
  onSubmit: (value: string) => void
}

export function PromptModal({
  open,
  title,
  description,
  label,
  placeholder,
  submitLabel,
  cancelLabel = 'Cancel',
  required = false,
  multiline = false,
  initialValue = '',
  onClose,
  onSubmit,
}: PromptModalProps) {
  const fieldId = useId()
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setError(null)
  }, [open, initialValue])

  if (!open) return null

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (required && !trimmed) {
      setError('This field is required.')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h2 id={`${fieldId}-title`}>{title}</h2>
        {description && <p className="bot-modal__intro">{description}</p>}

        <form className="bot-modal__form" onSubmit={handleSubmit}>
          <label htmlFor={fieldId}>{label}</label>
          {multiline ? (
            <textarea
              id={fieldId}
              className="prompt-modal__textarea"
              autoFocus
              rows={4}
              value={value}
              placeholder={placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : (
            <input
              id={fieldId}
              type="text"
              autoFocus
              value={value}
              maxLength={200}
              placeholder={placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose}>
              {cancelLabel}
            </button>
            <button className="btn-primary" type="submit">
              {submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
