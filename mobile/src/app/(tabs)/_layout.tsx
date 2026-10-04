import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import Icon, { type IconName } from '../../components/Icon'
import { colors } from '../../lib/theme'

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: ColorValue }) => <Icon name={icon} size={22} color={String(color)} />,
})

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: 'rgba(10,10,11,0.97)', borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home')} />
      <Tabs.Screen name="browse" options={tab('Browse', 'search')} />
      <Tabs.Screen name="my-list" options={tab('My List', 'bookmark')} />
      <Tabs.Screen name="account" options={tab('Account', 'user')} />
    </Tabs>
  )
}
