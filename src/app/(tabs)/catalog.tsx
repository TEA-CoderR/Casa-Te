import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { PageTitle } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { products } from '@/data/products';
import { colors } from '@/config/theme';
export default function CatalogScreen() {
  const params = useLocalSearchParams<{ category?: string; focus?: string }>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(params.category ?? 'Tutte');
  const [sort, setSort] = useState(false);
  const searchRef = useRef<TextInput>(null);
  useEffect(() => {
    if (params.category) setCategory(params.category);
    else if (params.focus === 'search') setCategory('Tutte');
  }, [params.category, params.focus]);
  useFocusEffect(useCallback(() => {
    if (params.focus !== 'search') return;
    const timer = setTimeout(() => searchRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [params.focus]));
  const categories = ['Tutte', ...new Set(products.map((p) => p.category))];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = products.filter((p) => (category === 'Tutte' || p.category === category) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.category.toLowerCase().includes(needle)));
    return sort ? [...list].sort((a, b) => a.price - b.price) : list;
  }, [category, query, sort]);
  return <Screen>
    <PageTitle title="Catalogo" subtitle="Tutto quello che fa casa." />
    <View style={styles.search}><Icon name="search" size={20} color={colors.muted} />
      <TextInput ref={searchRef} value={query} onChangeText={setQuery} placeholder="Cerca prodotti..." placeholderTextColor={colors.muted}
        accessibilityLabel="Cerca prodotti" style={styles.input} returnKeyType="search" />
      {!!query && <Pressable accessibilityLabel="Cancella ricerca" onPress={() => setQuery('')} style={{ padding: 10 }}>
        <Icon name="close" size={16} /></Pressable>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 19 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {categories.map((item) => <Pressable key={item} accessibilityRole="button"
        accessibilityState={{ selected: category === item }}
        style={[styles.chip, category === item && styles.chipActive]} onPress={() => setCategory(item)}>
        <Text style={[styles.chipText, category === item && { color: '#fff' }]}>{item}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={styles.toolbar}><Text style={styles.count}>{filtered.length} prodotti</Text>
      <Pressable onPress={() => setSort(!sort)} style={styles.sort} accessibilityRole="button">
        <Text style={styles.sortText}>{sort ? 'Prezzo crescente' : 'In evidenza'}</Text><Icon name="down" size={14} />
      </Pressable></View>
    {!filtered.length && <View style={{ paddingVertical: 48, alignItems: 'center', gap: 16 }}>
      <Icon name="search" size={32} color={colors.muted} />
      <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 22 }}>Nessun prodotto trovato. Prova un'altra ricerca o categoria.</Text>
    </View>}
    <View style={styles.grid}>{filtered.map((product) => <View key={product.id} style={styles.half}><ProductCard product={product} /></View>)}</View>
  </Screen>;
}
const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ECEEE8', borderRadius: 14, paddingLeft: 15, minHeight: 50 },
  input: { flex: 1, minWidth: 0, paddingVertical: 15, fontSize: 14, color: colors.text, outlineWidth: 0 },
  chip: { borderRadius: 22, minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDEFE9' },
  chipActive: { backgroundColor: colors.green },
  chipText: { fontSize: 12, fontWeight: '500', color: colors.muted },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 18 },
  count: { fontSize: 12, color: colors.muted },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 },
  sortText: { fontSize: 12, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 25 },
  half: { width: '50%', paddingHorizontal: 6 },
});

