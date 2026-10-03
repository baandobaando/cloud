import { CATALOG, GENRES } from '../data/catalog'
import { useAppState } from '../state/AppState'
import Hero from '../components/Hero'
import Row from '../components/Row'

export default function Home() {
  const { progress, myList } = useAppState()

  const continueWatching = Object.entries(progress)
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
    .map(([id]) => CATALOG.find((s) => s.id === id))
    .filter((s) => s !== undefined)

  const trending = CATALOG.filter((s) => s.trendingRank).sort((a, b) => a.trendingRank! - b.trendingRank!)
  const fresh = CATALOG.filter((s) => s.isNew)
  const saved = myList.map((id) => CATALOG.find((s) => s.id === id)).filter((s) => s !== undefined)

  return (
    <main className="page page--home">
      <Hero series={trending[0] ?? CATALOG[0]} />
      <div className="rows">
        <Row title="Continue Watching" items={continueWatching} showProgress />
        <Row title="Top 5 Today" items={trending} ranked />
        <Row title="New Releases" items={fresh} />
        <Row title="My List" items={saved} />
        {GENRES.map((g) => (
          <Row key={g} title={g} items={CATALOG.filter((s) => s.genres.includes(g))} />
        ))}
      </div>
    </main>
  )
}
