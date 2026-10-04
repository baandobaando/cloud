import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_DEMO, errorMessage } from '../api'
import { DemoAdminHint } from '../demo/DemoHints'
import Logo from '../components/Logo'
import { useSession } from '../state/Session'

/** Only allow redirecting to paths on this site. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth">
      <header className="landing__nav">
        <Logo />
      </header>
      <div className="auth__card">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}

export function Login() {
  const { login } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Welcome back">
      <form className="form" onSubmit={submit}>
        {error && <div className="form__error">{error}</div>}
        <input type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn--accent btn--block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {IS_DEMO && <DemoAdminHint onUse={(e, p) => { setEmail(e); setPassword(p) }} />}
      <p className="muted">
        New to ReelFlix? <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="link">Sign up now.</Link>
      </p>
    </AuthShell>
  )
}

export function Signup() {
  const { signup } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signup(email, password, name || email.split('@')[0])
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create your account">
      <form className="form" onSubmit={submit}>
        {error && <div className="form__error">{error}</div>}
        <input placeholder="Your name" autoComplete="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Password (8+ characters)"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn--accent btn--block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link to="/login" className="link">Sign in.</Link>
      </p>
    </AuthShell>
  )
}

/** Signed-in users who land on /login or /signup go to where they were headed. */
export function AuthRedirect() {
  const [params] = useSearchParams()
  return <Navigate to={safeNext(params.get('next'))} replace />
}
