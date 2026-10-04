import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

interface PromptOptions extends ConfirmOptions {
  defaultValue?: string
  placeholder?: string
  /** If set, the confirm button stays disabled until the input matches exactly. */
  requireText?: string
}

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  prompt: (opts: PromptOptions) => Promise<string | null>
}

type Pending = { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void } | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }

const DialogContext = createContext<DialogApi | null>(null)

/** In-page replacement for window.confirm / window.prompt. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })),
    [],
  )
  const prompt = useCallback(
    (opts: PromptOptions) => new Promise<string | null>((resolve) => setPending({ kind: 'prompt', opts, resolve })),
    [],
  )

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {pending && <DialogView pending={pending} onDone={() => setPending(null)} />}
    </DialogContext.Provider>
  )
}

function DialogView({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const { opts } = pending
  const prompt = pending.kind === 'prompt' ? pending.opts : null
  const [value, setValue] = useState(prompt?.defaultValue ?? '')
  const confirmBtn = useRef<HTMLButtonElement>(null)

  const cancel = () => {
    if (pending.kind === 'confirm') pending.resolve(false)
    else pending.resolve(null)
    onDone()
  }
  const accept = () => {
    if (pending.kind === 'confirm') pending.resolve(true)
    else pending.resolve(value.trim())
    onDone()
  }

  useEffect(() => {
    if (pending.kind === 'confirm') confirmBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const blocked = prompt ? (prompt.requireText ? value.trim() !== prompt.requireText : !value.trim()) : false

  return (
    <div className="modal" onClick={cancel}>
      <form
        className="modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!blocked) accept()
        }}
      >
        <h2 id="dialog-title">{opts.title}</h2>
        {opts.message && <p className="modal__msg">{opts.message}</p>}
        {prompt && (
          <input
            id="dialog-input"
            className="input"
            autoFocus
            value={value}
            placeholder={prompt.placeholder ?? prompt.requireText}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--grey" onClick={cancel}>
            Cancel
          </button>
          <button ref={confirmBtn} className={`btn ${opts.danger ? 'btn--danger' : 'btn--red'}`} disabled={blocked}>
            {opts.confirmLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider')
  return ctx
}
