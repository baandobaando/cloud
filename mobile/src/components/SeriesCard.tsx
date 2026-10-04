import { router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../lib/theme'
import type { SeriesSummary } from '../lib/types'
import Cover from './Cover'

interface Props {
  series: SeriesSummary
  width: number
  rank?: number
  /** Episode the viewer is on, to show a resume line and open the player directly. */
  resumeEpisode?: number
}

export default function SeriesCard({ series, width, rank, resumeEpisode }: Props) {
  const open = () =>
    resumeEpisode
      ? router.push({ pathname: '/watch/[id]', params: { id: series.id, ep: String(resumeEpisode) } })
      : router.push({ pathname: '/series/[id]', params: { id: series.id } })
  return (
    <Pressable onPress={open} style={({ pressed }) => [{ width, opacity: pressed ? 0.8 : 1 }]}>
      <View>
        <Cover series={series} style={{ width, height: width * (4 / 3) }} />
        {rank !== undefined && <Text style={styles.rank}>{rank}</Text>}
        {resumeEpisode !== undefined && (
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${Math.min(100, (resumeEpisode / Math.max(1, series.episodeCount)) * 100)}%` }]} />
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {series.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {resumeEpisode ? `Episode ${resumeEpisode} of ${series.episodeCount}` : `${series.genres[0] ?? 'Drama'} · ${series.episodeCount} eps`}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 13.5, fontWeight: '600', marginTop: 8, lineHeight: 18 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  rank: {
    position: 'absolute',
    left: 6,
    bottom: -6,
    fontSize: 54,
    fontWeight: '900',
    color: colors.bg,
    textShadowColor: 'rgba(255,255,255,0.85)',
    textShadowRadius: 2,
    letterSpacing: -4,
  },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill: { height: 3, backgroundColor: colors.accent },
})
