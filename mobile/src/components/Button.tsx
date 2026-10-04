import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { brandGradient, colors } from '../lib/theme'

interface Props {
  title: string
  onPress: () => void
  variant?: 'accent' | 'light' | 'glass'
  icon?: ReactNode
  busy?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export default function Button({ title, onPress, variant = 'accent', icon, busy, disabled, style }: Props) {
  const content = (
    <View style={styles.inner}>
      {busy ? <ActivityIndicator color={variant === 'light' ? colors.bg : '#fff'} /> : icon}
      <Text style={[styles.text, variant === 'light' && { color: colors.bg }]}>{title}</Text>
    </View>
  )
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.base, variant === 'light' && styles.light, variant === 'glass' && styles.glass, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {variant === 'accent' ? (
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { minHeight: 50, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
  fill: { flex: 1, justifyContent: 'center', minHeight: 50 },
  light: { backgroundColor: '#fff' },
  glass: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  text: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
