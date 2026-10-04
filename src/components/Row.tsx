import { useRef } from 'react'
import { Link } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'
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
      <h2 className="row__title">{title}</h2>
      <div className="row__wrap">
        <button className="row__arrow row__arrow--left" onClick={() => scrollBy(-1)} aria-label="Scroll left">
          ‹
        </button>
        <div className="row__scroller" ref={scroller}>
          {items.map((s, i) => {
            const p = progress[s.id]
            const pct = p ? Math.round((p.episodeNumber / Math.max(s.episodeCount, 1)) * 100) : 0
            const to = showProgress && p ? `/watch/${s.id}/${p.episodeNumber}` : `/title/${s.id}`
            return (
              <Link key={s.id} to={to} className={`card ${ranked ? 'card--ranked' : ''}`}>
                {ranked && <span className="card__rank">{i + 1}</span>}
                <Poster series={s} />
                {showProgress && p && (
                  <div className="card__progress">
                    <div style={{ width: `${pct}%` }} />
                    <span>Ep {p.episodeNumber}</span>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
        <button className="row__arrow row__arrow--right" onClick={() => scrollBy(1)} aria-label="Scroll right">
          ›
        </button>
      </div>
    </section>
  )
}
