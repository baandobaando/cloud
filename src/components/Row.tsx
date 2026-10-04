import { useRef } from 'react'
import { Link } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'
import Icon from './Icon'
import Poster from './Poster'

interface Props {
  title: string
  items: SeriesSummary[]
  ranked?: boolean
  showProgress?: boolean
}

export default function Row({ title, items, ranked, showProgress }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const { progress } = useSession()

  if (items.length === 0) return null

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section className="row">
      <div className="row__head">
        <h2 className="row__title">{title}</h2>
        <div className="row__nav">
          <button className="icon-btn icon-btn--ghost" onClick={() => scrollBy(-1)} aria-label={`Scroll ${title} left`}>
            <Icon name="left" />
          </button>
          <button className="icon-btn icon-btn--ghost" onClick={() => scrollBy(1)} aria-label={`Scroll ${title} right`}>
            <Icon name="right" />
          </button>
        </div>
      </div>
      <div className="row__scroller" ref={scroller}>
        {items.map((s, i) => {
          const p = progress[s.id]
          const pct = p ? Math.round((p.episodeNumber / Math.max(s.episodeCount, 1)) * 100) : 0
          const to = showProgress && p ? `/watch/${s.id}/${p.episodeNumber}` : `/title/${s.id}`
          return (
            <Link key={s.id} to={to} className={`card ${ranked ? 'card--ranked' : ''}`}>
              <Poster series={s} />
              {ranked && <span className="card__rank">{i + 1}</span>}
              {showProgress && p && (
                <div className="card__progress">
                  <div className="meter">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <span>Episode {p.episodeNumber}</span>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
