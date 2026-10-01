import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { Loading, Notice, PageTitle, SecondaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { colors } from '@/config/theme';
import { fetchCategories, fetchProducts, type CatalogProduct, type ProductQuery } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';

const SORTS: Array<{ id: NonNullable<ProductQuery['sort']>; label: string }> = [
  { id: 'featured', label: 'In evidenza' },
  { id: 'price_asc', label: 'Prezzo crescente' },
  { id: 'price_desc', label: 'Prezzo decrescente' },
  { id: 'name', label: 'Nome A-Z' },
];

export default function CatalogScreen() {
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const { selected } = useStores();
  const { columns } = useLayout();
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(query);
  const [categoryId, setCategoryId] = useState<string | null>(params.category ?? null);
  const [sortIndex, setSortIndex] = useState(0);
  const [sortOpen, setSortOpen] = useState(false);
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);

  useEffect(() => { if (params.category) setCategoryId(params.category); }, [params.category]);
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 300); return () => clearTimeout(t); }, [query]);

  // Reload from page 0 whenever the filters change.
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchProducts({ storeId: selected?.id ?? null, categoryId, search: debounced, sort: SORTS[sortIndex].id, page: 0 })
      .then((r) => { if (active) { setItems(r.items); setHasMore(r.hasMore); setPage(0); setError(null); } })
      .catch((e) => { if (active) setError(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected?.id, categoryId, debounced, sortIndex]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const r = await fetchProducts({ storeId: selected?.id ?? null, categoryId, search: debounced, sort: SORTS[sortIndex].id, page: page + 1 });
      setItems((prev) => [...prev, ...r.items]); setHasMore(r.hasMore); setPage(page + 1);
    } catch (e) { setError(e); } finally { setLoading(false); }
  };

  const catName = (id: string | null) => categories.data?.find((c) => c.id === id)?.name;
  const chips: Array<{ id: string | null; name: string }> = [{ id: null, name: 'Tutte' }, ...(categories.data ?? []).filter((c) => !c.parent_id)];

  return <Screen>
    <PageTitle title="Catalogo" subtitle="Tutto quello che fa casa." />
    <View style={styles.search}><Icon name="search" size={20} color={colors.muted} />
      <TextInput value={query} onChangeText={setQuery} placeholder="Cerca per nome, marca o codice..." placeholderTextColor={colors.faint}
        accessibilityLabel="Cerca prodotti" style={styles.input} returnKeyType="search" autoCorrect={false} />
      {!!query && <Pressable accessibilityLabel="Cancella ricerca" onPress={() => setQuery('')} style={{ padding: 10 }}>
        <Icon name="close" size={16} /></Pressable>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 19 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {chips.map((item) => {
        const on = categoryId === item.id;
        return <Pressable key={item.id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: on }}
          style={[styles.chip, on && styles.chipActive]} onPress={() => setCategoryId(item.id)}>
          <Text style={[styles.chipText, on && { color: '#fff' }]}>{item.name}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <View style={[styles.toolbar, { zIndex: 10 }]}><Text style={styles.count}>{items.length}{hasMore ? '+' : ''} prodotti</Text>
      <View>
        <Pressable onPress={() => setSortOpen((v) => !v)} style={styles.sort} accessibilityRole="button"
          accessibilityState={{ expanded: sortOpen }} accessibilityLabel={`Ordina per: ${SORTS[sortIndex].label}`}>
          <Text style={styles.sortLabel}>Ordina per</Text><Text style={styles.sortText}>{SORTS[sortIndex].label}</Text><Icon name="down" size={14} />
        </Pressable>
        {sortOpen && <View style={styles.menu} accessibilityRole="menu">
          {SORTS.map((o, i) => <Pressable key={o.id} accessibilityRole="menuitem" accessibilityState={{ selected: i === sortIndex }}
            onPress={() => { setSortIndex(i); setSortOpen(false); }} style={[styles.menuItem, i === sortIndex && styles.menuItemOn]}>
            <Text style={[styles.menuText, i === sortIndex && { color: colors.greenDark, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>)}
        </View>}
      </View></View>
    {error && !items.length ? <Notice tone="error" message="Impossibile caricare il catalogo. Controlla la connessione." /> : null}
    {!loading && !error && !items.length && <View style={{ paddingVertical: 48, alignItems: 'center', gap: 16 }}>
      <Icon name="search" size={32} color={colors.muted} />
      <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 22 }}>Nessun prodotto trovato. Prova un'altra ricerca o categoria.</Text>
    </View>}
    <View style={styles.grid}>{items.map((product) => <View key={product.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 6 }}>
      <ProductCard product={product} categoryName={categoryId ? undefined : catName(product.category_id)} /></View>)}</View>
    {loading ? <Loading /> : hasMore ? <View style={{ marginTop: 24 }}><SecondaryButton title="Mostra altri prodotti" onPress={loadMore} /></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ECEEE8', borderRadius: 14, paddingLeft: 15, minHeight: 50 },
  input: { flex: 1, minWidth: 0, paddingVertical: 15, fontSize: 14, color: colors.text, outlineWidth: 0 },
  chip: { borderRadius: 22, minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDEFE9' },
  chipActive: { backgroundColor: colors.green },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.text },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 18 },
  count: { fontSize: 13, color: colors.muted },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  sortLabel: { fontSize: 13, color: colors.muted },
  sortText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  menu: { position: 'absolute', right: 0, top: 46, minWidth: 210, backgroundColor: colors.surface, borderRadius: 14, padding: 6, borderWidth: 1, borderColor: colors.line,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  menuItem: { paddingHorizontal: 12, minHeight: 42, justifyContent: 'center', borderRadius: 10 },
  menuItemOn: { backgroundColor: '#EEF4E7' },
  menuText: { fontSize: 14, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 25 },
});
