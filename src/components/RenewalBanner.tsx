import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'

const DAY_MS = 24 * 60 * 60 * 1000

/** Reminds members shortly before access ends: prepaid passes, and monthly memberships they've cancelled. */
export default function RenewalBanner() {
  const { me } = useSession()
  const sub = me?.subscription
  if (!sub || sub.source === 'comp' || sub.currentPeriodEnd === null || sub.renews) return null
  const daysLeft = Math.ceil((sub.currentPeriodEnd - Date.now()) / DAY_MS)
  if (daysLeft > 5) return null

  return (
    <div className="banner">
      {daysLeft > 0 ? (
        <span>
          Your membership ends in <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>. Add more time so your binge isn't interrupted.
        </span>
      ) : (
        <span>Your membership has ended. Renew to keep watching every episode.</span>
      )}
      <Link to="/plans" className="btn btn--small btn--accent">
        Renew
      </Link>
    </div>
  )
}
