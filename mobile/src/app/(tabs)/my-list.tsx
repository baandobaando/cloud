import { router } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '../../components/Button'
import Grid from '../../components/Grid'
import Icon from '../../components/Icon'
import JoinButton from '../../components/JoinButton'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'

export default function MyList() {
  const insets = useSafeAreaInsets()
  const { me, catalog, myList } = useSession()
  const byId = new Map((catalog ?? []).map((s) => [s.id, s]))
  const items = myList.map((id) => byId.get(id)).filter((s) => !!s)

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, flexGrow: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 18 }}>
        <Text style={styles.title}>My List</Text>
        <JoinButton />
      </View>
      {!me ? (
        <View style={styles.empty}>
          <Icon name="bookmark" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Save shows for later</Text>
          <Text style={styles.emptyText}>Create a free account to keep a list of shows and pick up where you left off.</Text>
          <Button title="Create free account" onPress={() => router.push('/(auth)/signup')} style={{ marginTop: 10, alignSelf: 'stretch' }} />
          <Button title="Sign in" variant="glass" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="bookmark" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyText}>Tap “My List” on any series to save it here for later.</Text>
          <Button title="Find something to watch" variant="glass" onPress={() => router.navigate('/(tabs)/browse')} style={{ marginTop: 10 }} />
        </View>
      ) : (
        <Grid items={items} />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, paddingHorizontal: 18, marginBottom: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
})
