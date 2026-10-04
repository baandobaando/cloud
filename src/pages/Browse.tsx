import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GENRES } from '../../shared/types'
import { useSession } from '../state/Session'
import SeriesCard from '../components/SeriesCard'
import Icon from '../components/Icon'
import { Spinner } from '../components/Feedback'

type Sort = 'popular' | 'new' | 'az'
const PAGE = 24

/** One place to search, filter by genre and sort the whole catalog. */
export default function Browse() {
  const [params, setParams] = useSearchParams()
  const { catalog } = useSession()
  const [shown, setShown] = useState(PAGE)
  const q = params.get('q') ?? ''
  const genre = params.get('genre') ?? ''
  const sort = (params.get('sort') as Sort) || 'popular'

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
    setShown(PAGE)
  }

  if (!catalog) return <Spinner fullscreen />

  const needle = q.trim().toLowerCase()
  let results = catalog.filter(
    (s) =>
      (!genre || s.genres.includes(genre as (typeof GENRES)[number])) &&
      (!needle || [s.title, s.tagline, s.synopsis, ...s.genres].some((f) => f.toLowerCase().includes(needle))),
  )
  if (sort === 'popular') results = [...results].sort((a, b) => (a.trendingRank ?? 999) - (b.trendingRank ?? 999) || b.episodeCount - a.episodeCount)
  if (sort === 'az') results = [...results].sort((a, b) => a.title.localeCompare(b.title))
  // 'new' keeps the catalog's newest-first order

  return (
    <main className="page">
      <div className="container">
        <header className="browse__head">
          <h1>Browse</h1>
          <p className="muted">{catalog.length} series to binge. Search, pick a genre, or sort.</p>
        </header>
        <div className="browse__controls">
          <label className="search-field">
            <Icon name="search" size={18} />
            <input
              id="browse-search"
              type="search"
              placeholder="Search titles, genres, tropes…"
              value={q}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          <label className="select-field">
            <span className="muted small">Sort</span>
            <select id="browse-sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'popular' ? '' : e.target.value })}>
              <option value="popular">Popular</option>
              <option value="new">Newest</option>
              <option value="az">A–Z</option>
            </select>
          </label>
        </div>
        <div className="chips" role="group" aria-label="Genres">
          <button className={`chip ${!genre ? 'chip--on' : ''}`} onClick={() => update({ genre: '' })}>
            All
          </button>
          {GENRES.map((g) => (
            <button key={g} className={`chip ${genre === g ? 'chip--on' : ''}`} onClick={() => update({ genre: genre === g ? '' : g })}>
              {g}
            </button>
          ))}
        </div>
        <p className="browse__count muted small">
          {results.length} {results.length === 1 ? 'series' : 'series'}
          {genre && ` in ${genre}`}
          {needle && ` matching “${q}”`}
        </p>
        {results.length === 0 ? (
          <div className="empty-note">
            <p>Nothing matches yet.</p>
            <button className="btn btn--glass btn--small" onClick={() => update({ q: '', genre: '' })}>
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="card-grid">
              {results.slice(0, shown).map((s) => (
                <SeriesCard key={s.id} series={s} />
              ))}
            </div>
            {shown < results.length && (
              <div className="more">
                <button className="btn btn--glass" onClick={() => setShown((n) => n + PAGE)}>
                  Show more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
