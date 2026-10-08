import * as AppleAuthentication from 'expo-apple-authentication'
import * as Haptics from 'expo-haptics'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { Cancelled, loadProviders, type Providers, type SocialProvider } from '../lib/social'
import { colors } from '../lib/theme'

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  )
}

function FacebookLogo() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Path
        fill="#fff"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.23 2.68.23v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
      />
    </Svg>
  )
}

/** "Continue with Apple / Google / Facebook", then an "or use email" divider. Renders nothing if none are available. */
export default function SocialButtons({ onSignedIn, onError }: { onSignedIn: () => void; onError: (message: string | null) => void }) {
  const { signInWith } = useSession()
  const [providers, setProviders] = useState<Providers | null>(null)
  const [busy, setBusy] = useState<SocialProvider | null>(null)

  useEffect(() => {
    loadProviders().then(setProviders)
  }, [])

  const go = async (p: SocialProvider) => {
    if (busy) return
    onError(null)
    setBusy(p)
    try {
      await signInWith(p)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      onSignedIn()
    } catch (e) {
      if (!(e instanceof Cancelled)) onError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  if (!providers || (!providers.apple && !providers.google && !providers.facebook)) return null

  return (
    <View style={styles.wrap}>
      {providers.apple && (
        <View>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={12}
            style={styles.apple}
            onPress={() => go('apple')}
          />
          {busy === 'apple' && (
            <View style={styles.cover}>
              <ActivityIndicator color={colors.bg} />
            </View>
          )}
        </View>
      )}
      {providers.google && (
        <Pressable onPress={() => go('google')} style={({ pressed }) => [styles.btn, styles.google, pressed && styles.pressed]} accessibilityRole="button">
          {busy === 'google' ? <ActivityIndicator color="#1f1f1f" /> : <GoogleLogo />}
          <Text style={[styles.label, { color: '#1f1f1f' }]}>Continue with Google</Text>
        </Pressable>
      )}
      {providers.facebook && (
        <Pressable onPress={() => go('facebook')} style={({ pressed }) => [styles.btn, styles.facebook, pressed && styles.pressed]} accessibilityRole="button">
          {busy === 'facebook' ? <ActivityIndicator color="#fff" /> : <FacebookLogo />}
          <Text style={[styles.label, { color: '#fff' }]}>Continue with Facebook</Text>
        </Pressable>
      )}
      <View style={styles.or}>
        <View style={styles.line} />
        <Text style={styles.orText}>or use email</Text>
        <View style={styles.line} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  apple: { height: 52, width: '100%' },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 12 },
  btn: { height: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  google: { backgroundColor: '#fff' },
  facebook: { backgroundColor: '#1877F2' },
  pressed: { opacity: 0.85 },
  label: { fontSize: 17, fontWeight: '600' },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  orText: { color: colors.muted, fontSize: 13 },
})
