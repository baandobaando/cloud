import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../components/Icon'

export function Kpi({ label, value, foot, tone, onClick }: { label: string; value: string; foot?: ReactNode; tone?: 'accent' | 'warn'; onClick?: () => void }) {
  const cls = `kpi ${tone === 'accent' ? 'kpi--accent' : tone === 'warn' ? 'kpi--warn' : ''} ${onClick ? 'kpi--button' : ''}`
  const body = (
    <>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{value}</div>
      {foot && <div className="kpi__foot muted">{foot}</div>}
    </>
  )
  return onClick ? (
    <button className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** "Showing 51–100 of 340" with previous / next. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  return (
    <div className="pager">
      <span className="muted small">
        {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(total, page * pageSize).toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="pager__btns">
        <button className="btn btn--secondary btn--small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="left" size={16} /> Previous
        </button>
        <span className="small">
          Page {page} of {pages}
        </span>
        <button className="btn btn--secondary btn--small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <Icon name="right" size={16} />
        </button>
      </div>
    </div>
  )
}

/** Side panel for details; closes on Escape or the backdrop, and keeps focus inside while open. */
export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab' && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus()
    }
  }, [])

  // Portalled to <body> so no transformed ancestor can trap the fixed overlay.
  return createPortal(
    <div className="side-panel" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="side-panel__panel" role="dialog" aria-modal="true" ref={panel} tabIndex={-1}>
        <header className="side-panel__head">
          <div className="side-panel__title">{title}</div>
          <button className="icon-btn icon-btn--ghost" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="side-panel__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export const money = (cents: number) => (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
export const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
export const dateTime = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Debounces a fast-changing value (e.g. a search box). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms, setV])
  return v
}
