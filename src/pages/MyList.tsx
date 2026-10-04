import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'
import SeriesCard from '../components/SeriesCard'
import { Spinner } from '../components/Feedback'

export default function MyList() {
  const { myList, catalog } = useSession()
  if (!catalog) return <Spinner fullscreen />
  const items = myList.map((id) => catalog.find((s) => s.id === id)).filter((s) => s !== undefined)

  return (
    <main className="page">
      <div className="container">
        <header className="browse__head">
          <h1>My List</h1>
          <p className="muted">Series you've saved to watch later.</p>
        </header>
        {items.length === 0 ? (
          <div className="empty-note">
            <p>Nothing saved yet. Tap “My List” on any series to keep it here.</p>
            <Link to="/browse" className="btn btn--glass btn--small">
              Browse series
            </Link>
          </div>
        ) : (
          <div className="card-grid">
            {items.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
