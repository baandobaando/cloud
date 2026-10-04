import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'

interface Props {
  title: string
  subtitle?: string
  seeAll?: string
  children: ReactNode
  variant?: 'ranked'
}

/** A titled section with a single horizontally scrolling line of cards. */
export default function Shelf({ title, subtitle, seeAll, children, variant }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  return (
    <section className="shelf">
      <header className="shelf__head">
        <div>
          <h2 className="shelf__title">{title}</h2>
          {subtitle && <p className="shelf__subtitle">{subtitle}</p>}
        </div>
        <div className="shelf__actions">
          {seeAll && (
            <Link to={seeAll} className="shelf__all">
              See all
            </Link>
          )}
          <button className="icon-btn icon-btn--ghost shelf__arrow" onClick={() => scrollBy(-1)} aria-label={`Scroll ${title} left`}>
            <Icon name="left" size={18} />
          </button>
          <button className="icon-btn icon-btn--ghost shelf__arrow" onClick={() => scrollBy(1)} aria-label={`Scroll ${title} right`}>
            <Icon name="right" size={18} />
          </button>
        </div>
      </header>
      <div className={`shelf__track ${variant ? `shelf__track--${variant}` : ''}`} ref={scroller}>
        {children}
      </div>
    </section>
  )
}
