import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'
import Poster from '../components/Poster'
import { Spinner } from '../components/Feedback'

export default function NewAndHot() {
  const { catalog } = useSession()
  if (!catalog) return <Spinner fullscreen />
  const items = [...catalog].sort(
    (a, b) => Number(b.isNew) - Number(a.isNew) || (a.trendingRank ?? 99) - (b.trendingRank ?? 99),
  )
  return (
    <main className="page">
      <h1 className="page__heading">New &amp; Hot</h1>
      <div className="feature-list">
        {items.map((s) => (
          <Link key={s.id} to={`/title/${s.id}`} className="feature">
            <Poster series={s} variant="wide" showTitle={false} />
            <div className="feature__body">
              <div className="feature__tags">
                {s.isNew && <span className="pill pill--red">New</span>}
                {s.trendingRank && <span className="pill">🔥 #{s.trendingRank} Trending</span>}
              </div>
              <h2>{s.title}</h2>
              <p>{s.synopsis}</p>
              <span className="muted small">
                {s.genres.join(' · ')} · {s.episodeCount} episodes
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
