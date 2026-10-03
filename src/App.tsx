import { Navigate, Route, Routes } from 'react-router-dom'
import { useAppState } from './state/AppState'
import ProfileGate from './pages/ProfileGate'
import Home from './pages/Home'
import NewAndHot from './pages/NewAndHot'
import MyList from './pages/MyList'
import Search from './pages/Search'
import Title from './pages/Title'
import Watch from './pages/Watch'
import Plans from './pages/Plans'
import Navbar from './components/Navbar'

export default function App() {
  const { activeProfile } = useAppState()

  if (!activeProfile) return <ProfileGate />

  return (
    <Routes>
      <Route path="/watch/:seriesId/:episode" element={<Watch />} />
      <Route
        path="*"
        element={
          <>
            <Navbar />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/new" element={<NewAndHot />} />
              <Route path="/my-list" element={<MyList />} />
              <Route path="/search" element={<Search />} />
              <Route path="/title/:seriesId" element={<Title />} />
              <Route path="/plans" element={<Plans />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </>
        }
      />
    </Routes>
  )
}
