import { useId } from 'react'
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg'

/** The BingeTube "b" with a see-through play shape, stacked in three fire-coloured layers. */
const LAYERS = [
  { offset: 6.4, color: '#ffb23d' },
  { offset: 3.2, color: '#ff6a35' },
  { offset: 0, color: '#ff2443' },
]

export default function BrandMark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <Mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <Rect width="100" height="100" fill="#fff" />
          <Path d="M47 49 L47 75 L68 62 Z" fill="#000" stroke="#000" strokeWidth={3} strokeLinejoin="round" />
        </Mask>
      </Defs>
      <G transform="translate(50 50) scale(.92) translate(-53.2 -53.2)">
        {LAYERS.map((l) => (
          <G key={l.color} transform={`translate(${l.offset} ${l.offset})`}>
            <G fill={l.color} mask={`url(#${id}m)`}>
              <Rect x="16" y="8" width="18" height="84" rx="9" />
              <Circle cx="54" cy="62" r="30" />
            </G>
          </G>
        ))}
      </G>
    </Svg>
  )
}
