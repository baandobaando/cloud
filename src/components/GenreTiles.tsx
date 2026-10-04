import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { GENRES, type SeriesSummary } from '../../shared/types'

const BLURB: Record<string, string> = {
  'Billionaire Romance': 'Contracts, CEOs and secret marriages',
  Revenge: 'Betrayed, reborn and making them pay',
  'Werewolf & Fantasy': 'Alphas, dragons and destined mates',
  Mafia: 'Dons, deals and dangerous vows',
  'Hidden Identity': 'Nobody knows who they really are',
  'Family Secrets': 'Swapped, disowned and coming home',
}

const TINT: Record<string, [string, string]> = {
  'Billionaire Romance': ['#e8a54b', '#b8325a'],
  Revenge: ['#ff3b4e', '#7a0f24'],
  'Werewolf & Fantasy': ['#7c5cff', '#1f2a7a'],
  Mafia: ['#c2263b', '#2a0a10'],
  'Hidden Identity': ['#22b8a7', '#103a5c'],
  'Family Secrets': ['#ff8a3d', '#8a2a4a'],
}

/** Color-washed tiles for jumping straight into a genre. */
export default function GenreTiles({ catalog }: { catalog: SeriesSummary[] }) {
  return (
    <section className="shelf">
      <header className="shelf__head">
        <div>
          <h2 className="shelf__title">Browse by genre</h2>
          <p className="shelf__subtitle">Pick a mood and start watching</p>
        </div>
      </header>
      <div className="genre-tiles">
        {GENRES.map((g) => {
          const items = catalog.filter((s) => s.genres.includes(g))
          if (items.length === 0) return null
          const thumbs = items.filter((s) => s.posterUrl).slice(0, 3)
          return (
            <Link key={g} to={`/browse?genre=${encodeURIComponent(g)}`}
              className="genre-tile"
              style={{ '--g1': (TINT[g] ?? TINT.Revenge)[0], '--g2': (TINT[g] ?? TINT.Revenge)[1] } as CSSProperties}
            >
              <div className="genre-tile__text">
                <strong>{g}</strong>
                <span>{BLURB[g]}</span>
                <em>{items.length} series</em>
              </div>
              <div className="genre-tile__thumbs" aria-hidden>
                {thumbs.map((s) => (
                  <img key={s.id} src={s.posterUrl!} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                ))}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
