import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'

export default function Logo({ to = '/', size }: { to?: string; size?: 'big' }) {
  return (
    <Link to={to} className={`logo ${size === 'big' ? 'logo--big' : ''}`} aria-label="BingeTube home">
      <BrandMark size={size === 'big' ? 38 : 28} />
      <span className="logo__word">
        binge<span>tube</span>
      </span>
    </Link>
  )
}
