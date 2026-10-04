import { useId } from 'react'

/** The BingeTube mark: a lowercase "b" whose bowl holds a see-through play shape. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff2e4d" />
          <stop offset="1" stopColor="#ff7a3d" />
        </linearGradient>
        <mask id={`${id}m`}>
          <rect width="100" height="100" fill="#fff" />
          <path d="M47 49 L47 75 L68 62 Z" fill="#000" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
        </mask>
      </defs>
      <g fill={`url(#${id}g)`} mask={`url(#${id}m)`}>
        <rect x="16" y="8" width="18" height="84" rx="9" />
        <circle cx="54" cy="62" r="30" />
      </g>
    </svg>
  )
}
