import { useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../lib/theme'

export const formatTime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  current: number
  duration: number
  /** Called while dragging (to keep the controls up and show the time). */
  onScrubbing: (scrubbing: boolean) => void
  /** Seek to this time when the finger lifts. */
  onSeek: (time: number) => void
}

/** Draggable progress bar with elapsed and remaining time. Tap anywhere on it to jump, or drag the thumb. */
export default function Scrubber({ current, duration, onScrubbing, onSeek }: Props) {
  const [drag, setDrag] = useState<number | null>(null)
  const track = useRef<View>(null)
  const geo = useRef({ x: 0, w: 1 })
  const latest = useRef({ duration, onScrubbing, onSeek })
  latest.current = { duration, onScrubbing, onSeek }

  const timeAt = (pageX: number) => Math.min(1, Math.max(0, (pageX - geo.current.x) / geo.current.w)) * latest.current.duration
  const measure = () => track.current?.measureInWindow((x, _y, w) => (geo.current = { x, w: Math.max(1, w) }))

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Don't hand the gesture to the vertical episode feed while scrubbing.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_e, g) => {
        latest.current.onScrubbing(true)
        setDrag(timeAt(g.x0))
      },
      onPanResponderMove: (_e, g) => setDrag(timeAt(g.moveX)),
      onPanResponderRelease: (_e, g) => {
        const t = timeAt(g.moveX || g.x0)
        latest.current.onSeek(t)
        setDrag(null)
        latest.current.onScrubbing(false)
      },
      onPanResponderTerminate: () => {
        setDrag(null)
        latest.current.onScrubbing(false)
      },
    }),
  ).current

  const shown = drag ?? current
  const pct = `${Math.min(100, (shown / Math.max(1, duration)) * 100)}%` as const

  return (
    <View style={styles.row}>
      <Text style={styles.time}>{formatTime(shown)}</Text>
      <View ref={track} onLayout={measure} style={styles.hit} {...pan.panHandlers}>
        <View style={[styles.track, drag !== null && styles.trackActive]} pointerEvents="none">
          <View style={[styles.fill, { width: pct }]} />
        </View>
        <View style={[styles.thumb, drag !== null && styles.thumbActive, { left: pct }]} pointerEvents="none" />
      </View>
      <Text style={styles.time}>-{formatTime(Math.max(0, duration - shown))}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { color: '#fff', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 38, textAlign: 'center' },
  hit: { flex: 1, height: 32, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  trackActive: { height: 5, borderRadius: 3 },
  fill: { height: '100%', backgroundColor: colors.accent },
  thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7, backgroundColor: colors.accent, top: 9 },
  thumbActive: { width: 22, height: 22, borderRadius: 11, marginLeft: -11, top: 5 },
})
