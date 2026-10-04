import { Dimensions, StyleSheet, View } from 'react-native'
import type { SeriesSummary } from '../lib/types'
import SeriesCard from './SeriesCard'

const { width } = Dimensions.get('window')
export const GRID_GAP = 12
export const GRID_CARD = Math.floor((width - 18 * 2 - GRID_GAP * 2) / 3)

/** Three-column grid of series cards. */
export default function Grid({ items }: { items: SeriesSummary[] }) {
  return (
    <View style={styles.grid}>
      {items.map((s) => (
        <SeriesCard key={s.id} series={s} width={GRID_CARD} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, rowGap: 20, paddingHorizontal: 18 },
})
