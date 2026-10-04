import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom'
import { useSession } from '../state/Session'
import Dashboard from './Dashboard'
import SeriesList from './SeriesList'
import SeriesEditor from './SeriesEditor'
import Users from './Users'
import Orders from './Orders'
import Icon from '../components/Icon'
import './admin.css'

export default function Admin() {
  const { me } = useSession()
  return (
    <div className="admin">
      <aside className="admin__side">
        <Link to="/admin" className="logo">
          reel<span>flix</span> <em className="admin__tag">Admin</em>
        </Link>
        <nav>
          <NavLink to="/admin" end><Icon name="chart" size={18} /> Dashboard</NavLink>
          <NavLink to="/admin/series"><Icon name="film" size={18} /> Series</NavLink>
          <NavLink to="/admin/orders"><Icon name="coins" size={18} /> Orders</NavLink>
          <NavLink to="/admin/users"><Icon name="users" size={18} /> Users</NavLink>
        </nav>
        <div className="admin__foot">
          <span className="muted small">{me?.email}</span>
          <Link to="/" className="btn btn--secondary btn--small"><Icon name="back" size={16} /> Back to app</Link>
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
