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
  const ranked = catalog.filter((s) => s.trendingRank).sort((a, b) => a.trendingRank! - b.trendingRank!)
  // Until an admin sets trending ranks, feature the biggest series rather than showing an empty row.
  const trending = ranked.length ? ranked : [...catalog].sort((a, b) => b.episodeCount - a.episodeCount).slice(0, 10)
  const fresh = catalog.filter((s) => s.isNew)
  const saved = myList.map((id) => byId.get(id)).filter((s) => s !== undefined)

  return (
    <main className="page page--home">
      <Hero series={trending[0] ?? catalog[0]} />
      <div className="rows">
        <RenewalBanner />
        <Row title="Continue Watching" items={continueWatching} showProgress />
        <Row title={ranked.length ? 'Top 10 today' : 'Featured'} items={trending.slice(0, 10)} ranked={ranked.length > 0} />
        <Row title="New releases" items={fresh} />
        <Row title="My List" items={saved} />
        {GENRES.map((g) => (
          <Row key={g} title={g} items={catalog.filter((s) => s.genres.includes(g))} />
        ))}
      </div>
    </main>
  )
}
