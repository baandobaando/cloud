import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BrandMark from '../../components/BrandMark'
import Button from '../../components/Button'
import { errorMessage } from '../../lib/api'
import { CONTACT_EMAIL, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../../lib/config'
import { purchasesAvailable, restore } from '../../lib/purchases'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'
import Constants from 'expo-constants'

function Row({ label, value, onPress, danger, busy }: { label: string; value?: string; onPress?: () => void; danger?: boolean; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress || busy} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
      <Text style={[styles.rowLabel, danger && { color: '#f87171' }]}>{label}</Text>
      {busy ? <ActivityIndicator color={colors.muted} /> : value ? <Text style={styles.rowValue}>{value}</Text> : null}
    </Pressable>
  )
}

const longDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

function About() {
  return (
    <>
      <Text style={styles.section}>Help & legal</Text>
      <View style={styles.group}>
        <Row label="Help & Support" onPress={() => Linking.openURL(SUPPORT_URL)} />
        <Row label="Contact us" value={CONTACT_EMAIL} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
        <Row label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <Row label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} />
      </View>
    </>
  )
}

export default function Account() {
  const insets = useSafeAreaInsets()
  const { me, logout, deleteAccount, syncPurchases } = useSession()
  const [restoring, setRestoring] = useState(false)

  const restorePurchases = async () => {
    setRestoring(true)
    try {
      const found = await restore()
      await syncPurchases()
      Alert.alert(found ? 'Purchases restored' : 'Nothing to restore', found ? 'Your membership is active.' : 'We couldn’t find a BingeTube subscription for this Apple ID.')
    } catch (err) {
      Alert.alert('Restore failed', errorMessage(err))
    } finally {
      setRestoring(false)
    }
  }

  if (!me) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}>
        <Text style={styles.title}>Account</Text>
        <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <Text style={styles.name}>Sign in to BingeTube</Text>
          <Text style={[styles.email, { marginBottom: 10 }]}>Save shows to My List, continue where you left off and unlock every episode.</Text>
          <Button title="Create free account" onPress={() => router.push('/(auth)/signup')} />
          <Button title="Sign in" variant="glass" onPress={() => router.push('/(auth)/login')} style={{ marginTop: 10 }} />
        </View>
        <About />
        <View style={styles.footer}>
          <BrandMark size={28} />
          <Text style={styles.version}>BingeTube {Constants.expoConfig?.version ?? ''}</Text>
        </View>
      </ScrollView>
    )
  }

  const sub = me.subscription
  const active = me.isEntitled
  const membership = me.isAdmin && !sub
    ? 'Full access (admin)'
    : !active
      ? 'Not a member'
      : sub?.trialEndsAt
        ? `Free trial until ${longDate(sub.trialEndsAt)}`
        : sub?.cancelAtPeriodEnd && sub.currentPeriodEnd
          ? `Ends ${longDate(sub.currentPeriodEnd)}`
          : sub?.renews && sub.currentPeriodEnd
            ? `Renews ${longDate(sub.currentPeriodEnd)}`
            : sub?.currentPeriodEnd
              ? `Until ${longDate(sub.currentPeriodEnd)}`
              : 'Active'

  const confirmDelete = () =>
    Alert.alert('Delete your account?', `This permanently deletes your account, My List and watch history. This can’t be undone.${sub?.source === 'apple' && sub.renews ? ' Your App Store subscription is billed by Apple: cancel it in Settings so you aren’t charged again.' : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: () => deleteAccount().catch((e) => Alert.alert('Could not delete account', errorMessage(e))),
      },
    ])

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}>
      <Text style={styles.title}>Account</Text>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{me.name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{me.name}</Text>
          <Text style={styles.email}>{me.email}</Text>
        </View>
      </View>

      <Text style={styles.section}>Membership</Text>
      <View style={styles.group}>
        <Row label="Status" value={membership} />
        {!active && <Row label={me.trialEligible ? 'Start free trial' : 'Become a member'} onPress={() => router.push('/paywall')} />}
        {sub?.source === 'apple' && (
          <Row label="Manage subscription" onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')} />
        )}
        {purchasesAvailable && <Row label="Restore purchases" onPress={restorePurchases} busy={restoring} />}
      </View>

      <About />

      <Text style={styles.section}>Account</Text>
      <View style={styles.group}>
        <Row label="Sign out" onPress={() => logout()} />
        <Row label="Delete account" danger onPress={confirmDelete} />
      </View>

      <View style={styles.footer}>
        <BrandMark size={28} />
        <Text style={styles.version}>BingeTube {Constants.expoConfig?.version ?? ''}</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, paddingHorizontal: 18, marginBottom: 18 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 18, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { color: colors.text, fontSize: 18, fontWeight: '700' },
  email: { color: colors.muted, fontSize: 14, marginTop: 2 },
  section: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 22, marginTop: 28, marginBottom: 8 },
  group: { marginHorizontal: 18, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLabel: { color: colors.text, fontSize: 16 },
  rowValue: { color: colors.muted, fontSize: 14 },
  footer: { alignItems: 'center', gap: 8, marginTop: 36 },
  version: { color: colors.muted, fontSize: 12 },
})
