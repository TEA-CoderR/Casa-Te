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
import { SiteFooter } from '@/components/site/SiteFooter';
import { useRecentSearches } from '@/store/recentSearches';
import { SITE_WIDTH, transition, type WebState } from '@/components/site/shared';

export default function CatalogScreen() {
  const params = useLocalSearchParams<{ category?: string; q?: string; search?: string; sort?: string; offerte?: string; evidenza?: string }>();
  const { selected } = useStores();
  const { columns, wide } = useLayout();
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(query);
  const [categoryId, setCategoryId] = useState<string | null>(params.category || null);
  const [filters, setFilters] = useState<Filters>(params.sort === 'price_asc' ? { ...EMPTY_FILTERS, sort: 'price_asc' } : EMPTY_FILTERS);
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
  const recent = useRecentSearches();

  useEffect(() => { if (params.category !== undefined) setCategoryId(params.category || null); }, [params.category]);
  // ?offerte=1: only discounted products ("In offerta"), within the chosen category.
  const [onSale, setOnSale] = useState(params.offerte === '1');
  useEffect(() => { setOnSale(params.offerte === '1'); }, [params.offerte]);
  // ?evidenza=1: only the products starred "In evidenza" in the admin.
  const [featuredOnly, setFeaturedOnly] = useState(params.evidenza === '1');
  useEffect(() => { setFeaturedOnly(params.evidenza === '1'); }, [params.evidenza]);
  const collection = onSale ? 'In offerta' : featuredOnly ? 'In evidenza' : null;
  useEffect(() => { if (params.search) setSearchOpen(true); }, [params.search]);
  useEffect(() => { if (params.sort === 'price_asc') setFilters((f) => ({ ...f, sort: 'price_asc' })); }, [params.sort]);
  // The desktop masthead searches by changing ?q=.
  useEffect(() => { if (params.q !== undefined) { setQuery(params.q); setDebounced(params.q); if (params.q) setSearchOpen(true); } }, [params.q]);
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
  const title = collection ? (parent ? `${collection} · ${parent.name}` : collection) : parent?.name ?? 'Categorie';
  const facets = useQuery(`facets:${scopeIds?.join(',') ?? 'all'}`, () => fetchFacets(scopeIds));

  const request = (p: number) => fetchProducts({
    storeId: selected?.id ?? null, categoryIds: scopeIds ?? undefined, search: debounced, sort: filters.sort, page: p, onSale, featured: featuredOnly || undefined,
    brands: filters.brands, colors: filters.colors, priceMin: filters.price.min, priceMax: filters.price.max,
  });
  const key = JSON.stringify([selected?.id, scopeIds, debounced, onSale, featuredOnly, filters.sort, filters.brands, filters.colors, filters.price]);
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
  // Keep the URL in step with the chosen category, so the home links (same id again) and reloads keep working.
  const selectCategory = (id: string | null) => { setCategoryId(id); router.setParams({ category: id ?? undefined }); };
  // Back steps out one level: close the search, subcategory → its department, department → all categories, then home.
  const leaveOffers = () => { setOnSale(false); setFeaturedOnly(false); router.setParams({ offerte: undefined, evidenza: undefined }); };
  const goBack = () => {
    if (searchOpen && query) { setQuery(''); setSearchOpen(false); return; }
    // Out of "In offerta" first: back lands on the whole catalogue, not on the offers again.
    if (collection) { leaveOffers(); return; }
    if (current?.parent_id) { selectCategory(current.parent_id); return; }
    if (categoryId) { selectCategory(null); return; }
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const pill = (section: FilterSection, label: string, active: boolean, icon?: 'filter') =>
    <Pressable key={section} onPress={() => setSheet(section)} style={[styles.pill, wide && { borderRadius: 4, minHeight: 36 }, active && styles.pillOn]} accessibilityRole="button"
      accessibilityLabel={`${label}${active ? ' (attivo)' : ''}`}>
      {icon && <Icon name={icon} size={14} strokeWidth={1.6} />}
      <Text style={styles.pillText}>{label}</Text>{!icon && <Icon name="down" size={13} />}
    </Pressable>;

  const searching = !!debounced.trim();
  const pageHead = <View style={styles.deskHead}>
    <View style={styles.crumbs}>
      <Pressable onPress={() => router.push('/')} accessibilityRole="link">
        {({ hovered }: WebState) => <Text style={[styles.crumb, hovered && { color: colors.green }]}>Home</Text>}</Pressable>
      <Text style={styles.crumbSep}>/</Text>
      <Pressable onPress={() => { setQuery(''); leaveOffers(); selectCategory(null); }} accessibilityRole="link">
        {({ hovered }: WebState) => <Text style={[styles.crumb, hovered && { color: colors.green }, !parent && !searching && !collection && styles.crumbOn]}>Catalogo</Text>}</Pressable>
      {!!collection && !searching && <><Text style={styles.crumbSep}>/</Text><Text style={[styles.crumb, styles.crumbOn]}>{collection}</Text></>}
      {!!parent && !searching && <><Text style={styles.crumbSep}>/</Text><Text style={[styles.crumb, styles.crumbOn]}>{parent.name}</Text></>}
    </View>
    <View style={styles.deskTitleRow}>
      <Text style={styles.deskTitle} accessibilityRole="header" numberOfLines={1}>
        {searching ? `«${debounced.trim()}»` : collection ? title : parent?.name ?? 'Tutti i prodotti'}</Text>
      <Text style={styles.deskCount}>{loading && !items.length ? ' ' : `${count} ${count === 1 ? 'prodotto' : 'prodotti'}`}</Text>
    </View>
    {searching && <Pressable onPress={() => { setQuery(''); setSearchOpen(false); router.setParams({ q: undefined }); }} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
      <Text style={styles.clearSearch}>Cancella la ricerca</Text></Pressable>}
  </View>;

  return <Screen contentContainerStyle={wide ? { paddingTop: 0, paddingHorizontal: 40 } : { paddingTop: 4 }} maxWidth={wide ? SITE_WIDTH - 80 : undefined}
    after={wide ? <SiteFooter /> : undefined} bleed={40}>
    <FilterSheet visible={sheet !== null} section={sheet ?? 'all'} filters={filters} onChange={setFilters} onClose={() => setSheet(null)}
      facets={facets.data ?? null} total={loading ? null : count} />
    {wide ? pageHead : <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Indietro" style={styles.iconButton}
        onPress={goBack}><Icon name="back" size={23} strokeWidth={1.4} /></Pressable>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={searchOpen ? 'Chiudi ricerca' : 'Cerca prodotti'} accessibilityState={{ expanded: searchOpen }}
        style={styles.iconButton} onPress={() => { if (searchOpen) setQuery(''); setSearchOpen(!searchOpen); }}>
        <Icon name={searchOpen ? 'close' : 'search'} size={21} strokeWidth={1.4} /></Pressable>
    </View>}
    {searchOpen && !wide && <View style={styles.search}><Icon name="search" size={19} color={colors.muted} />
      <TextInput value={query} onChangeText={setQuery} placeholder="Cerca per nome, marca o codice..." placeholderTextColor={colors.faint} autoFocus={!params.q}
        accessibilityLabel="Cerca prodotti" style={styles.input} returnKeyType="search" autoCorrect={false}
        // A search counts as "recent" once confirmed or left with results (e.g. tapping a product).
        onSubmitEditing={() => recent.remember(query)} onBlur={() => { if (shown.length) recent.remember(query); }} />
      {!!query && <Pressable accessibilityLabel="Cancella ricerca" onPress={() => setQuery('')} style={{ padding: 10 }}>
        <Icon name="close" size={16} /></Pressable>}
    </View>}
    {searchOpen && !wide && !query && recent.terms.length > 0 && <View style={styles.recent}>
      <View style={styles.recentHead}>
        <Text style={styles.recentTitle}>Ricerche recenti</Text>
        <Pressable onPress={recent.clear} accessibilityRole="button" hitSlop={8}><Text style={styles.recentClear}>Cancella</Text></Pressable>
      </View>
      {recent.terms.map((t) => <View key={t} style={styles.recentRow}>
        <Pressable onPress={() => { setQuery(t); setDebounced(t); recent.remember(t); }} accessibilityRole="button"
          accessibilityLabel={`Cerca ancora ${t}`} style={styles.recentTerm}>
          <Icon name="search" size={16} color={colors.muted} /><Text style={styles.recentText} numberOfLines={1}>{t}</Text>
        </Pressable>
        <Pressable onPress={() => recent.forget(t)} accessibilityRole="button" accessibilityLabel={`Rimuovi ${t} dalle ricerche recenti`} hitSlop={6} style={{ padding: 8 }}>
          <Icon name="close" size={14} color={colors.muted} /></Pressable>
      </View>)}
    </View>}
    {(!wide || children.length > 0) && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, wide && styles.tabsWide]} contentContainerStyle={{ paddingHorizontal: wide ? 0 : 20, gap: wide ? 28 : 18 }}>
      {tabs.map((item) => {
        const on = activeTab === item.id;
        return <Pressable key={item.id ?? 'all'} accessibilityRole="tab" accessibilityState={{ selected: on }}
          style={[styles.tab, wide && { minHeight: 48 }, on && styles.tabOn, on && wide && { borderColor: colors.green }]} onPress={() => selectCategory(item.id)}>
          <Text style={[styles.tabText, wide && styles.tabTextWide, on && styles.tabTextOn, on && wide && { color: colors.green }]}>{item.name}</Text>
        </Pressable>;
      })}
    </ScrollView>}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.pillsScroll, wide && { marginHorizontal: 0, marginTop: 20 }]} contentContainerStyle={[styles.pills, wide && { paddingHorizontal: 0 }]}>
      {pill('all', 'Filtra', filters.sort !== 'featured' || filters.onlyAvailable, 'filter')}
      {pill('brand', filters.brands.length ? `Marca (${filters.brands.length})` : 'Marca', filters.brands.length > 0)}
      {pill('color', filters.colors.length ? `Colore (${filters.colors.length})` : 'Colore', filters.colors.length > 0)}
      {pill('price', 'Prezzo', filters.price.min !== null || filters.price.max !== null)}
    </ScrollView>

    <View style={[styles.toolbar, wide && { marginTop: -36, marginBottom: 28, justifyContent: 'flex-end' }]}>
      {!wide && <Text style={styles.count}>{loading && !items.length ? ' ' : `${count} ${count === 1 ? 'prodotto' : 'prodotti'}`}</Text>}
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
      ? <View style={[styles.grid, wide && { marginHorizontal: -14, rowGap: 48 }]}>{shown.map((product) => <View key={product.id} style={{ width: `${100 / columns}%`, paddingHorizontal: wide ? 14 : 5, flexDirection: 'row' }}>
          <ProductCard product={product} /></View>)}</View>
      : <View style={wide ? { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 } : undefined}>{shown.map((product) =>
          <View key={product.id} style={wide ? { width: '48%' } : undefined}><ProductCard product={product} variant="list" /></View>)}</View>}
    {loading ? <Loading /> : hasMore ? <View style={{ marginTop: 24 }}><SecondaryButton title="Mostra altri prodotti" onPress={loadMore} /></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0, marginTop: -8, gap: 8 },
  iconButton: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 25, fontFamily: fonts.serif, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 999, paddingLeft: 18,
    minHeight: 46, borderWidth: 1, borderColor: colors.line, marginBottom: 6 },
  input: { flex: 1, minWidth: 0, paddingVertical: 13, fontSize: 15, color: colors.text, outlineWidth: 0, fontFamily: fonts.sans },
  tabs: { marginHorizontal: -20, borderBottomWidth: 1, borderColor: colors.line, flexGrow: 0 },
  tab: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1.5, borderColor: 'transparent' },
  tabOn: { borderColor: colors.text },
  tabText: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
  tabTextOn: { color: colors.text, fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  pillsScroll: { marginHorizontal: -20, flexGrow: 0, marginTop: 10 },
  pills: { paddingHorizontal: 20, gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#E6DFD3', backgroundColor: colors.surface },
  pillOn: { borderColor: colors.text },
  pillText: { fontSize: 12, color: colors.text, fontFamily: fonts.sansMedium, fontWeight: '500' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  count: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans },
  viewButton: { width: 32, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  viewButtonOn: { backgroundColor: colors.cream },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, rowGap: 8 },
  recent: { marginTop: 4, marginBottom: 10 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  recentTitle: { fontSize: 13, color: colors.muted, fontFamily: fonts.sansMedium, fontWeight: '500' },
  recentClear: { fontSize: 13, color: colors.green, fontFamily: fonts.sansMedium, fontWeight: '500' },
  recentRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line },
  recentTerm: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 },
  recentText: { flex: 1, fontSize: 15, color: colors.text, fontFamily: fonts.sans },
  deskHead: { paddingTop: 36, paddingBottom: 8, gap: 14 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  crumb: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
  crumbOn: { color: colors.text },
  crumbSep: { fontSize: 13, color: colors.rule, fontFamily: fonts.sans },
  deskTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 18 },
  deskTitle: { flexShrink: 1, fontSize: 64, lineHeight: 70, letterSpacing: -1.2, fontFamily: fonts.serif, color: colors.text },
  deskCount: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans },
  clearSearch: { fontSize: 13.5, color: colors.green, textDecorationLine: 'underline', fontFamily: fonts.sansMedium },
  tabsWide: { marginHorizontal: 0, marginTop: 18, borderColor: colors.rule },
  tabTextWide: { fontSize: 14, color: colors.text },
});
