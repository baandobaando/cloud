import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '../../components/Button'
import Cover from '../../components/Cover'
import { ErrorView, Loading } from '../../components/Feedback'
import Icon from '../../components/Icon'
import Logo from '../../components/Logo'
import SeriesCard from '../../components/SeriesCard'
import Shelf from '../../components/Shelf'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'
import { GENRES } from '../../lib/types'

const { width } = Dimensions.get('window')
const CARD = Math.round(width * 0.36)
const HERO_W = Math.round(width * 0.5)

export default function Home() {
  const insets = useSafeAreaInsets()
  const { catalog, catalogError, reloadCatalog, progress, myList, toggleMyList } = useSession()
  const [refreshing, setRefreshing] = useState(false)

  const data = useMemo(() => {
    if (!catalog) return null
    const byId = new Map(catalog.map((s) => [s.id, s]))
    const ranked = catalog.filter((s) => s.trendingRank).sort((a, b) => a.trendingRank! - b.trendingRank!)
    const popular = ranked.length ? ranked : [...catalog].sort((a, b) => b.episodeCount - a.episodeCount)
    const continueWatching = Object.entries(progress)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .map(([id, p]) => ({ series: byId.get(id), ep: p.episodeNumber }))
      .filter((x): x is { series: NonNullable<typeof x.series>; ep: number } => !!x.series)
    return { popular, continueWatching, newest: catalog.slice(0, 12), saved: myList.map((id) => byId.get(id)).filter((s) => !!s) }
  }, [catalog, progress, myList])

  if (catalogError && !catalog) return <ErrorView message={catalogError} onRetry={reloadCatalog} />
  if (!data) return <Loading />
  const featured = data.popular[0]
  const inList = featured ? myList.includes(featured.id) : false
  const resume = featured ? progress[featured.id]?.episodeNumber : undefined

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          tintColor={colors.accent}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            reloadCatalog()
            setTimeout(() => setRefreshing(false), 800)
          }}
        />
      }
    >
      {featured && (
        <View style={[styles.hero, { paddingTop: insets.top + 56 }]}>
          <LinearGradient colors={['#5a0a1c', '#1a0710', colors.bg]} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(255,31,69,0.55)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 0.35, y: 0.5 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(255,31,69,0.55)', 'transparent']} start={{ x: 1, y: 0.5 }} end={{ x: 0.65, y: 0.5 }} style={StyleSheet.absoluteFill} />
          <Pressable onPress={() => router.push({ pathname: '/series/[id]', params: { id: featured.id } })}>
            <Cover series={featured} style={styles.heroCover} radius={16} />
          </Pressable>
          <View style={styles.badgeRow}>
            <Text style={styles.badge}>TOP 10</Text>
            <Text style={styles.badgeText}>#1 today</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={3}>
            {featured.title}
          </Text>
          <Text style={styles.heroMeta}>
            {featured.genres.slice(0, 2).join(' · ')} · {featured.episodeCount} episodes
          </Text>
          <View style={styles.heroActions}>
            <Button
              title={resume ? `Resume ep ${resume}` : 'Play'}
              variant="light"
              icon={<Icon name="play" size={18} color={colors.bg} />}
              onPress={() => router.push({ pathname: '/watch/[id]', params: { id: featured.id, ep: String(resume ?? 1) } })}
              style={{ flex: 1 }}
            />
            <Button
              title={inList ? 'In My List' : 'My List'}
              variant="glass"
              icon={<Icon name={inList ? 'check' : 'plus'} size={18} />}
              onPress={() => toggleMyList(featured.id)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      {data.continueWatching.length > 0 && (
        <Shelf title="Continue watching">
          {data.continueWatching.slice(0, 12).map(({ series, ep }) => (
            <SeriesCard key={series.id} series={series} width={CARD} resumeEpisode={ep} />
          ))}
        </Shelf>
      )}
      <Shelf title="Top 10 today" subtitle="What everyone is binging">
        {data.popular.slice(0, 10).map((s, i) => (
          <SeriesCard key={s.id} series={s} width={CARD} rank={i + 1} />
        ))}
      </Shelf>
      <Shelf title="New releases" subtitle="Fresh series added this week">
        {data.newest.map((s) => (
          <SeriesCard key={s.id} series={s} width={CARD} />
        ))}
      </Shelf>
      {data.saved.length > 0 && (
        <Shelf title="My List">
          {data.saved.slice(0, 12).map((s) => (
            <SeriesCard key={s.id} series={s} width={CARD} />
          ))}
        </Shelf>
      )}
      {GENRES.map((g) => {
        const items = catalog!.filter((s) => s.genres.includes(g)).slice(0, 12)
        return items.length ? (
          <Shelf key={g} title={g}>
            {items.map((s) => (
              <SeriesCard key={s.id} series={s} width={CARD} />
            ))}
          </Shelf>
        ) : null
      })}

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Logo size={20} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 18 },
  hero: { alignItems: 'center', paddingHorizontal: 22, paddingBottom: 8 },
  heroCover: { width: HERO_W, height: HERO_W * (16 / 9), shadowColor: '#ff1f45', shadowOpacity: 0.5, shadowRadius: 30 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  badge: { backgroundColor: colors.accent, color: '#fff', fontSize: 10, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, overflow: 'hidden', letterSpacing: 0.8 },
  badgeText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  heroTitle: { color: colors.text, fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: -0.8, marginTop: 10, lineHeight: 32 },
  heroMeta: { color: colors.text2, fontSize: 14, marginTop: 8 },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
})
