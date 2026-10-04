import { GENRES } from '../../shared/types'
import { useSession } from '../state/Session'
import Hero from '../components/Hero'
import Row from '../components/Row'
import { ErrorState, Spinner } from '../components/Feedback'
import RenewalBanner from '../components/RenewalBanner'

export default function Home() {
  const { catalog, catalogError, progress, myList } = useSession()

  if (catalogError && !catalog) return <ErrorState message={catalogError} onRetry={() => window.location.reload()} />
  if (!catalog) return <Spinner fullscreen />
  if (catalog.length === 0) {
    return <ErrorState message="No series have been published yet. Check back soon!" />
  }

  const byId = new Map(catalog.map((s) => [s.id, s]))
  const continueWatching = Object.entries(progress)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .map(([id]) => byId.get(id))
    .filter((s) => s !== undefined)
  const trending = catalog.filter((s) => s.trendingRank).sort((a, b) => a.trendingRank! - b.trendingRank!)
  const fresh = catalog.filter((s) => s.isNew)
  const saved = myList.map((id) => byId.get(id)).filter((s) => s !== undefined)

  return (
    <main className="page page--home">
      <Hero series={trending[0] ?? catalog[0]} />
      <div className="rows">
        <RenewalBanner />
        <Row title="Continue Watching" items={continueWatching} showProgress />
        <Row title="Top 10 today" items={trending.slice(0, 10)} ranked />
        <Row title="New releases" items={fresh} />
        <Row title="My List" items={saved} />
        {GENRES.map((g) => (
          <Row key={g} title={g} items={catalog.filter((s) => s.genres.includes(g))} />
        ))}
      </div>
    </main>
  )
}
