import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../state/Session'
import Icon from './Icon'
import Logo from './Logo'

export default function Navbar() {
  const { me, activeProfile, logout } = useSession()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const go = (to: string) => {
    setMenuOpen(false)
    navigate(to)
  }

  return (
    <>
      <header className={`navbar ${scrolled ? 'navbar--solid' : ''}`}>
        <Logo />
        <nav className="navbar__links">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/browse">Browse</NavLink>
          <NavLink to="/my-list">My List</NavLink>
        </nav>
        <div className="navbar__right">
          <NavLink to="/browse" className="icon-btn icon-btn--ghost navbar__search" aria-label="Search">
            <Icon name="search" />
          </NavLink>
          {!me && (
            <Link to="/login" className="btn btn--small btn--glass">
              Sign in
            </Link>
          )}
          {(!me || !me.isEntitled) && (
            <Link to={me ? '/plans' : '/signup?next=/plans'} className="btn btn--small btn--accent">
              <span>
                Join<span className="hide-phone"> for $9.99</span>
              </span>
            </Link>
          )}
          {me && (
            <div className="menu" ref={menuRef}>
              <button
                className="avatar"
                style={{ background: activeProfile?.color ?? '#3f3f46' }}
                aria-label="Account menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                {(activeProfile?.name ?? me?.name ?? '?')[0]}
              </button>
              {menuOpen && (
                <div className="menu__panel">
                  <button className="menu__item" onClick={() => go('/account')}>
                    <Icon name="user" size={18} /> Account &amp; membership
                  </button>
                  {me?.isAdmin && (
                    <button className="menu__item" onClick={() => go('/admin')}>
                      <Icon name="settings" size={18} /> Admin panel
                    </button>
                  )}
                  <hr />
                  <button
                    className="menu__item"
                    onClick={() => {
                      setMenuOpen(false)
                      logout().then(() => navigate('/'))
                    }}
                  >
                    <Icon name="logout" size={18} /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      {/* Outside the header: its backdrop-filter would otherwise pin these "fixed" tabs to the header on scroll. */}
      <nav className="bottom-tabs">
        <NavLink to="/" end>
          <Icon name="home" />
          Home
        </NavLink>
        <NavLink to="/browse">
          <Icon name="search" />
          Browse
        </NavLink>
        <NavLink to="/my-list">
          <Icon name="bookmark" />
          My List
        </NavLink>
      </nav>
    </>
  )
}
