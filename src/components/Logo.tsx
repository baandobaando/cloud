import { Link } from 'react-router-dom'

export default function Logo({ to = '/', size }: { to?: string; size?: 'big' }) {
  return (
    <Link to={to} className={`logo ${size === 'big' ? 'logo--big' : ''}`} aria-label="ReelFlix home">
      Reel<span>flix</span>
    </Link>
  )
}
