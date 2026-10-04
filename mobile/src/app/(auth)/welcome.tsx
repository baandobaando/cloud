import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Dimensions, Linking, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '../../components/Button'
import Logo from '../../components/Logo'
import { api } from '../../lib/api'
import { MEDIA_HEADERS, PRIVACY_URL, TERMS_URL } from '../../lib/config'
import { colors } from '../../lib/theme'
import type { SeriesSummary } from '../../lib/types'

const { width } = Dimensions.get('window')
const TILE = (width - 16 * 2 - 10 * 2) / 3

/** First screen: a wall of covers and the two ways in. */
export default function Welcome() {
  const insets = useSafeAreaInsets()
  const [covers, setCovers] = useState<string[]>([])
  useEffect(() => {
    api
      .get<SeriesSummary[]>('/catalog')
      .then((c) => setCovers(c.filter((s) => s.posterUrl).slice(0, 12).map((s) => s.posterUrl!)))
      .catch(() => {})
  }, [])

  return (
    <View style={styles.root}>
      <View style={[styles.wall, { top: insets.top - 30 }]}>
        {covers.map((uri, i) => (
          <Image
            key={uri}
            source={{ uri, headers: MEDIA_HEADERS }}
            style={[styles.tile, i % 3 === 1 && { transform: [{ translateY: 40 }] }]}
            contentFit="cover"
            transition={300}
          />
        ))}
      </View>
      <LinearGradient
        colors={['rgba(10,10,11,0.1)', 'rgba(10,10,11,0.75)', colors.bg]}
        locations={[0, 0.45, 0.72]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient colors={['rgba(255,46,77,0.35)', 'transparent']} start={{ x: 0, y: 1 }} end={{ x: 0.6, y: 0.4 }} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Logo size={30} />
        <Text style={styles.headline}>Your next obsession is ninety seconds long.</Text>
        <Text style={styles.sub}>Billionaires, revenge, werewolves and mafia, in short vertical episodes. Create a free account to start watching.</Text>
        <Button title="Create free account" onPress={() => router.push('/(auth)/signup')} />
        <Button title="I already have an account" variant="glass" onPress={() => router.push('/(auth)/login')} />
        <Text style={styles.legal}>
          By continuing you agree to our{' '}
          <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
            Terms
          </Text>{' '}
          and{' '}
          <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  wall: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: TILE, height: TILE * 1.5, borderRadius: 12, backgroundColor: colors.surface },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 22, gap: 14 },
  headline: { color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1, lineHeight: 36, marginTop: 8 },
  sub: { color: colors.text2, fontSize: 15, lineHeight: 21, marginBottom: 8 },
  legal: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 },
  link: { color: colors.text2, textDecorationLine: 'underline' },
})
