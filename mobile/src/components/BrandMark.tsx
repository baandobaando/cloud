import { useId } from 'react'
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg'

/** The BingeTube "b" with a see-through play shape. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ff2e4d" />
          <Stop offset="1" stopColor="#ff7a3d" />
        </LinearGradient>
        <Mask id={`${id}m`}>
          <Rect width="100" height="100" fill="#fff" />
          <Path d="M47 49 L47 75 L68 62 Z" fill="#000" stroke="#000" strokeWidth={3} strokeLinejoin="round" />
        </Mask>
      </Defs>
      <G fill={`url(#${id}g)`} mask={`url(#${id}m)`}>
        <Rect x="16" y="8" width="18" height="84" rx="9" />
        <Circle cx="54" cy="62" r="30" />
      </G>
    </Svg>
  )
}
