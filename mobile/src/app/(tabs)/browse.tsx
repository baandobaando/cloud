import { useMemo, useState } from 'react'
import { ScrollView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ErrorView, Loading } from '../../components/Feedback'
import Grid from '../../components/Grid'
import Icon from '../../components/Icon'
import { useSession } from '../../lib/session'
import { colors } from '../../lib/theme'
import { GENRES, type Genre } from '../../lib/types'

const PAGE = 30

export default function Browse() {
  const insets = useSafeAreaInsets()
  const { catalog, catalogError, reloadCatalog } = useSession()
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState<Genre | null>(null)
  const [shown, setShown] = useState(PAGE)

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (catalog ?? []).filter(
      (s) => (!genre || s.genres.includes(genre)) && (!needle || `${s.title} ${s.tagline} ${s.genres.join(' ')}`.toLowerCase().includes(needle)),
    )
  }, [catalog, q, genre])

  if (catalogError && !catalog) return <ErrorView message={catalogError} onRetry={reloadCatalog} />
  if (!catalog) return <Loading />

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32 }}
      keyboardDismissMode="on-drag"
      onScroll={(e) => {
        const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
        if (layoutMeasurement.height + contentOffset.y > contentSize.height - 600 && shown < results.length) setShown((n) => n + PAGE)
      }}
      scrollEventThrottle={200}
    >
      <Text style={styles.title}>Browse</Text>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.input}
          placeholder="Search titles, genres, tropes…"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={(t) => {
            setQ(t)
            setShown(PAGE)
          }}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {[null, ...GENRES].map((g) => (
          <Pressable
            key={g ?? 'all'}
            onPress={() => {
              setGenre(g)
              setShown(PAGE)
            }}
            style={[styles.chip, genre === g && styles.chipOn]}
          >
            <Text style={[styles.chipText, genre === g && styles.chipTextOn]}>{g ?? 'All'}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.count}>
        {results.length} series{genre ? ` in ${genre}` : ''}
      </Text>
      {results.length === 0 ? <Text style={styles.empty}>Nothing matches that search.</Text> : <Grid items={results.slice(0, shown)} />}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, paddingHorizontal: 18, marginBottom: 14 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: { flex: 1, color: colors.text, fontSize: 16 },
  chips: { paddingHorizontal: 18, gap: 8, paddingVertical: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text2, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  count: { color: colors.muted, fontSize: 13, paddingHorizontal: 18, marginBottom: 14 },
  empty: { color: colors.text2, textAlign: 'center', marginTop: 40 },
})
