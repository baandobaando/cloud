import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../state/Session'

export default function Navbar() {
  const { me, activeProfile, selectProfile, logout } = useSession()
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
    <header className={`navbar ${scrolled ? 'navbar--solid' : ''}`}>
      <Link to="/" className="logo">
        REELFLIX
      </Link>
      <nav className="navbar__links">
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/new">New &amp; Hot</NavLink>
        <NavLink to="/my-list">My List</NavLink>
      </nav>
      <div className="navbar__right">
        <NavLink to="/search" className="icon-btn" aria-label="Search">
          🔍
        </NavLink>
        {me && !me.isEntitled && (
          <Link to="/plans" className="btn btn--small btn--red">
            Subscribe
          </Link>
        )}
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
              {me && me.profiles.length > 1 &&
                me.profiles
                  .filter((p) => p.id !== activeProfile?.id)
                  .map((p) => (
                    <button key={p.id} className="menu__item" onClick={() => { selectProfile(p.id); go('/') }}>
                      <span className="menu__swatch" style={{ background: p.color }}>{p.name[0]}</span>
                      {p.name}
                    </button>
                  ))}
              <button className="menu__item" onClick={() => { selectProfile(null); setMenuOpen(false) }}>
                Manage profiles
              </button>
              <button className="menu__item" onClick={() => go('/account')}>
                Account &amp; billing
              </button>
              {me?.isAdmin && (
                <button className="menu__item" onClick={() => go('/admin')}>
                  Admin panel
                </button>
              )}
              <hr />
              <button className="menu__item" onClick={() => { setMenuOpen(false); logout().then(() => navigate('/')) }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      <nav className="bottom-tabs">
        <NavLink to="/" end>
          <span>🏠</span>Home
        </NavLink>
        <NavLink to="/new">
          <span>🔥</span>New
        </NavLink>
        <NavLink to="/search">
          <span>🔍</span>Search
        </NavLink>
        <NavLink to="/my-list">
          <span>➕</span>My List
        </NavLink>
      </nav>
    </header>
  )
}
