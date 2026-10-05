import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'
import Logo from './Logo'

/** Site footer with a link to every page. */
export default function Footer() {
  const { me } = useSession()
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <Logo />
          <p className="muted small">Short dramas, binge-sized. Every episode for $9.99 a month.</p>
        </div>
        <nav className="footer__cols" aria-label="Site">
          <div>
            <h3>Browse</h3>
            <Link to="/">Home</Link>
            <Link to="/browse">Browse &amp; search</Link>
            <Link to="/browse?sort=new">New releases</Link>
            <Link to="/my-list">My List</Link>
          </div>
          <div>
            <h3>Membership</h3>
            <Link to="/plans">Plans &amp; pricing</Link>
            {me ? <Link to="/account">Account &amp; billing</Link> : <Link to="/signup">Create account</Link>}
            {!me && <Link to="/login">Sign in</Link>}
            {!me && <Link to="/welcome">About BingeTube</Link>}
          </div>
          {me?.isAdmin && (
            <div>
              <h3>Admin</h3>
              <Link to="/admin">Dashboard</Link>
              <Link to="/admin/series">Series</Link>
              <Link to="/admin/orders">Orders</Link>
              <Link to="/admin/users">Users</Link>
            </div>
          )}
        </nav>
      </div>
      <p className="footer__legal muted small">
        © {year} BingeTube · <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> · <Link to="/support">Help</Link> · Secure payments by Stripe.
      </p>
    </footer>
  )
}
