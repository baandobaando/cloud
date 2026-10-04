import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '../../components/Button'
import Cover from '../../components/Cover'
import { ErrorView, Loading } from '../../components/Feedback'
import Icon from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { MEDIA_HEADERS } from '../../lib/config'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'
import type { SeriesDetail } from '../../lib/types'

const { width } = Dimensions.get('window')
const RANGE = 30
const COLS = 4
const TILE = Math.floor((width - 18 * 2 - 8 * (COLS - 1)) / COLS)

export default function Series() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { myList, toggleMyList, progress } = useSession()
  const [series, setSeries] = useState<SeriesDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState(0)

  const load = useCallback(() => {
    setError(null)
    api.get<SeriesDetail>(`/series/${encodeURIComponent(id)}`).then(setSeries, (e) => setError(errorMessage(e)))
  }, [id])
  useEffect(load, [load])

  if (error) return <ErrorView message={error} onRetry={load} />
  if (!series) return <Loading />

  const inList = myList.includes(series.id)
  const resume = progress[series.id]?.episodeNumber
  const ranges = Math.ceil(series.episodes.length / RANGE)
  const shown = series.episodes.slice(range * RANGE, range * RANGE + RANGE)
  const minutes = Math.round(series.episodes.reduce((n, e) => n + e.durationSec, 0) / 60)
  const play = (ep: number) => router.push({ pathname: '/watch/[id]', params: { id: series.id, ep: String(ep) } })

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={[styles.head, { paddingTop: insets.top + 56 }]}>
          <LinearGradient colors={[series.palette[0] ?? '#5a0a1c', colors.bg]} style={StyleSheet.absoluteFill} />
          <Cover series={series} style={styles.cover} radius={16} />
          <Text style={styles.title}>{series.title}</Text>
          <Text style={styles.meta}>
            {series.rating} · {series.episodes.length} episodes · {minutes} min
          </Text>
          <View style={styles.tags}>
            {series.genres.map((g) => (
              <Text key={g} style={styles.tag}>
                {g}
              </Text>
            ))}
          </View>
          {(series.tagline || series.synopsis) && <Text style={styles.synopsis}>{series.synopsis || series.tagline}</Text>}
          <View style={styles.actions}>
            <Button
              title={resume ? `Resume episode ${resume}` : 'Play episode 1'}
              variant="light"
              icon={<Icon name="play" size={18} color={colors.bg} />}
              onPress={() => play(resume ?? 1)}
              style={{ flex: 1 }}
            />
            <Pressable onPress={() => toggleMyList(series.id)} style={styles.ring} hitSlop={6}>
              <Icon name={inList ? 'check' : 'plus'} size={22} />
            </Pressable>
          </View>
        </View>

        <View style={styles.epHead}>
          <Text style={styles.epTitle}>Episodes</Text>
        </View>
        {ranges > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ranges}>
            {Array.from({ length: ranges }, (_, i) => (
              <Pressable key={i} onPress={() => setRange(i)} style={[styles.range, i === range && styles.rangeOn]}>
                <Text style={[styles.rangeText, i === range && styles.rangeTextOn]}>
                  {i * RANGE + 1}–{Math.min(series.episodes.length, (i + 1) * RANGE)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View style={styles.grid}>
          {shown.map((ep) => (
            <Pressable key={ep.id} onPress={() => play(ep.number)} style={({ pressed }) => [styles.ep, { opacity: pressed ? 0.75 : 1 }]}>
              <View style={[styles.epImg, resume === ep.number && styles.epCurrent]}>
                {ep.thumbUrl && (
                  <Image source={{ uri: ep.thumbUrl, headers: MEDIA_HEADERS }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={String(ep.id)} transition={150} />
                )}
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
                <Text style={styles.epNum}>{ep.number}</Text>
                {ep.locked && (
                  <View style={styles.lock}>
                    <Icon name="lock" size={12} />
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Pressable onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10}>
        <Icon name="back" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { alignItems: 'center', paddingHorizontal: 22 },
  cover: { width: width * 0.5, height: width * 0.5 * (16 / 9) },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.6, marginTop: 18, lineHeight: 30 },
  meta: { color: colors.text2, fontSize: 14, marginTop: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 },
  tag: { color: '#ff8a9a', backgroundColor: 'rgba(255,46,77,0.14)', fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  synopsis: { color: colors.text2, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, alignSelf: 'stretch' },
  ring: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' },
  epHead: { paddingHorizontal: 18, marginTop: 30, marginBottom: 8 },
  epTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  ranges: { paddingHorizontal: 18, gap: 6, paddingVertical: 8 },
  range: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  rangeOn: { backgroundColor: colors.text },
  rangeText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  rangeTextOn: { color: colors.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, marginTop: 8 },
  ep: { width: TILE },
  epImg: { width: TILE, height: TILE * (4 / 3), borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'flex-end' },
  epCurrent: { borderWidth: 2, borderColor: colors.accent },
  epNum: { color: '#fff', fontSize: 20, fontWeight: '900', margin: 7, letterSpacing: -1 },
  lock: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  back: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
})
