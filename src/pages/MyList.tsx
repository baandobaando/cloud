import { Link } from 'react-router-dom'
import { getSeries } from '../data/catalog'
import { useAppState } from '../state/AppState'
import Poster from '../components/Poster'

export default function MyList() {
  const { myList } = useAppState()
  const items = myList.map(getSeries).filter((s) => s !== undefined)

  return (
    <main className="page">
      <h1 className="page__heading">My List</h1>
      {items.length === 0 ? (
        <p className="muted">Nothing saved yet. Tap “+ My List” on any series to keep it here.</p>
      ) : (
        <div className="grid">
          {items.map((s) => (
            <Link key={s.id} to={`/title/${s.id}`} className="card">
              <Poster series={s} />
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
