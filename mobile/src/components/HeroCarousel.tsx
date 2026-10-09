import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MEDIA_HEADERS } from '../lib/config'
import { useSession } from '../lib/session'
import { colors } from '../lib/theme'
import type { SeriesSummary } from '../lib/types'
import Button from './Button'
import Cover from './Cover'
import Icon from './Icon'

const AUTO_ADVANCE_MS = 5500

/** Swipeable, auto-advancing showcase of the top series at the top of Home. */
export default function HeroCarousel({ items }: { items: SeriesSummary[] }) {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { progress, myList, toggleMyList } = useSession()
  const [index, setIndex] = useState(0)
  const [touching, setTouching] = useState(false)
  const list = useRef<FlatList<SeriesSummary>>(null)
  const coverW = Math.round(width * 0.48)

  useEffect(() => {
    if (touching || items.length < 2) return
    const t = setTimeout(() => {
      const next = (index + 1) % items.length
      list.current?.scrollToIndex({ index: next, animated: true })
      setIndex(next)
    }, AUTO_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [index, touching, items.length])

  return (
    <View>
      <FlatList
        ref={list}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.id}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScrollBeginDrag={() => setTouching(true)}
        onScrollEndDrag={() => setTouching(false)}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => {
          const resume = progress[item.id]?.episodeNumber
          const inList = myList.includes(item.id)
          const open = () => router.push({ pathname: '/series/[id]', params: { id: item.id } })
          return (
            <View style={[styles.slide, { width, paddingTop: insets.top + 62 }]}>
              {item.posterUrl && (
                <Image source={{ uri: item.posterUrl, headers: MEDIA_HEADERS }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} cachePolicy="memory-disk" />
              )}
              <LinearGradient colors={['rgba(10,10,11,0.35)', 'rgba(10,10,11,0.55)', colors.bg]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
              <Pressable onPress={open}>
                <Cover series={item} style={[styles.cover, { width: coverW, height: coverW * (16 / 9) }]} radius={16} />
              </Pressable>
              <View style={styles.badges}>
                {item.trendingRank ? (
                  <>
                    <Text style={styles.top10}>TOP 10</Text>
                    <Text style={styles.badgeText}>#{item.trendingRank} today</Text>
                  </>
                ) : item.isNew ? (
                  <Text style={styles.top10}>NEW</Text>
                ) : null}
                {i === 0 && !item.trendingRank && !item.isNew && <Text style={styles.badgeText}>Featured</Text>}
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.genres.slice(0, 2).join('  •  ')}  •  {item.episodeCount} episodes
              </Text>
              <View style={styles.actions}>
                <Pressable onPress={() => toggleMyList(item.id)} style={styles.side} hitSlop={8}>
                  <Icon name={inList ? 'check' : 'plus'} size={22} />
                  <Text style={styles.sideText}>My List</Text>
                </Pressable>
                <Button
                  title={resume ? `Resume ep ${resume}` : 'Play'}
                  variant="light"
                  icon={<Icon name="play" size={18} color={colors.bg} />}
                  onPress={() => router.push({ pathname: '/watch/[id]', params: { id: item.id, ep: String(resume ?? 1) } })}
                  style={{ flex: 1 }}
                />
                <Pressable onPress={open} style={styles.side} hitSlop={8}>
                  <Icon name="info" size={22} />
                  <Text style={styles.sideText}>Info</Text>
                </Pressable>
              </View>
            </View>
          )
        }}
      />
      {items.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {items.map((s, i) => (
            <View key={s.id} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  slide: { alignItems: 'center', paddingHorizontal: 22, paddingBottom: 6, overflow: 'hidden' },
  cover: { shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, minHeight: 20 },
  top10: { backgroundColor: colors.accent, color: '#fff', fontSize: 10, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, overflow: 'hidden', letterSpacing: 0.8 },
  badgeText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: -0.8, marginTop: 8, lineHeight: 32 },
  meta: { color: colors.text2, fontSize: 13.5, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18, alignSelf: 'stretch' },
  side: { alignItems: 'center', width: 52, gap: 3 },
  sideText: { color: colors.text2, fontSize: 11, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotOn: { width: 18, backgroundColor: colors.accent },
})
