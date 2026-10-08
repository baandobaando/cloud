import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_DEMO, api, errorMessage } from '../api'
import { DemoAdminHint } from '../demo/DemoHints'
import Logo from '../components/Logo'
import { useSession } from '../state/Session'
import { usePageTitle } from '../usePageTitle'

/** Only allow redirecting to paths on this site. */
export function safeNext(next: string | null): string {
  // "//x" and "/\\x" are read by browsers as other hosts.
  return next && /^\/(?![/\\])/.test(next) && !next.includes('\\') ? next : '/'
}

const OAUTH_ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  expired: 'That sign-in link expired. Please try again.',
  noemail: 'Your account did not share an email address, so we could not sign you in.',
  unavailable: 'That sign-in option is not available right now.',
  failed: 'Something went wrong signing you in. Please try again.',
}

/** Two columns: a wall of covers on the left (hidden on phones), the form card on the right. */
function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { catalog } = useSession()
  const covers = (catalog ?? []).filter((s) => s.posterUrl).slice(0, 12)
  return (
    <div className="auth auth--split">
      <aside className="auth__art" aria-hidden>
        <div className="auth__wall">
          {covers.map((s) => (
            <img key={s.id} src={s.posterUrl!} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          ))}
        </div>
        <div className="auth__art-copy">
          <Logo size="big" />
          <p>Binge-worthy drama, one short episode at a time.</p>
        </div>
      </aside>
      <main className="auth__main">
        <div className="auth__top">
          <Logo />
        </div>
        <div className="auth__card">
          <header className="auth__head">
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.15.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.88-1.28 1.24-2.52 1.26-2.59-.03-.01-2.41-.93-2.43-3.66zM14.1 5.85c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.23 2.68.23v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  )
}

type Providers = { google: boolean; apple: boolean; facebook?: boolean }

/** "Continue with Google / Apple / Facebook" buttons, shown only for providers the server has keys for. */
function SocialButtons({ next }: { next: string }) {
  const [providers, setProviders] = useState<Providers | null>(null)
  useEffect(() => {
    api.get<Providers>('/auth/providers').then(setProviders, () => setProviders({ google: false, apple: false }))
  }, [])
  if (!providers || (!providers.google && !providers.apple && !providers.facebook)) return null
  const href = (p: string) => `/api/auth/oauth/${p}/start?next=${encodeURIComponent(next)}`
  return (
    <>
      <div className="social">
        {providers.google && (
          <a className="social__btn social__btn--google" href={href('google')}>
            <GoogleIcon /> Continue with Google
          </a>
        )}
        {providers.apple && (
          <a className="social__btn social__btn--apple" href={href('apple')}>
            <AppleIcon /> Continue with Apple
          </a>
        )}
        {providers.facebook && (
          <a className="social__btn social__btn--facebook" href={href('facebook')}>
            <FacebookIcon /> Continue with Facebook
          </a>
        )}
      </div>
      <div className="auth__or">
        <span>or use email</span>
      </div>
    </>
  )
}

export function Login() {
  usePageTitle('Sign in')
  const { login } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(() => OAUTH_ERRORS[params.get('error') ?? ''] ?? null)
  const [busy, setBusy] = useState(false)
  const next = safeNext(params.get('next'))

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
    <AuthShell title="Welcome back" subtitle="Sign in to keep watching where you left off.">
      <SocialButtons next={next} />
      <form className="form" onSubmit={submit}>
        {error && <div className="form__error">{error}</div>}
        <input type="email" autoComplete="email" aria-label="Email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          autoComplete="current-password"
          aria-label="Password" placeholder="Password"
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
        New to BingeTube? <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="link">Sign up now.</Link>
      </p>
    </AuthShell>
  )
}

export function Signup() {
  usePageTitle('Create account')
  const { signup } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const next = safeNext(params.get('next'))
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
    <AuthShell title="Create your account" subtitle="Start with free episodes. No card needed.">
      <SocialButtons next={next} />
      <form className="form" onSubmit={submit}>
        {error && <div className="form__error">{error}</div>}
        <input aria-label="Your name" placeholder="Your name" autoComplete="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="email" autoComplete="email" aria-label="Email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          autoComplete="new-password"
          aria-label="Password" placeholder="Password (8+ characters)"
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
        Already have an account? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="link">Sign in.</Link>
      </p>
    </AuthShell>
  )
}

/** Signed-in users who land on /login or /signup go to where they were headed. */
export function AuthRedirect() {
  const [params] = useSearchParams()
  return <Navigate to={safeNext(params.get('next'))} replace />
}
