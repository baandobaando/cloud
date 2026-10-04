import { useId } from 'react'

/**
 * The BingeTube mark: a lowercase "b" whose bowl holds a see-through play shape, stacked in three
 * fire-coloured layers (yellow, orange, red) for depth.
 */
const LAYERS = [
  { offset: 6.4, color: '#ffb23d' },
  { offset: 3.2, color: '#ff6a35' },
  { offset: 0, color: '#ff2443' },
]

export default function BrandMark({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          <path d="M47 49 L47 75 L68 62 Z" fill="#000" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
        </mask>
      </defs>
      <g transform="translate(50 50) scale(.92) translate(-53.2 -53.2)">
        {LAYERS.map((l) => (
          <g key={l.color} transform={`translate(${l.offset} ${l.offset})`}>
            <g fill={l.color} mask={`url(#${id}m)`}>
              <rect x="16" y="8" width="18" height="84" rx="9" />
              <circle cx="54" cy="62" r="30" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  )
}
