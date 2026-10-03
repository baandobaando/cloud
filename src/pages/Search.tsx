import { Link, useSearchParams } from 'react-router-dom'
import { CATALOG, GENRES } from '../data/catalog'
import Poster from '../components/Poster'

export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const needle = q.trim().toLowerCase()

  const results = needle
    ? CATALOG.filter((s) =>
        [s.title, s.tagline, s.synopsis, ...s.genres].some((field) => field.toLowerCase().includes(needle)),
      )
    : CATALOG

  return (
    <main className="page">
      <input
        className="search-input"
        type="search"
        autoFocus
        placeholder="Search titles, genres, tropes…"
        value={q}
        onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
      />
      <div className="chips">
        {GENRES.map((g) => (
          <button key={g} className={`chip ${q === g ? 'chip--on' : ''}`} onClick={() => setParams(q === g ? {} : { q: g })}>
            {g}
          </button>
        ))}
      </div>
      {results.length === 0 ? (
        <p className="muted">No matches for “{q}”.</p>
      ) : (
        <div className="grid">
          {results.map((s) => (
            <Link key={s.id} to={`/title/${s.id}`} className="card">
              <Poster series={s} />
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
