import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../lib/theme'
import type { SeriesDetail } from '../../lib/types'
import Icon from '../Icon'

const RANGE = 30
const COLS = 6

interface Props {
  visible: boolean
  series: SeriesDetail
  /** Index of the episode playing now. */
  current: number
  onPick: (index: number) => void
  onClose: () => void
}

/** Bottom sheet with every episode, grouped in blocks of 30, to jump straight to any of them. */
export default function EpisodeSheet({ visible, series, current, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [range, setRange] = useState(Math.floor(current / RANGE))
  useEffect(() => {
    if (visible) setRange(Math.floor(current / RANGE))
  }, [visible, current])

  const ranges = Math.ceil(series.episodes.length / RANGE)
  const tile = Math.floor((width - 20 * 2 - 8 * (COLS - 1)) / COLS)
  const shown = series.episodes.slice(range * RANGE, range * RANGE + RANGE)
  const locked = series.episodes.filter((e) => e.locked).length

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close episodes" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: height * 0.72 }]}>
        <View style={styles.grip} />
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {series.title}
            </Text>
            <Text style={styles.sub}>
              {series.episodes.length} episodes{locked ? ` · ${series.episodes.length - locked} unlocked` : ' · all unlocked'}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.close} hitSlop={10} accessibilityLabel="Close">
            <Icon name="close" size={20} />
          </Pressable>
        </View>
        {ranges > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ranges} style={{ flexGrow: 0 }}>
            {Array.from({ length: ranges }, (_, i) => (
              <Pressable key={i} onPress={() => setRange(i)} style={[styles.range, i === range && styles.rangeOn]}>
                <Text style={[styles.rangeText, i === range && styles.rangeTextOn]}>
                  {i * RANGE + 1}–{Math.min(series.episodes.length, (i + 1) * RANGE)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <ScrollView contentContainerStyle={styles.grid}>
          {shown.map((ep) => {
            const index = series.episodes.indexOf(ep)
            const on = index === current
            return (
              <Pressable
                key={ep.id}
                onPress={() => onPick(index)}
                style={({ pressed }) => [styles.tile, { width: tile, height: tile }, on && styles.tileOn, pressed && { opacity: 0.7 }]}
                accessibilityLabel={`Episode ${ep.number}${ep.locked ? ', locked' : ''}`}
              >
                <Text style={[styles.num, on && styles.numOn, ep.locked && !on && styles.numLocked]}>{ep.number}</Text>
                {ep.locked && (
                  <View style={styles.lock}>
                    <Icon name="lock" size={10} color="rgba(255,255,255,0.75)" />
                  </View>
                )}
                {on && <View style={styles.playing} />}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: '#141416', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8 },
  grip: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  ranges: { paddingHorizontal: 20, gap: 6, paddingVertical: 8 },
  range: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  rangeOn: { backgroundColor: colors.text },
  rangeText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  rangeTextOn: { color: colors.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 },
  tile: { borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  tileOn: { backgroundColor: 'rgba(255,46,77,0.18)', borderWidth: 1.5, borderColor: colors.accent },
  num: { color: colors.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  numOn: { color: colors.accent },
  numLocked: { color: 'rgba(255,255,255,0.45)' },
  lock: { position: 'absolute', top: 4, right: 4 },
  playing: { position: 'absolute', bottom: 6, width: 14, height: 3, borderRadius: 2, backgroundColor: colors.accent },
})
