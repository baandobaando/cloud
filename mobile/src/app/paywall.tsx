import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '../components/Button'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { errorMessage } from '../lib/api'
import { APPLE_EULA_URL, MEDIA_HEADERS, PRIVACY_URL } from '../lib/config'
import { buy, loadMonthlyOffer, purchasesAvailable, restore, type MonthlyOffer } from '../lib/purchases'
import { useSession } from '../lib/session'
import { colors } from '../lib/theme'

const PERKS = ['Every episode of every series', 'New series every week', 'No ads, no coins, no per-episode unlocks', 'Watch on your phone and on binge.tube']

/** Membership screen: the App Store subscription, with everything Apple requires on a subscription offer. */
export default function Paywall() {
  const insets = useSafeAreaInsets()
  const { me, catalog, syncPurchases } = useSession()
  const [offer, setOffer] = useState<MonthlyOffer | null | undefined>(undefined)
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null)
  const covers = (catalog ?? []).filter((s) => s.posterUrl).slice(0, 6)

  // Purchases belong to an account, so people sign up (or in) first and come straight back here.
  useEffect(() => {
    if (me === null) router.replace({ pathname: '/(auth)/signup', params: { next: '/paywall' } })
  }, [me])

  useEffect(() => {
    loadMonthlyOffer().then(setOffer, () => setOffer(null))
  }, [])

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const done = async () => {
    await syncPurchases()
    Alert.alert('Welcome to BingeTube', 'Every episode is unlocked. Enjoy the binge!', [{ text: 'Start watching', onPress: close }])
  }

  const subscribe = async () => {
    if (!offer) return
    setBusy('buy')
    try {
      if (await buy(offer.pkg)) await done()
    } catch (err) {
      Alert.alert('Purchase failed', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const restorePurchases = async () => {
    setBusy('restore')
    try {
      if (await restore()) await done()
      else Alert.alert('Nothing to restore', 'We couldn’t find a BingeTube subscription for this Apple ID.')
    } catch (err) {
      Alert.alert('Restore failed', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (me?.isEntitled) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Icon name="check" size={40} color={colors.accent} />
        <Text style={styles.title}>You’re a member</Text>
        <Text style={styles.sub}>Every episode of every series is unlocked.</Text>
        <Button title="Start watching" onPress={close} style={{ alignSelf: 'stretch', marginTop: 16 }} />
      </View>
    )
  }

  const trial = offer?.trialDays ?? 0

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={styles.hero}>
          <View style={styles.covers}>
            {covers.map((s, i) => (
              <Image
                key={s.id}
                source={{ uri: s.posterUrl!, headers: MEDIA_HEADERS }}
                style={[styles.cover, { transform: [{ rotate: `${(i - 2.5) * 5}deg` }, { translateY: Math.abs(i - 2.5) * 8 }] }]}
                contentFit="cover"
              />
            ))}
          </View>
          <LinearGradient colors={['transparent', colors.bg]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
          <Pressable onPress={close} style={[styles.close, { top: insets.top + 8 }]} hitSlop={10} accessibilityLabel="Close">
            <Icon name="close" />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Logo size={22} />
          <Text style={styles.title}>{trial ? `Watch everything free for ${trial} days` : 'Unlock every episode'}</Text>
          <Text style={styles.sub}>
            {offer ? (trial ? `Then ${offer.price} a month. Cancel anytime.` : `${offer.price} a month. Cancel anytime.`) : 'One membership for every series.'}
          </Text>

          <View style={styles.perks}>
            {PERKS.map((p) => (
              <View key={p} style={styles.perk}>
                <Icon name="check" size={18} color={colors.accent} />
                <Text style={styles.perkText}>{p}</Text>
              </View>
            ))}
          </View>

          {!purchasesAvailable ? (
            <Text style={styles.notice}>Subscriptions aren’t available in this version of the app.</Text>
          ) : offer === undefined ? (
            <ActivityIndicator color={colors.text} style={{ marginVertical: 24 }} />
          ) : offer === null ? (
            <Text style={styles.notice}>We couldn’t load the subscription from the App Store. Check your connection and try again.</Text>
          ) : (
            <>
              <View style={styles.plan}>
                {trial > 0 && <Text style={styles.badge}>{trial} DAYS FREE</Text>}
                <Text style={styles.planName}>Monthly membership</Text>
                <Text style={styles.planPrice}>
                  {offer.price}
                  <Text style={styles.planPer}> / month</Text>
                </Text>
                {trial > 0 && <Text style={styles.planNote}>Free for {trial} days, then {offer.price} per month</Text>}
              </View>
              <Button title={trial ? 'Start my free trial' : `Subscribe for ${offer.price}/month`} onPress={subscribe} busy={busy === 'buy'} disabled={!!busy} />
            </>
          )}

          <Pressable onPress={restorePurchases} disabled={!!busy || !purchasesAvailable} style={styles.restore}>
            {busy === 'restore' ? <ActivityIndicator color={colors.text2} /> : <Text style={styles.restoreText}>Restore purchases</Text>}
          </Pressable>

          <Text style={styles.legal}>
            {offer
              ? `${trial ? `After the ${trial}-day free trial, ` : ''}${offer.price} per month will be charged to your Apple ID. `
              : 'Payment is charged to your Apple ID at confirmation of purchase. '}
            The subscription renews automatically unless you cancel at least 24 hours before the end of the current period. You can
            manage or cancel it in your Apple ID settings.{trial ? ' Any unused part of the free trial ends when you subscribe.' : ''}
          </Text>
          <View style={styles.links}>
            <Text style={styles.link} onPress={() => Linking.openURL(APPLE_EULA_URL)}>
              Terms of Use
            </Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  hero: { height: 250, overflow: 'hidden' },
  covers: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 56 },
  cover: { width: 92, height: 138, borderRadius: 12, backgroundColor: colors.surface },
  close: { position: 'absolute', right: 16, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  body: { paddingHorizontal: 22, gap: 14, marginTop: -30 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8, lineHeight: 32, textAlign: 'left' },
  sub: { color: colors.text2, fontSize: 16, marginTop: -6 },
  perks: { gap: 10, marginVertical: 6 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkText: { color: colors.text, fontSize: 15 },
  plan: { borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: 'rgba(255,46,77,0.08)', gap: 4 },
  badge: { alignSelf: 'flex-start', color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', marginBottom: 6 },
  planName: { color: colors.text2, fontSize: 14, fontWeight: '600' },
  planPrice: { color: colors.text, fontSize: 30, fontWeight: '800' },
  planPer: { color: colors.text2, fontSize: 16, fontWeight: '500' },
  planNote: { color: colors.text2, fontSize: 13 },
  notice: { color: colors.text2, fontSize: 14, textAlign: 'center', padding: 16, borderRadius: 12, backgroundColor: colors.surface },
  restore: { alignItems: 'center', padding: 10 },
  restoreText: { color: colors.text2, fontSize: 15, fontWeight: '600' },
  legal: { color: colors.muted, fontSize: 11.5, lineHeight: 16, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  link: { color: colors.text2, fontSize: 13, textDecorationLine: 'underline' },
  dot: { color: colors.muted },
})
