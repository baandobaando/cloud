import { useEventListener } from 'expo'
import { router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewToken } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '../../components/Button'
import { ErrorView, Loading } from '../../components/Feedback'
import Icon from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { MEDIA_HEADERS } from '../../lib/config'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'
import type { EpisodeView, SeriesDetail } from '../../lib/types'

const SAVE_EVERY_SEC = 10

/** Full-screen vertical feed: swipe up for the next episode, like the short-drama apps. */
export default function Watch() {
  const { id, ep } = useLocalSearchParams<{ id: string; ep?: string }>()
  const { height } = useWindowDimensions()
  const [series, setSeries] = useState<SeriesDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const listRef = useRef<FlatList<EpisodeView>>(null)

  const load = useCallback(() => {
    setError(null)
    api.get<SeriesDetail>(`/series/${encodeURIComponent(id)}`).then(
      (s) => {
        setSeries(s)
        setActive(Math.max(0, s.episodes.findIndex((e) => e.number === Number(ep ?? 1))))
      },
      (e) => setError(errorMessage(e)),
    )
  }, [id, ep])
  useEffect(load, [load])

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<EpisodeView>[] }) => {
    const first = viewableItems.find((v) => v.isViewable)
    if (first?.index != null) setActive(first.index)
  }).current

  const next = useCallback(() => {
    if (series && active < series.episodes.length - 1) listRef.current?.scrollToIndex({ index: active + 1, animated: true })
  }, [series, active])

  if (error) return <ErrorView message={error} onRetry={load} />
  if (!series) return <Loading />

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <FlatList
        ref={listRef}
        data={series.episodes}
        keyExtractor={(e) => String(e.id)}
        renderItem={({ item, index }) => (
          <EpisodePage
            series={series}
            episode={item}
            height={height}
            // Only the active page plays; its neighbours load so the next swipe starts instantly.
            mode={index === active ? 'active' : Math.abs(index - active) === 1 ? 'preload' : 'idle'}
            onEnded={next}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        initialScrollIndex={active}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
      />
    </View>
  )
}

interface PageProps {
  series: SeriesDetail
  episode: EpisodeView
  height: number
  mode: 'active' | 'preload' | 'idle'
  onEnded: () => void
}

function EpisodePage({ series, episode, height, mode, onEnded }: PageProps) {
  const insets = useSafeAreaInsets()
  const { saveProgress, progress } = useSession()
  const [paused, setPaused] = useState(false)
  const [time, setTime] = useState({ current: 0, duration: episode.durationSec || 1 })
  const [ready, setReady] = useState(false)
  const lastSaved = useRef(0)
  const active = mode === 'active'

  // Pages far from the active one hold no player at all; switching between preload and active keeps the same one.
  const loadable = mode !== 'idle'
  const source = useMemo<VideoSource | null>(
    () =>
      loadable && episode.videoUrl
        ? { uri: episode.videoUrl, headers: MEDIA_HEADERS, metadata: { title: `${series.title} · Episode ${episode.number}` } }
        : null,
    [loadable, episode.videoUrl, series.title, episode.number],
  )
  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.5
    const saved = progress[series.id]
    if (saved && saved.episodeNumber === episode.number && saved.position > 5) p.currentTime = saved.position
  })

  useEffect(() => {
    if (!source) return
    if (active && !paused) player.play()
    else player.pause()
  }, [active, paused, source, player])

  useEffect(() => {
    if (active) setPaused(false)
  }, [active])

  useEventListener(player, 'statusChange', ({ status }) => setReady(status === 'readyToPlay'))
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setTime({ current: currentTime, duration: player.duration || episode.durationSec || 1 })
    if (active && Math.abs(currentTime - lastSaved.current) >= SAVE_EVERY_SEC) {
      lastSaved.current = currentTime
      saveProgress(series.id, episode.number, currentTime)
    }
  })
  useEventListener(player, 'playToEnd', () => {
    if (!active) return
    saveProgress(series.id, episode.number, 0)
    onEnded()
  })

  // Record that this episode was started as soon as it becomes the active one.
  useEffect(() => {
    if (active && !episode.locked) saveProgress(series.id, episode.number, Math.max(0, player.currentTime || 0))
  }, [active])

  const pct = Math.min(100, (time.current / Math.max(1, time.duration)) * 100)

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {episode.locked || !episode.videoUrl ? (
        <View style={styles.locked}>
          <View style={styles.lockIcon}>
            <Icon name="lock" size={28} />
          </View>
          <Text style={styles.lockedTitle}>Episode {episode.number} isn’t available yet</Text>
          <Text style={styles.lockedText}>This episode isn’t included with your account right now. You can keep watching the free episodes.</Text>
          <Button title="Back to episodes" variant="glass" onPress={() => router.back()} style={{ marginTop: 18, alignSelf: 'stretch' }} />
        </View>
      ) : (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
          {active && !ready && (
            <View style={styles.center} pointerEvents="none">
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}
          {active && paused && (
            <View style={styles.center} pointerEvents="none">
              <View style={styles.bigPlay}>
                <Icon name="play" size={34} />
              </View>
            </View>
          )}
        </Pressable>
      )}

      <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Icon name="back" />
        </Pressable>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
        <Text style={styles.seriesTitle} numberOfLines={1}>
          {series.title}
        </Text>
        <Text style={styles.epLabel}>
          Episode {episode.number} of {series.episodes.length}
        </Text>
        {!episode.locked && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bigPlay: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingLeft: 4 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, flexDirection: 'row' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 40 },
  seriesTitle: { color: '#fff', fontSize: 17, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  epLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 12, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.accent },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0d0d0f' },
  lockIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,46,77,0.2)', marginBottom: 16 },
  lockedTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  lockedText: { color: colors.text2, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
})
