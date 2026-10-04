import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './state/Session'
import Navbar from './components/Navbar'
import { Spinner } from './components/Feedback'
import Landing from './pages/Landing'
import { AuthRedirect, Login, Signup } from './pages/Auth'
import ProfileGate from './pages/ProfileGate'
import Home from './pages/Home'
import NewAndHot from './pages/NewAndHot'
import MyList from './pages/MyList'
import Search from './pages/Search'
import Title from './pages/Title'
import Watch from './pages/Watch'
import Plans from './pages/Plans'
import Account from './pages/Account'
import { OrderStatusPage, TestCheckout } from './pages/Billing'

// The admin panel is only downloaded by admins.
const Admin = lazy(() => import('./admin/Admin'))

export default function App() {
  const { me, activeProfile } = useSession()
  const location = useLocation()

  if (me === undefined) return <Spinner fullscreen />

  if (!me) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="*"
          element={<Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />}
        />
      </Routes>
    )
  }

  if (location.pathname === '/login' || location.pathname === '/signup') return <AuthRedirect />

  if (location.pathname.startsWith('/admin')) {
    if (!me.isAdmin) return <Navigate to="/" replace />
    return (
      <Suspense fallback={<Spinner fullscreen />}>
        <Routes>
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </Suspense>
    )
  }

  // Billing and account pages work without picking a profile (e.g. returning from a payment processor).
  const profileOptional = /^\/(billing|account)\b/.test(location.pathname)
  if (!activeProfile && !profileOptional) return <ProfileGate />

  return (
    <Routes>
      <Route path="/watch/:seriesId/:episode" element={<Watch />} />
      <Route path="/billing/test-checkout/:orderId" element={<TestCheckout />} />
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
              <Route path="/account" element={<Account />} />
              <Route path="/billing/order/:orderId" element={<OrderStatusPage />} />
              <Route path="/login" element={<AuthRedirect />} />
              <Route path="/signup" element={<AuthRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </>
        }
      />
    </Routes>
  )
}
