import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { MEDIA_HEADERS } from '../lib/config'
import { colors } from '../lib/theme'
import type { SeriesSummary } from '../lib/types'

/** A series cover (Bunny thumbnail) with a tinted fallback showing the title. */
export default function Cover({ series, style, radius = 12 }: { series: SeriesSummary; style?: StyleProp<ViewStyle>; radius?: number }) {
  return (
    <View style={[styles.box, { borderRadius: radius }, style]}>
      <LinearGradient colors={[series.palette[0] ?? '#3a0d1a', '#0d0d0f']} style={StyleSheet.absoluteFill} />
      <Text style={styles.fallback} numberOfLines={3}>
        {series.title}
      </Text>
      {series.posterUrl && (
        <Image
          source={{ uri: series.posterUrl, headers: MEDIA_HEADERS }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={series.id}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'flex-end' },
  fallback: { color: colors.text2, fontWeight: '600', fontSize: 13, margin: 10 },
})
