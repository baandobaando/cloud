import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAppState } from '../state/AppState'

export default function Navbar() {
  const { activeProfile, selectProfile, plan } = useAppState()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
        {!plan && (
          <Link to="/plans" className="btn btn--small btn--red">
            Subscribe
          </Link>
        )}
        {activeProfile && (
          <button
            className="avatar"
            style={{ background: activeProfile.color }}
            title="Switch profile"
            onClick={() => selectProfile(null)}
          >
            {activeProfile.name[0]}
          </button>
        )}
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
