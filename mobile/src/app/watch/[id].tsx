import { useEventListener } from 'expo'
import * as Haptics from 'expo-haptics'
import { useKeepAwake } from 'expo-keep-awake'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type ViewToken,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '../../components/Button'
import { ErrorView, Loading } from '../../components/Feedback'
import Icon from '../../components/Icon'
import EpisodeSheet from '../../components/player/EpisodeSheet'
import Scrubber from '../../components/player/Scrubber'
import { api, errorMessage } from '../../lib/api'
import { MEDIA_HEADERS } from '../../lib/config'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'
import type { EpisodeView, SeriesDetail } from '../../lib/types'

const SAVE_EVERY_SEC = 10
const SKIP_SEC = 10
const HIDE_CONTROLS_MS = 3500
const DOUBLE_TAP_MS = 280
const SPEEDS = [1, 1.25, 1.5, 2, 0.75] as const

const haptic = () => Haptics.selectionAsync().catch(() => {})

/** Settings that carry over from one episode to the next, like a TV remote. */
interface PlayerPrefs {
  muted: boolean
  rate: number
}

/** Full-screen vertical feed: swipe up for the next episode, with Netflix-style controls on tap. */
export default function Watch() {
  useKeepAwake()
  const { id, ep } = useLocalSearchParams<{ id: string; ep?: string }>()
  const { height } = useWindowDimensions()
  const [series, setSeries] = useState<SeriesDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [prefs, setPrefs] = useState<PlayerPrefs>({ muted: false, rate: 1 })
  const [sheet, setSheet] = useState(false)
  const listRef = useRef<FlatList<EpisodeView>>(null)
  const { me } = useSession()
  // The episode on screen, so reloading after a purchase stays on it instead of jumping back to where we started.
  const current = useRef<number | null>(null)

  const load = useCallback(() => {
    setError(null)
    api.get<SeriesDetail>(`/series/${encodeURIComponent(id)}`).then(
      (s) => {
        setSeries(s)
        setActive(Math.max(0, s.episodes.findIndex((e) => e.number === (current.current ?? Number(ep ?? 1)))))
      },
      (e) => setError(errorMessage(e)),
    )
  }, [id, ep])
  // Reloaded when membership changes, so episodes unlock right after subscribing.
  useEffect(load, [load, me?.isEntitled])
  useEffect(() => {
    if (series) current.current = series.episodes[active]?.number ?? null
  }, [series, active])

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<EpisodeView>[] }) => {
    const first = viewableItems.find((v) => v.isViewable)
    if (first?.index != null) setActive(first.index)
  }).current

  const goTo = useCallback(
    (index: number, animated = true) => {
      if (!series || index < 0 || index >= series.episodes.length) return
      listRef.current?.scrollToIndex({ index, animated })
      if (!animated) setActive(index)
    },
    [series],
  )
  const next = useCallback(() => goTo(active + 1), [goTo, active])

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
            hasNext={index < series.episodes.length - 1}
            onNext={next}
            prefs={prefs}
            setPrefs={setPrefs}
            onEpisodes={() => setSheet(true)}
          />
        )}
        extraData={prefs}
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
      <EpisodeSheet
        visible={sheet}
        series={series}
        current={active}
        onClose={() => setSheet(false)}
        onPick={(index) => {
          setSheet(false)
          haptic()
          goTo(index, false)
        }}
      />
    </View>
  )
}

interface PageProps {
  series: SeriesDetail
  episode: EpisodeView
  height: number
  mode: 'active' | 'preload' | 'idle'
  hasNext: boolean
  onNext: () => void
  prefs: PlayerPrefs
  setPrefs: (update: (p: PlayerPrefs) => PlayerPrefs) => void
  onEpisodes: () => void
}

function EpisodePage({ series, episode, height, mode, hasNext, onNext, prefs, setPrefs, onEpisodes }: PageProps) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { me, saveProgress, progress } = useSession()
  const [paused, setPaused] = useState(false)
  const [time, setTime] = useState({ current: 0, duration: episode.durationSec || 1 })
  const [ready, setReady] = useState(false)
  const [controls, setControls] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const [skip, setSkip] = useState<{ side: 'left' | 'right'; total: number; key: number } | null>(null)
  const lastSaved = useRef(0)
  const lastTap = useRef({ at: 0, side: '' })
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fade = useRef(new Animated.Value(1)).current
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
    p.timeUpdateEventInterval = 0.25
    const saved = progress[series.id]
    if (saved && saved.episodeNumber === episode.number && saved.position > 5) p.currentTime = saved.position
  })

  useEffect(() => {
    if (!source) return
    if (active && !paused) player.play()
    else player.pause()
  }, [active, paused, source, player])

  // Mute and speed follow the viewer from episode to episode.
  useEffect(() => {
    if (!source) return
    player.muted = prefs.muted
    player.playbackRate = prefs.rate
  }, [prefs.muted, prefs.rate, source, player])

  // Each episode starts playing with the controls showing briefly, like Netflix.
  useEffect(() => {
    if (active) {
      setPaused(false)
      setControls(true)
    }
  }, [active])

  // Controls fade away while the video plays; they stay up while paused or scrubbing.
  useEffect(() => {
    Animated.timing(fade, { toValue: controls ? 1 : 0, duration: 180, useNativeDriver: true }).start()
    if (!controls || paused || scrubbing || !active) return
    const t = setTimeout(() => setControls(false), HIDE_CONTROLS_MS)
    return () => clearTimeout(t)
  }, [controls, paused, scrubbing, active, fade])

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current)
      if (skipTimer.current) clearTimeout(skipTimer.current)
    },
    [],
  )

  useEventListener(player, 'statusChange', ({ status }) => setReady(status === 'readyToPlay'))
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!scrubbing) setTime({ current: currentTime, duration: player.duration || episode.durationSec || 1 })
    if (active && Math.abs(currentTime - lastSaved.current) >= SAVE_EVERY_SEC) {
      lastSaved.current = currentTime
      saveProgress(series.id, episode.number, currentTime)
    }
  })
  useEventListener(player, 'playToEnd', () => {
    if (!active) return
    saveProgress(series.id, episode.number, 0)
    setControls(true)
    onNext()
  })

  // Record that this episode was started as soon as it becomes the active one, and where it was left when swiping away.
  const wasActive = useRef(false)
  useEffect(() => {
    if (active && !episode.locked) saveProgress(series.id, episode.number, Math.max(0, player.currentTime || 0))
    else if (wasActive.current && !episode.locked && player.currentTime > 5) saveProgress(series.id, episode.number, player.currentTime)
    wasActive.current = active
  }, [active])

  const seekTo = (t: number) => {
    const duration = player.duration || time.duration
    const to = Math.min(Math.max(0, t), Math.max(0, duration - 0.5))
    player.currentTime = to
    setTime({ current: to, duration })
  }

  const skipBy = (sec: number) => {
    haptic()
    seekTo((player.currentTime || 0) + sec)
    const side = sec < 0 ? 'left' : 'right'
    setSkip((s) => ({ side, total: s && s.side === side ? s.total + Math.abs(sec) : Math.abs(sec), key: Date.now() }))
    if (skipTimer.current) clearTimeout(skipTimer.current)
    skipTimer.current = setTimeout(() => setSkip(null), 700)
  }

  const togglePlay = () => {
    haptic()
    setPaused((p) => !p)
    setControls(true)
  }

  /** Single tap shows or hides the controls; double tap on the left or right third skips back or ahead 10 seconds. */
  const onTap = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX
    const side = x < width / 3 ? 'left' : x > (width * 2) / 3 ? 'right' : 'center'
    const now = Date.now()
    const double = side !== 'center' && side === lastTap.current.side && now - lastTap.current.at < DOUBLE_TAP_MS
    lastTap.current = { at: now, side }
    if (tapTimer.current) clearTimeout(tapTimer.current)
    if (double) {
      skipBy(side === 'left' ? -SKIP_SEC : SKIP_SEC)
      return
    }
    // A side tap might become a double tap, so it waits a moment before toggling the controls.
    tapTimer.current = setTimeout(() => setControls((c) => !c), side === 'center' ? 0 : DOUBLE_TAP_MS)
  }

  const nextSpeed = () => {
    haptic()
    setPrefs((p) => ({ ...p, rate: SPEEDS[(SPEEDS.indexOf(p.rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] }))
    setControls(true)
  }
  const toggleMute = () => {
    haptic()
    setPrefs((p) => ({ ...p, muted: !p.muted }))
    setControls(true)
  }

  if (episode.locked || !episode.videoUrl) {
    return (
      <View style={{ height, backgroundColor: '#000' }}>
        <View style={styles.locked}>
          <View style={styles.lockIcon}>
            <Icon name="lock" size={28} />
          </View>
          <Text style={styles.lockedTitle}>Don’t stop now. Episode {episode.number} is waiting.</Text>
          <Text style={styles.lockedText}>
            Become a member to watch all {series.episodes.length} episodes of {series.title} and every other series.
            {me?.trialEligible !== false ? ' Start with a free trial.' : ''}
          </Text>
          <Button
            title={me?.trialEligible !== false ? 'Start my free trial' : 'Become a member'}
            onPress={() => (me ? router.push('/paywall') : router.push({ pathname: '/(auth)/signup', params: { next: '/paywall' } }))}
            style={{ marginTop: 18, alignSelf: 'stretch' }}
          />
          <Button title="All episodes" variant="glass" icon={<Icon name="list" size={18} />} onPress={onEpisodes} style={{ marginTop: 10, alignSelf: 'stretch' }} />
        </View>
        <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} accessibilityLabel="Close player">
            <Icon name="down" />
          </Pressable>
        </View>
      </View>
    )
  }

  const pct = Math.min(100, (time.current / Math.max(1, time.duration)) * 100)
  const playing = active && !paused

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap} accessibilityLabel="Show or hide controls">
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
      </Pressable>

      {active && !ready && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}

      {skip && (
        <View key={skip.key} pointerEvents="none" style={[styles.skipZone, skip.side === 'left' ? { left: 0 } : { right: 0 }]}>
          <View style={styles.skipBubble}>
            <Icon name={skip.side === 'left' ? 'rewind' : 'forward'} size={26} />
            <Text style={styles.skipText}>
              {skip.side === 'left' ? '-' : '+'}
              {skip.total}s
            </Text>
          </View>
        </View>
      )}

      {/* Always-on info while the controls are hidden: title, episode and a thin progress line. */}
      {!controls && (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="none">
          <Text style={styles.seriesTitle} numberOfLines={1}>
            {series.title}
          </Text>
          <Text style={styles.epLabel}>
            Episode {episode.number} of {series.episodes.length}
            {prefs.muted ? '  ·  Muted' : ''}
            {prefs.rate !== 1 ? `  ·  ${prefs.rate}x` : ''}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        </View>
      )}

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents={controls ? 'box-none' : 'none'}>
        <LinearGradient colors={['rgba(0,0,0,0.65)', 'transparent']} style={styles.shadeTop} pointerEvents="none" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.shadeBottom} pointerEvents="none" />

        <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10} accessibilityLabel="Close player">
            <Icon name="down" />
          </Pressable>
          <View style={styles.topTitle} pointerEvents="none">
            <Text style={styles.topSeries} numberOfLines={1}>
              {series.title}
            </Text>
            <Text style={styles.topEp}>Episode {episode.number}</Text>
          </View>
          <Pressable onPress={toggleMute} style={styles.iconBtn} hitSlop={10} accessibilityLabel={prefs.muted ? 'Unmute' : 'Mute'}>
            <Icon name={prefs.muted ? 'mute' : 'volume'} />
          </Pressable>
        </View>

        <View style={styles.center} pointerEvents="box-none">
          <View style={styles.transport} pointerEvents="box-none">
            <Pressable onPress={() => skipBy(-SKIP_SEC)} style={styles.skipBtn} hitSlop={12} accessibilityLabel="Back 10 seconds">
              <Icon name="rewind" size={34} />
              <Text style={styles.skipNum}>10</Text>
            </Pressable>
            <Pressable onPress={togglePlay} style={styles.bigPlay} hitSlop={8} accessibilityLabel={playing ? 'Pause' : 'Play'}>
              <View style={!playing && { paddingLeft: 4 }}>
                <Icon name={playing ? 'pause' : 'play'} size={36} />
              </View>
            </Pressable>
            <Pressable onPress={() => skipBy(SKIP_SEC)} style={styles.skipBtn} hitSlop={12} accessibilityLabel="Forward 10 seconds">
              <Icon name="forward" size={34} />
              <Text style={styles.skipNum}>10</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.controlsBottom, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
          <Scrubber
            current={time.current}
            duration={time.duration}
            onScrubbing={(s) => {
              setScrubbing(s)
              if (s) setControls(true)
            }}
            onSeek={seekTo}
          />
          <View style={styles.actions}>
            <Pressable onPress={nextSpeed} style={styles.action} hitSlop={6} accessibilityLabel={`Playback speed ${prefs.rate}x`}>
              <Text style={styles.speed}>{prefs.rate}x</Text>
              <Text style={styles.actionText}>Speed</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                haptic()
                onEpisodes()
              }}
              style={styles.action}
              hitSlop={6}
            >
              <Icon name="episodes" size={22} />
              <Text style={styles.actionText}>Episodes</Text>
            </Pressable>
            {hasNext && (
              <Pressable
                onPress={() => {
                  haptic()
                  onNext()
                }}
                style={styles.action}
                hitSlop={6}
              >
                <Icon name="next" size={20} />
                <Text style={styles.actionText}>Next episode</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  shadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  shadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  topTitle: { flex: 1, alignItems: 'center' },
  topSeries: { color: '#fff', fontSize: 15, fontWeight: '800', ...shadow },
  topEp: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1, ...shadow },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 44 },
  bigPlay: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  skipBtn: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  skipNum: { position: 'absolute', color: '#fff', fontSize: 11, fontWeight: '800', top: 22 },
  controlsBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4, paddingVertical: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 6 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  speed: { color: '#fff', fontSize: 13, fontWeight: '900', borderWidth: 1.5, borderColor: '#fff', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden' },
  skipZone: { position: 'absolute', top: 0, bottom: 0, width: '38%', alignItems: 'center', justifyContent: 'center' },
  skipBubble: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)', gap: 2 },
  skipText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 40 },
  seriesTitle: { color: '#fff', fontSize: 17, fontWeight: '800', ...shadow },
  epLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3, ...shadow },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 12, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.accent },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#0d0d0f' },
  lockIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,46,77,0.2)', marginBottom: 16 },
  lockedTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  lockedText: { color: colors.text2, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
})
