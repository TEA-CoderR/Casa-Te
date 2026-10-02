import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { EMPTY_FILTERS, FilterSheet, type FilterSection, type Filters } from '@/components/FilterSheet';
import { Loading, Notice, SecondaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchFacets, fetchProducts, type CatalogProduct } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';

export default function CatalogScreen() {
  const params = useLocalSearchParams<{ category?: string; q?: string; search?: string }>();
  const { selected } = useStores();
  const { columns, wide } = useLayout();
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(query);
  const [categoryId, setCategoryId] = useState<string | null>(params.category ?? null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState<FilterSection | null>(null);
  const [searchOpen, setSearchOpen] = useState(Boolean(params.q || params.search));
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);

  useEffect(() => { if (params.category !== undefined) setCategoryId(params.category || null); }, [params.category]);
  useEffect(() => { if (params.search) setSearchOpen(true); }, [params.search]);
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 300); return () => clearTimeout(t); }, [query]);

  // A top-level category is shown with its subcategories as tabs; a subcategory selects its tab.
  const all = categories.data ?? [];
  const current = all.find((c) => c.id === categoryId) ?? null;
  const parent = current ? (current.parent_id ? all.find((c) => c.id === current.parent_id) ?? current : current) : null;
  const children = parent ? all.filter((c) => c.parent_id === parent.id) : [];
  const tabs: Array<{ id: string | null; name: string }> = parent
    ? [{ id: parent.id, name: 'Tutti' }, ...children]
    : [{ id: null, name: 'Tutti' }, ...all.filter((c) => !c.parent_id)];
  const activeTab = current && current.parent_id ? current.id : parent ? parent.id : null;
  const scopeIds = useMemo(() => {
    if (!current) return null;
    if (current.parent_id) return [current.id];
    return [current.id, ...all.filter((c) => c.parent_id === current.id).map((c) => c.id)];
  }, [current, all]);
  const title = parent?.name ?? 'Categorie';
  const facets = useQuery(`facets:${scopeIds?.join(',') ?? 'all'}`, () => fetchFacets(scopeIds));

  const request = (p: number) => fetchProducts({
    storeId: selected?.id ?? null, categoryIds: scopeIds ?? undefined, search: debounced, sort: filters.sort, page: p,
    brands: filters.brands, colors: filters.colors, priceMin: filters.price.min, priceMax: filters.price.max,
  });
  const key = JSON.stringify([selected?.id, scopeIds, debounced, filters.sort, filters.brands, filters.colors, filters.price]);
  // Reload from page 0 whenever the filters change.
  useEffect(() => {
    let active = true;
    setLoading(true);
    request(0)
      .then((r) => { if (active) { setItems(r.items); setHasMore(r.hasMore); setTotal(r.total); setPage(0); setError(null); } })
      .catch((e) => { if (active) setError(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const r = await request(page + 1);
      setItems((prev) => [...prev, ...r.items]); setHasMore(r.hasMore); setTotal(r.total); setPage(page + 1);
    } catch (e) { setError(e); } finally { setLoading(false); }
  };

  const shown = filters.onlyAvailable ? items.filter((p) => p.stock === null || p.stock > 0) : items;
  const count = filters.onlyAvailable ? shown.length : total ?? shown.length;
  const pill = (section: FilterSection, label: string, active: boolean, icon?: 'filter') =>
    <Pressable key={section} onPress={() => setSheet(section)} style={[styles.pill, active && styles.pillOn]} accessibilityRole="button"
      accessibilityLabel={`${label}${active ? ' (attivo)' : ''}`}>
      {icon && <Icon name={icon} size={14} strokeWidth={1.6} />}
      <Text style={styles.pillText}>{label}</Text>{!icon && <Icon name="down" size={13} />}
    </Pressable>;

  return <Screen contentContainerStyle={{ paddingTop: 4 }}>
    <FilterSheet visible={sheet !== null} section={sheet ?? 'all'} filters={filters} onChange={setFilters} onClose={() => setSheet(null)}
      facets={facets.data ?? null} total={loading ? null : count} />
    <View style={[styles.header, wide && { marginTop: 8 }]}>
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ paddingHorizontal: 20, gap: 20 }}>
      {tabs.map((item) => {
        const on = activeTab === item.id;
        return <Pressable key={item.id ?? 'all'} accessibilityRole="tab" accessibilityState={{ selected: on }}
          style={[styles.tab, on && styles.tabOn]} onPress={() => setCategoryId(item.id)}>
          <Text style={[styles.tabText, on && styles.tabTextOn]}>{item.name}</Text>
        </Pressable>;
      })}
    </ScrollView>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll} contentContainerStyle={styles.pills}>
      {pill('all', 'Filtra', filters.sort !== 'featured' || filters.onlyAvailable, 'filter')}
      {pill('brand', filters.brands.length ? `Marca (${filters.brands.length})` : 'Marca', filters.brands.length > 0)}
      {pill('color', filters.colors.length ? `Colore (${filters.colors.length})` : 'Colore', filters.colors.length > 0)}
      {pill('price', 'Prezzo', filters.price.min !== null || filters.price.max !== null)}
    </ScrollView>

    <View style={styles.toolbar}>
      <Text style={styles.count}>{loading && !items.length ? ' ' : `${count} ${count === 1 ? 'prodotto' : 'prodotti'}`}</Text>
      <View style={{ flexDirection: 'row', gap: 2 }} accessibilityRole="radiogroup" accessibilityLabel="Vista">
        {(['grid', 'list'] as const).map((v) => <Pressable key={v} onPress={() => setView(v)} accessibilityRole="radio"
          accessibilityState={{ checked: view === v }} accessibilityLabel={v === 'grid' ? 'Vista a griglia' : 'Vista a elenco'}
          style={[styles.viewButton, view === v && styles.viewButtonOn]}>
          <Icon name={v} size={19} strokeWidth={1.5} color={view === v ? colors.text : colors.faint} /></Pressable>)}
      </View>
    </View>
    {error && !items.length ? <Notice tone="error" message="Impossibile caricare il catalogo. Controlla la connessione." /> : null}
    {!loading && !error && !shown.length && <View style={{ paddingVertical: 48, alignItems: 'center', gap: 16 }}>
      <Icon name="search" size={32} color={colors.muted} />
      <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 22, fontFamily: fonts.sans }}>Nessun prodotto trovato. Prova un'altra ricerca o togli qualche filtro.</Text>
    </View>}
    {view === 'grid'
      ? <View style={styles.grid}>{shown.map((product) => <View key={product.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 5, flexDirection: 'row' }}>
          <ProductCard product={product} /></View>)}</View>
      : <View style={wide ? { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 } : undefined}>{shown.map((product) =>
          <View key={product.id} style={wide ? { width: '48%' } : undefined}><ProductCard product={product} variant="list" /></View>)}</View>}
    {loading ? <Loading /> : hasMore ? <View style={{ marginTop: 24 }}><SecondaryButton title="Mostra altri prodotti" onPress={loadMore} /></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0, marginTop: -8, gap: 8 },
  iconButton: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 23, fontFamily: fonts.serif, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 999, paddingLeft: 18,
    minHeight: 46, borderWidth: 1, borderColor: colors.line, marginBottom: 6 },
  input: { flex: 1, minWidth: 0, paddingVertical: 13, fontSize: 15, color: colors.text, outlineWidth: 0, fontFamily: fonts.sans },
  tabs: { marginHorizontal: -20, borderBottomWidth: 1, borderColor: colors.line, flexGrow: 0 },
  tab: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabOn: { borderColor: colors.text },
  tabText: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans },
  tabTextOn: { color: colors.text, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  pillsScroll: { marginHorizontal: -20, flexGrow: 0, marginTop: 8 },
  pills: { paddingHorizontal: 20, gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  pillOn: { borderColor: colors.text },
  pillText: { fontSize: 13, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  count: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans },
  viewButton: { width: 34, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  viewButtonOn: { backgroundColor: colors.cream },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, rowGap: 8 },
});
