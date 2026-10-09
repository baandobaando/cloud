import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text } from 'react-native'
import { needsJoin, startJoin } from '../lib/join'
import { useSession } from '../lib/session'
import { brandGradient } from '../lib/theme'

/** The red "Join now" pill in the top bar. Hidden for members. */
export default function JoinButton({ compact }: { compact?: boolean }) {
  const { me } = useSession()
  if (!needsJoin(me)) return null
  return (
    <Pressable onPress={() => startJoin(me)} style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]} hitSlop={8} accessibilityRole="button">
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.pill, compact && styles.compact]}>
        <Text style={styles.text}>Join now</Text>
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: { height: 34, paddingHorizontal: 16, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#ff2e4d', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  compact: { height: 30, paddingHorizontal: 13 },
  text: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
})
