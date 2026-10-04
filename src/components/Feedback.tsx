import type { ReactNode } from 'react'

export function Spinner({ fullscreen }: { fullscreen?: boolean }) {
  return (
    <div className={fullscreen ? 'spinner-wrap spinner-wrap--full' : 'spinner-wrap'} role="status" aria-label="Loading">
      <div className="spinner" />
    </div>
  )
}

export function ErrorState({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div className="error-state">
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn--white" onClick={onRetry}>
          Try again
        </button>
      )}
      {children}
    </div>
  )
}
