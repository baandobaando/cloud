import Svg, { Path } from 'react-native-svg'

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-4 4.5-6 8-6s7 2 8 6',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5 10 17 19 7',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  episodes: 'M4 5h16v10H4zM8 19h8M10 9.5v1.5l3-1.5-3-1.5z',
  next: 'M5 5v14l10-7zM18 5v14',
  down: 'M6 9l6 6 6-6',
  rewind: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 3.5v4h4',
  forward: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M20 3.5v4h-4',
} as const

export type IconName = keyof typeof PATHS
const FILLED = new Set<IconName>(['play', 'pause'])
// Mixed icons: filled shape with a stroked bar.
const BOTH = new Set<IconName>(['next'])

export default function Icon({ name, size = 22, color = '#fff' }: { name: IconName; size?: number; color?: string }) {
  const filled = FILLED.has(name)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={PATHS[name]}
        fill={filled || BOTH.has(name) ? color : 'none'}
        stroke={filled ? 'none' : color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
