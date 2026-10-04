import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'
import Hero from '../components/Hero'
import Shelf from '../components/Shelf'
import SeriesCard from '../components/SeriesCard'
import GenreTiles from '../components/GenreTiles'
import { ErrorState, Spinner } from '../components/Feedback'
import RenewalBanner from '../components/RenewalBanner'

const SHELF_SIZE = 12
const GRID_PAGE = 18

export default function Home() {
  const { catalog, catalogError, progress, myList } = useSession()
  const [shown, setShown] = useState(GRID_PAGE)

  if (catalogError && !catalog) return <ErrorState message={catalogError} onRetry={() => window.location.reload()} />
  if (!catalog) return <Spinner fullscreen />
  if (catalog.length === 0) return <ErrorState message="No series have been published yet. Check back soon!" />

  const byId = new Map(catalog.map((s) => [s.id, s]))
  const continueWatching = Object.entries(progress)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .map(([id]) => byId.get(id))
    .filter((s) => s !== undefined)
  const ranked = catalog.filter((s) => s.trendingRank).sort((a, b) => a.trendingRank! - b.trendingRank!)
  const popular = ranked.length ? ranked : [...catalog].sort((a, b) => b.episodeCount - a.episodeCount)
  const featured = popular[0]
  const newest = catalog.slice(0, SHELF_SIZE) // the catalog arrives newest first
  const saved = myList.map((id) => byId.get(id)).filter((s) => s !== undefined)

  return (
    <main className="page page--home">
      <Hero series={featured} />
      <div className="container sections">
        <RenewalBanner />
        {continueWatching.length > 0 && (
          <Shelf title="Continue watching">
            {continueWatching.slice(0, SHELF_SIZE).map((s) => (
              <SeriesCard key={s.id} series={s} resume />
            ))}
          </Shelf>
        )}
        <Shelf title={ranked.length ? 'Top 10 today' : 'Popular right now'} subtitle="What everyone is binging" seeAll="/browse?sort=popular">
          {popular.slice(0, 10).map((s, i) => (
            <SeriesCard key={s.id} series={s} rank={ranked.length ? i + 1 : undefined} />
          ))}
        </Shelf>
        <Shelf title="New releases" subtitle="Fresh series added this week" seeAll="/browse?sort=new">
          {newest.map((s) => (
            <SeriesCard key={s.id} series={s} />
          ))}
        </Shelf>
        {saved.length > 0 && (
          <Shelf title="My List" seeAll="/my-list">
            {saved.slice(0, SHELF_SIZE).map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </Shelf>
        )}
        <GenreTiles catalog={catalog} />
        <section className="shelf">
          <header className="shelf__head">
            <div>
              <h2 className="shelf__title">All series</h2>
              <p className="shelf__subtitle">{catalog.length} series, every episode included with membership</p>
            </div>
            <div className="shelf__actions">
              <Link to="/browse" className="shelf__all">
                Browse & filter
              </Link>
            </div>
          </header>
          <div className="card-grid">
            {catalog.slice(0, shown).map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
          {shown < catalog.length && (
            <div className="more">
              <button className="btn btn--glass" onClick={() => setShown((n) => n + GRID_PAGE)}>
                Show more
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
