import { StyleSheet, Text, View } from 'react-native'
import BrandMark from './BrandMark'
import { colors } from '../lib/theme'

export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <BrandMark size={size * 1.25} />
      <Text style={[styles.word, { fontSize: size }]}>
        binge<Text style={styles.tube}>tube</Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  word: { color: colors.text, fontWeight: '800', letterSpacing: -0.8 },
  tube: { color: colors.accent },
})
