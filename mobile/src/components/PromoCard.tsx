import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { needsJoin, startJoin } from '../lib/join'
import { useSession } from '../lib/session'
import Icon from './Icon'

/** Membership pitch between the shelves on Home, for anyone who isn't a member. */
export default function PromoCard() {
  const { me } = useSession()
  if (!needsJoin(me)) return null
  const trial = me?.trialEligible !== false
  return (
    <Pressable onPress={() => startJoin(me)} style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.9 }]}>
      <LinearGradient colors={['#ff2e4d', '#b3122f', '#3a0612']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Text style={styles.kicker}>{trial ? '3 DAYS FREE' : 'BINGETUBE MEMBERSHIP'}</Text>
        <Text style={styles.title}>Every episode. Every series.{'\n'}No ads. No coins.</Text>
        <View style={styles.points}>
          {['New episodes daily', 'Cancel anytime', 'Watch on phone & web'].map((p) => (
            <View key={p} style={styles.point}>
              <Icon name="check" size={14} />
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{trial ? 'Start my free trial' : 'Join now'}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 18, marginTop: 30 },
  card: { borderRadius: 20, padding: 20, overflow: 'hidden' },
  kicker: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.6, lineHeight: 27, marginTop: 6 },
  points: { marginTop: 12, gap: 6 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cta: { marginTop: 16, height: 46, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#1a0509', fontSize: 16, fontWeight: '800' },
})
