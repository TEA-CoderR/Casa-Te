import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { Loading, Notice, SecondaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/config/theme';
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
  const params = useLocalSearchParams<{ category?: string; q?: string; search?: string }>();
  const { selected } = useStores();
  const { columns } = useLayout();
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(query);
  const [categoryId, setCategoryId] = useState<string | null>(params.category ?? null);
  const [sortIndex, setSortIndex] = useState(0);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(Boolean(params.q || params.search));
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  // Close the sort menu with Escape (web keyboard users).
  useEffect(() => {
    if (!sortOpen || typeof window === 'undefined' || !window.addEventListener) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSortOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sortOpen]);
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);

  useEffect(() => { if (params.category) setCategoryId(params.category); }, [params.category]);
  useEffect(() => { if (params.search) setSearchOpen(true); }, [params.search]);
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

  const chips: Array<{ id: string | null; name: string }> = [{ id: null, name: 'Tutti' }, ...(categories.data ?? []).filter((c) => !c.parent_id)];
  const title = categories.data?.find((c) => c.id === categoryId)?.name ?? 'Catalogo';
  const sortId = SORTS[sortIndex].id;
  const shown = onlyAvailable ? items.filter((p) => p.stock === null || p.stock > 0) : items;
  const togglePrice = () => setSortIndex(SORTS.findIndex((o) => o.id === (sortId === 'price_asc' ? 'price_desc' : 'price_asc')));

  return <Screen contentContainerStyle={{ paddingTop: 4 }}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Indietro" style={styles.iconButton}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Icon name="back" size={24} strokeWidth={1.6} /></Pressable>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={searchOpen ? 'Chiudi ricerca' : 'Cerca prodotti'} accessibilityState={{ expanded: searchOpen }}
        style={styles.iconButton} onPress={() => { if (searchOpen) setQuery(''); setSearchOpen(!searchOpen); }}>
        <Icon name={searchOpen ? 'close' : 'search'} size={22} strokeWidth={1.6} /></Pressable>
    </View>
    {searchOpen && <View style={styles.search}><Icon name="search" size={19} color={colors.muted} />
      <TextInput value={query} onChangeText={setQuery} placeholder="Cerca per nome, marca o codice..." placeholderTextColor={colors.faint} autoFocus={!params.q}
        accessibilityLabel="Cerca prodotti" style={styles.input} returnKeyType="search" autoCorrect={false} />
      {!!query && <Pressable accessibilityLabel="Cancella ricerca" onPress={() => setQuery('')} style={{ padding: 10 }}>
        <Icon name="close" size={16} /></Pressable>}
    </View>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 22 }}>
      {chips.map((item) => {
        const on = categoryId === item.id;
        return <Pressable key={item.id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: on }}
          style={[styles.chip, on && styles.chipActive]} onPress={() => setCategoryId(item.id)}>
          <Text style={[styles.chipText, on && { color: colors.text, fontFamily: fonts.sansSemiBold, fontWeight: '600' }]}>{item.name}</Text>
        </Pressable>;
      })}
    </ScrollView>

    <View style={[styles.pills, { zIndex: 10 }]}>
      <View>
        <Pressable onPress={() => setSortOpen((v) => !v)} style={[styles.pill, sortOpen && styles.pillOn]} accessibilityRole="button"
          accessibilityState={{ expanded: sortOpen }} accessibilityLabel={`Ordina per: ${SORTS[sortIndex].label}`}>
          <Icon name="sort" size={15} /><Text style={styles.pillText}>{sortIndex === 0 ? 'Ordina' : SORTS[sortIndex].label}</Text><Icon name="down" size={13} />
        </Pressable>
        {sortOpen && <View style={styles.menu} accessibilityRole="menu">
          {SORTS.map((o, i) => <Pressable key={o.id} accessibilityRole="menuitem" accessibilityState={{ selected: i === sortIndex }}
            onPress={() => { setSortIndex(i); setSortOpen(false); }} style={[styles.menuItem, i === sortIndex && styles.menuItemOn]}>
            <Text style={[styles.menuText, i === sortIndex && { color: colors.greenDark, fontFamily: fonts.sansSemiBold, fontWeight: '600' }]}>{o.label}</Text>
          </Pressable>)}
        </View>}
      </View>
      <Pressable onPress={togglePrice} style={[styles.pill, (sortId === 'price_asc' || sortId === 'price_desc') && styles.pillOn]} accessibilityRole="button"
        accessibilityLabel={sortId === 'price_asc' ? 'Prezzo crescente, tocca per decrescente' : 'Ordina per prezzo'}>
        <Text style={styles.pillText}>Prezzo</Text><Icon name="down" size={13} />
        {sortId === 'price_asc' && <Text style={styles.pillHint}>↑</Text>}{sortId === 'price_desc' && <Text style={styles.pillHint}>↓</Text>}
      </Pressable>
      <Pressable onPress={() => setOnlyAvailable(!onlyAvailable)} style={[styles.pill, onlyAvailable && styles.pillOn]}
        accessibilityRole="checkbox" accessibilityState={{ checked: onlyAvailable }}>
        {onlyAvailable && <Icon name="check" size={14} />}<Text style={styles.pillText}>Disponibili</Text>
      </Pressable>
    </View>

    <View style={styles.toolbar}>
      <Text style={styles.count}>{shown.length}{hasMore ? '+' : ''} prodotti</Text>
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup" accessibilityLabel="Vista">
        {(['grid', 'list'] as const).map((v) => <Pressable key={v} onPress={() => setView(v)} accessibilityRole="radio"
          accessibilityState={{ checked: view === v }} accessibilityLabel={v === 'grid' ? 'Vista a griglia' : 'Vista a elenco'}
          style={[styles.viewButton, view === v && styles.viewButtonOn]}>
          <Icon name={v} size={19} strokeWidth={1.5} color={view === v ? colors.text : colors.faint} /></Pressable>)}
      </View>
    </View>
    {error && !items.length ? <Notice tone="error" message="Impossibile caricare il catalogo. Controlla la connessione." /> : null}
    {!loading && !error && !shown.length && <View style={{ paddingVertical: 48, alignItems: 'center', gap: 16 }}>
      <Icon name="search" size={32} color={colors.muted} />
      <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 22, fontFamily: fonts.sans }}>Nessun prodotto trovato. Prova un'altra ricerca o categoria.</Text>
    </View>}
    {view === 'grid'
      ? <View style={styles.grid}>{shown.map((product) => <View key={product.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 6, flexDirection: 'row' }}>
          <ProductCard product={product} /></View>)}</View>
      : <View style={columns > 2 ? { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 } : undefined}>{shown.map((product) =>
          <View key={product.id} style={columns > 2 ? { width: '48%' } : undefined}><ProductCard product={product} variant="list" /></View>)}</View>}
    {loading ? <Loading /> : hasMore ? <View style={{ marginTop: 24 }}><SecondaryButton title="Mostra altri prodotti" onPress={loadMore} /></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 24, fontFamily: fonts.serif, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 999, paddingLeft: 18,
    minHeight: 48, borderWidth: 1, borderColor: colors.line, marginBottom: 6 },
  input: { flex: 1, minWidth: 0, paddingVertical: 14, fontSize: 15, color: colors.text, outlineWidth: 0, fontFamily: fonts.sans },
  tabs: { marginHorizontal: -20, borderBottomWidth: 1, borderColor: colors.line, flexGrow: 0 },
  chip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  chipActive: { borderColor: colors.text },
  chipText: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  pillOn: { borderColor: colors.text },
  pillText: { fontSize: 13, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  pillHint: { fontSize: 13, color: colors.text, fontFamily: fonts.sans },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 },
  count: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans },
  viewButton: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  viewButtonOn: { backgroundColor: colors.cream },
  menu: { position: 'absolute', left: 0, top: 44, minWidth: 210, backgroundColor: colors.surface, borderRadius: 14, padding: 6, borderWidth: 1, borderColor: colors.line,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  menuItem: { paddingHorizontal: 12, minHeight: 42, justifyContent: 'center', borderRadius: 10 },
  menuItemOn: { backgroundColor: colors.cream },
  menuText: { fontSize: 14, color: colors.text, fontFamily: fonts.sans },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 12 },
});
