import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../lib/theme'

export default function Shelf({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
        {children}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28 },
  head: { paddingHorizontal: 18, marginBottom: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  track: { paddingHorizontal: 18, gap: 14 },
})
