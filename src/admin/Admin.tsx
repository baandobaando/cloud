import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom'
import { useSession } from '../state/Session'
import Dashboard from './Dashboard'
import SeriesList from './SeriesList'
import SeriesEditor from './SeriesEditor'
import Users from './Users'
import Orders from './Orders'
import './admin.css'

export default function Admin() {
  const { me } = useSession()
  return (
    <div className="admin">
      <aside className="admin__side">
        <Link to="/admin" className="logo">
          REELFLIX <span className="admin__tag">Admin</span>
        </Link>
        <nav>
          <NavLink to="/admin" end>📊 Dashboard</NavLink>
          <NavLink to="/admin/series">🎬 Series</NavLink>
          <NavLink to="/admin/orders">🪙 Orders</NavLink>
          <NavLink to="/admin/users">👥 Users</NavLink>
        </nav>
        <div className="admin__foot">
          <span className="muted small">{me?.email}</span>
          <Link to="/" className="btn btn--grey btn--small">← Back to app</Link>
        </div>
      </aside>
      <main className="admin__main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="series" element={<SeriesList />} />
          <Route path="series/new" element={<SeriesEditor />} />
          <Route path="series/:seriesId" element={<SeriesEditor />} />
          <Route path="users" element={<Users />} />
          <Route path="orders" element={<Orders />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}
