import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './state/Session'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import { ErrorState, Spinner } from './components/Feedback'
import Landing from './pages/Landing'
import { AuthRedirect, Login, Signup } from './pages/Auth'
import Home from './pages/Home'
import MyList from './pages/MyList'
import Browse from './pages/Browse'
import Title from './pages/Title'
import Watch from './pages/Watch'
import Plans from './pages/Plans'
import Account from './pages/Account'
import { OrderStatusPage, TestCheckout } from './pages/Billing'
import { Privacy, Terms } from './pages/Legal'
import NotFound from './pages/NotFound'

// The admin panel is only downloaded by admins.
const Admin = lazy(() => import('./admin/Admin'))

export default function App() {
  const { me, meError, refreshMe } = useSession()
  const location = useLocation()

  if (me === undefined && meError) return <ErrorState message="Couldn't reach BingeTube. Check your connection and try again." onRetry={() => refreshMe()} />
  if (me === undefined) return <Spinner fullscreen />

  // Visitors can browse everything and watch free episodes; an account is needed for lists, progress and paying.
  if (!me) {
    const toLogin = <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    return (
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/watch/:seriesId/:episode" element={<Watch />} />
        <Route path="/my-list" element={toLogin} />
        <Route path="/account" element={toLogin} />
        <Route path="/billing/*" element={toLogin} />
        <Route path="/admin/*" element={toLogin} />
        <Route
          path="*"
          element={
            <>
              <Navbar />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/browse" element={<Browse />} />
                <Route path="/new" element={<Navigate to="/browse?sort=new" replace />} />
                <Route path="/search" element={<Navigate to="/browse" replace />} />
                <Route path="/title/:seriesId" element={<Title />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <Footer />
            </>
          }
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
              <Route path="/browse" element={<Browse />} />
              <Route path="/new" element={<Navigate to="/browse?sort=new" replace />} />
              <Route path="/my-list" element={<MyList />} />
              <Route path="/search" element={<Navigate to="/browse" replace />} />
              <Route path="/title/:seriesId" element={<Title />} />
              <Route path="/plans" element={<Plans />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/account" element={<Account />} />
              <Route path="/billing/order/:orderId" element={<OrderStatusPage />} />
              <Route path="/login" element={<AuthRedirect />} />
              <Route path="/signup" element={<AuthRedirect />} />
              <Route path="/welcome" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Footer />
          </>
        }
      />
    </Routes>
  )
}
