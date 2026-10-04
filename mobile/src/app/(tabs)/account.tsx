import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BrandMark from '../../components/BrandMark'
import { errorMessage } from '../../lib/api'
import { PRIVACY_URL, TERMS_URL } from '../../lib/config'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'
import Constants from 'expo-constants'

function Row({ label, value, onPress, danger }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
      <Text style={[styles.rowLabel, danger && { color: '#f87171' }]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
    </Pressable>
  )
}

export default function Account() {
  const insets = useSafeAreaInsets()
  const { me, logout, deleteAccount } = useSession()
  if (!me) return null

  const confirmDelete = () =>
    Alert.alert('Delete your account?', 'This permanently deletes your account, profiles, My List and watch history. This can’t be undone.', [
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

      <Text style={styles.section}>About</Text>
      <View style={styles.group}>
        <Row label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <Row label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} />
        <Row label="Contact us" value="bingetubee@gmail.com" onPress={() => Linking.openURL('mailto:bingetubee@gmail.com')} />
      </View>

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
