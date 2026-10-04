import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors } from '../lib/theme'
import Button from './Button'

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  )
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.text}>{message}</Text>
      {onRetry && <Button title="Try again" variant="glass" onPress={onRetry} style={{ marginTop: 16, alignSelf: 'center' }} />}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  text: { color: colors.text2, fontSize: 15, textAlign: 'center' },
})
