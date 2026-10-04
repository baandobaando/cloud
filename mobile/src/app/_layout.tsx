import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider, useSession } from '../lib/session'
import { colors } from '../lib/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

function RootStack() {
  const { me } = useSession()
  const ready = me !== undefined
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])
  if (!ready) return null

  // Members-only app: signed-out people only see the welcome and sign-in screens.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
      <Stack.Protected guard={!!me}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="series/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="watch/[id]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!me}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <RootStack />
      </SessionProvider>
    </SafeAreaProvider>
  )
}
