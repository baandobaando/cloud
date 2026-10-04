import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { colors } from '../lib/theme'
import Button from './Button'
import Icon from './Icon'
import Logo from './Logo'

/** Shared sign-in / sign-up screen. */
export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const insets = useSafeAreaInsets()
  const { login, signup } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'

  const submit = async () => {
    setError(null)
    if (isSignup && password.length < 8) return setError('Password needs at least 8 characters')
    setBusy(true)
    try {
      if (isSignup) await signup(name.trim() || email.split('@')[0], email.trim(), password)
      else await login(email.trim(), password)
      // The root layout switches to the app once signed in.
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
            <Icon name="back" />
          </Pressable>
          <Logo size={20} />
          <View style={{ width: 40 }} />
        </View>

        <Text style={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
        <Text style={styles.sub}>{isSignup ? 'Free to join. Start watching in seconds.' : 'Sign in to keep watching where you left off.'}</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {isSignup && (
          <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={colors.muted} value={name} onChangeText={setName} textContentType="name" autoComplete="name" maxLength={40} />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder={isSignup ? 'Password (8+ characters)' : 'Password'}
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType={isSignup ? 'newPassword' : 'password'}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <Button title={isSignup ? 'Create account' : 'Sign in'} onPress={submit} busy={busy} disabled={!email || !password} style={{ marginTop: 6 }} />

        <Pressable onPress={() => router.replace(isSignup ? '/(auth)/login' : '/(auth)/signup')} style={styles.switch}>
          <Text style={styles.switchText}>
            {isSignup ? 'Already have an account? ' : 'New to BingeTube? '}
            <Text style={styles.switchLink}>{isSignup ? 'Sign in' : 'Create one'}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 22, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  sub: { color: colors.text2, fontSize: 15, marginBottom: 10 },
  error: { color: '#fecaca', backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.4)', borderWidth: 1, borderRadius: 10, padding: 12, overflow: 'hidden' },
  input: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontSize: 16,
  },
  switch: { alignItems: 'center', marginTop: 10, padding: 8 },
  switchText: { color: colors.muted, fontSize: 14 },
  switchLink: { color: colors.text, fontWeight: '700' },
})
