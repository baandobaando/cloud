import { BlurView } from 'expo-blur'
import { router } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ErrorView, Loading } from '../../components/Feedback'
import HeroCarousel from '../../components/HeroCarousel'
import Icon from '../../components/Icon'
import JoinButton from '../../components/JoinButton'
import Logo from '../../components/Logo'
import PromoCard from '../../components/PromoCard'
import SeriesCard from '../../components/SeriesCard'
import Shelf from '../../components/Shelf'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'
import { GENRES, type SeriesSummary } from '../../lib/types'

const { width } = Dimensions.get('window')
const CARD = Math.round(width * 0.34)
const WIDE = Math.round(width * 0.42)
const HERO_COUNT = 6

export default function Home() {
  const insets = useSafeAreaInsets()
  const { catalog, catalogError, reloadCatalog, progress, myList } = useSession()
  const [refreshing, setRefreshing] = useState(false)
  const scrollY = useRef(new Animated.Value(0)).current

  const data = useMemo(() => {
    if (!catalog) return null
    const byId = new Map(catalog.map((s) => [s.id, s]))
    const ranked = catalog.filter((s) => s.trendingRank).sort((a, b) => a.trendingRank! - b.trendingRank!)
    const popular = ranked.length ? ranked : [...catalog].sort((a, b) => b.episodeCount - a.episodeCount)
    const heroPick = popular.filter((s) => s.episodeCount >= 10 && s.posterUrl)
    const continueWatching = Object.entries(progress)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .map(([id, p]) => ({ series: byId.get(id), ep: p.episodeNumber }))
      .filter((x): x is { series: SeriesSummary; ep: number } => !!x.series)
    // "Because you watched": more from the genre of the last thing watched.
    const last = continueWatching[0]?.series
    const watched = new Set(continueWatching.map((c) => c.series.id))
    const because = last
      ? catalog.filter((s) => !watched.has(s.id) && s.genres.some((g) => last.genres.includes(g))).slice(0, 15)
      : []
    // Series still being uploaded (a handful of episodes) stay out of the showcase rows.
    const full = catalog.filter((s) => s.episodeCount >= 10)
    const fresh = full.filter((s) => s.isNew)
    return {
      hero: (heroPick.length >= 3 ? heroPick : popular).slice(0, HERO_COUNT),
      popular,
      continueWatching,
      last,
      because,
      newest: (fresh.length >= 6 ? fresh : full.length >= 6 ? full : catalog).slice(0, 15),
      bingeable: [...catalog].sort((a, b) => b.episodeCount - a.episodeCount).slice(0, 15),
      saved: myList.map((id) => byId.get(id)).filter((s): s is SeriesSummary => !!s),
    }
  }, [catalog, progress, myList])

  if (catalogError && !catalog) return <ErrorView message={catalogError} onRetry={reloadCatalog} />
  if (!data) return <Loading />

  // The top bar turns solid as the hero scrolls away.
  const barOpacity = scrollY.interpolate({ inputRange: [40, 160], outputRange: [0, 1], extrapolate: 'clamp' })

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        refreshControl={
          <RefreshControl
            tintColor={colors.accent}
            progressViewOffset={insets.top + 50}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              reloadCatalog()
              setTimeout(() => setRefreshing(false), 800)
            }}
          />
        }
      >
        <HeroCarousel items={data.hero} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genres}>
          {GENRES.map((g) => (
            <Pressable
              key={g}
              onPress={() => router.navigate({ pathname: '/(tabs)/browse', params: { genre: g } })}
              style={({ pressed }) => [styles.genre, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.genreText}>{g}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {data.continueWatching.length > 0 && (
          <Shelf title="Continue watching">
            {data.continueWatching.slice(0, 12).map(({ series, ep }) => (
              <SeriesCard key={series.id} series={series} width={CARD} resumeEpisode={ep} />
            ))}
          </Shelf>
        )}

        <Shelf title="Top 10 today" subtitle="What everyone is binging right now">
          {data.popular.slice(0, 10).map((s, i) => (
            <View key={s.id} style={styles.rankItem}>
              <Text style={styles.rankNum}>{i + 1}</Text>
              <SeriesCard series={s} width={CARD} />
            </View>
          ))}
        </Shelf>

        <PromoCard />

        {data.last && data.because.length > 0 && (
          <Shelf title={`Because you watched ${data.last.title}`}>
            {data.because.map((s) => (
              <SeriesCard key={s.id} series={s} width={CARD} />
            ))}
          </Shelf>
        )}

        <Shelf title="New releases" subtitle="Fresh series, new episodes daily">
          {data.newest.map((s) => (
            <SeriesCard key={s.id} series={s} width={WIDE} />
          ))}
        </Shelf>

        {data.saved.length > 0 && (
          <Shelf title="My List">
            {data.saved.slice(0, 12).map((s) => (
              <SeriesCard key={s.id} series={s} width={CARD} />
            ))}
          </Shelf>
        )}

        <Shelf title="Binge-worthy" subtitle="The longest stories to lose a weekend to">
          {data.bingeable.map((s) => (
            <SeriesCard key={s.id} series={s} width={CARD} />
          ))}
        </Shelf>

        {GENRES.map((g) => {
          const items = catalog!.filter((s) => s.genres.includes(g)).slice(0, 15)
          return items.length ? (
            <Shelf key={g} title={g} onMore={() => router.navigate({ pathname: '/(tabs)/browse', params: { genre: g } })}>
              {items.map((s) => (
                <SeriesCard key={s.id} series={s} width={CARD} />
              ))}
            </Shelf>
          ) : null
        })}

        <Text style={styles.footer}>You’ve reached the end. New episodes drop every day.</Text>
      </Animated.ScrollView>

      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: barOpacity }]} pointerEvents="none">
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.barTint]} />
        </Animated.View>
        <Logo size={20} />
        <View style={styles.barRight}>
          <Pressable onPress={() => router.navigate('/(tabs)/browse')} style={styles.searchBtn} hitSlop={8} accessibilityLabel="Search">
            <Icon name="search" size={21} />
          </Pressable>
          <JoinButton />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barTint: { backgroundColor: 'rgba(10,10,11,0.55)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  genres: { paddingHorizontal: 18, gap: 8, paddingTop: 20 },
  genre: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  genreText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  rankItem: { flexDirection: 'row', alignItems: 'flex-start' },
  rankNum: { fontSize: 76, fontWeight: '900', color: colors.bg, textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 1.5, letterSpacing: -6, marginRight: -6, marginTop: CARD * 0.62, lineHeight: 80, zIndex: 1 },
  footer: { color: colors.muted, textAlign: 'center', fontSize: 13, marginTop: 36 },
})
