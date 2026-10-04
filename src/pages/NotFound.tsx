import { Link } from 'react-router-dom'
import { usePageTitle } from '../usePageTitle'

export default function NotFound() {
  usePageTitle('Page not found')
  return (
    <main className="page notfound">
      <span className="notfound__code">404</span>
      <h1>This page doesn't exist</h1>
      <p className="muted">The link may be broken, or the series may have been removed.</p>
      <div className="actions">
        <Link to="/" className="btn btn--primary">
          Go home
        </Link>
        <Link to="/browse" className="btn btn--glass">
          Browse series
        </Link>
      </div>
    </main>
  )
}
