import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'
import Poster from '../components/Poster'
import { Spinner } from '../components/Feedback'

export default function MyList() {
  const { myList, catalog } = useSession()
  if (!catalog) return <Spinner fullscreen />
  const items = myList.map((id) => catalog.find((s) => s.id === id)).filter((s) => s !== undefined)

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
