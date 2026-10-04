import { useId } from 'react'

/** The BingeTube mark: a vertical episode card with a play button and the next one stacked behind it. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff2e4d" />
          <stop offset="1" stopColor="#ff6a3d" />
        </linearGradient>
      </defs>
      <rect x="14" y="2.5" width="15" height="23" rx="4" fill={`url(#${id})`} opacity="0.35" transform="rotate(10 21.5 14)" />
      <rect x="5" y="6" width="17" height="24" rx="4.5" fill={`url(#${id})`} />
      <path d="M11.2 13.6c0-.9 1-1.5 1.8-1l6 3.8c.7.5.7 1.5 0 2l-6 3.8c-.8.5-1.8-.1-1.8-1z" fill="#fff" />
    </svg>
  )
}
