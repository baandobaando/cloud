import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../lib/theme'

export default function Shelf({ title, subtitle, onMore, children }: { title: string; subtitle?: string; onMore?: () => void; children: ReactNode }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {onMore && (
          <Pressable onPress={onMore} hitSlop={10}>
            <Text style={styles.more}>See all</Text>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track} decelerationRate="fast">
        {children}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 30 },
  head: { paddingHorizontal: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  more: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  track: { paddingHorizontal: 18, gap: 12 },
})
