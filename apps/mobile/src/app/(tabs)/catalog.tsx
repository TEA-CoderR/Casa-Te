import { useEffect, useMemo, useState } from 'react';
import { CategoryBrowser, SubcategorySheet, SubcategoryTabs, departmentCount, liveChildren } from '@/components/CategoryNav';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CategoryRow } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { EMPTY_FILTERS, FilterSheet, type FilterSection, type Filters } from '@/components/FilterSheet';
import { Loading, Notice, SecondaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { BrandHeader, HeaderBack } from '@/components/BrandHeader';
import { RollingAwning } from '@/components/RollingAwning';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchCategoryCounts, fetchCategoryCovers, fetchFacets, fetchProducts, type CatalogProduct } from '@/lib/api';
import { CategoryIcon } from '@/components/CategoryIcon';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';
import { SiteFooter } from '@/components/site/SiteFooter';
import { useRecentSearches } from '@/store/recentSearches';
import { SITE_WIDTH, transition, type WebState } from '@/components/site/shared';

/** Under review (preview only): ?vista=griglia shows the departments as photo tiles instead of the rail. */
const BROWSER_LAYOUT: 'rail' | 'tiles' = typeof window !== 'undefined' && /[?&]vista=griglia/.test(window.location?.search ?? '') ? 'tiles' : 'rail';

export default function CatalogScreen() {
  const params = useLocalSearchParams<{ category?: string; q?: string; search?: string; sort?: string; offerte?: string; evidenza?: string; code?: string }>();
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
  const [focused, setFocused] = useState(false);
  // "Esplora per reparto" (phone search page): a photo per department and its subcategories, same cache as the home.
  const browsing = searchOpen && !wide && !debounced.trim();
  // Also hides empty subcategory tabs on department pages.
  const counts = useQuery('category-counts', fetchCategoryCounts);
  const covers = useQuery(browsing || !wide ? 'category-covers' : null, () => fetchCategoryCovers());
  const [openDept, setOpenDept] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);

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
    ? [{ id: parent.id, name: 'Tutti' }, ...children.filter((c) => !counts.data || (counts.data[c.id] ?? 0) > 0 || c.id === categoryId)]
    : [{ id: null, name: 'Tutti' }, ...all.filter((c) => !c.parent_id)];
  const activeTab = current && current.parent_id ? current.id : parent ? parent.id : null;
  const scopeIds = useMemo(() => {
    if (!current) return null;
    if (current.parent_id) return [current.id];
    return [current.id, ...all.filter((c) => c.parent_id === current.id).map((c) => c.id)];
  }, [current, all]);
  const title = collection ? (parent ? `${collection} · ${parent.name}` : collection) : parent?.name ?? 'Categorie';
  const facets = useQuery(`facets:${scopeIds?.join(',') ?? 'all'}`, () => fetchFacets(scopeIds));

  // The phone search page searches every department (not just the department it was opened from).
  const requestScope = !wide && searchOpen ? null : scopeIds;
  const request = (p: number) => fetchProducts({
    storeId: selected?.id ?? null, categoryIds: requestScope ?? undefined, search: debounced, sort: filters.sort, page: p, onSale,
    // Browsing a department: discounted products first (search results keep their order).
    offersFirst: !debounced.trim(), featured: featuredOnly || undefined,
    brands: filters.brands, colors: filters.colors, priceMin: filters.price.min, priceMax: filters.price.max,
  });
  const key = JSON.stringify([selected?.id, requestScope, debounced, onSale, featuredOnly, filters.sort, filters.brands, filters.colors, filters.price]);
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
  const canGoBackHere = () => !!collection || !!categoryId || router.canGoBack();
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
    <Pressable key={section} onPress={() => setSheet(section)} style={[styles.pill, wide ? { borderRadius: 4, minHeight: 36 } : styles.pillPhone, active && styles.pillOn]} accessibilityRole="button"
      accessibilityLabel={`${label}${active ? ' (attivo)' : ''}`}>
      {icon && <Icon name={icon} size={14} strokeWidth={1.6} />}
      <Text style={[styles.pillText, !wide && styles.pillTextPhone]}>{label}</Text>{!icon && <Icon name="down" size={13} />}
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

  const filterSheet = <FilterSheet visible={sheet !== null} section={sheet ?? 'all'} filters={filters} onChange={setFilters} onClose={() => setSheet(null)}
    facets={facets.data ?? null} total={loading ? null : count} />;
  const results = <>
    {error && !items.length ? <Notice tone="error" message="Impossibile caricare il catalogo. Controlla la connessione." /> : null}
    {!loading && !error && !shown.length && <View style={{ paddingVertical: 48, alignItems: 'center', gap: 16 }}>
      <Icon name="search" size={32} color={colors.muted} />
      <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 22, fontFamily: fonts.sans }}>Nessun prodotto trovato. Prova un'altra ricerca o togli qualche filtro.</Text>
    </View>}
  </>;

  // Phone (design F): a department page (F-Reparto) or, while searching, the search page (F-Ricerca).
  if (!wide) {
    const storeLabel = selected ? selected.name.replace(/^CASA & TE\s*/, '').replace(/^(\S+)\s+(?!·)/, '$1 · ') : '';
    const topOf = (id: string | null) => { const c = all.find((x) => x.id === id); return c?.parent_id ? all.find((x) => x.id === c.parent_id) ?? c : c; };
    const filterCount = filters.brands.length + filters.colors.length + (filters.price.min !== null || filters.price.max !== null ? 1 : 0)
      + (filters.sort !== 'featured' ? 1 : 0) + (filters.onlyAvailable ? 1 : 0) + (onSale ? 1 : 0);
    const filterSheetPhone = <FilterSheet visible={sheet !== null} section="all" filters={filters} onChange={setFilters} onClose={() => setSheet(null)}
      facets={facets.data ?? null} total={loading ? null : count} onSale={onSale} onToggleSale={() => {
        const next = !onSale; setOnSale(next); if (next) setFeaturedOnly(false);
        router.setParams({ offerte: next ? '1' : undefined, evidenza: undefined });
      }} />;
    const more = loading ? <Loading /> : hasMore ? <View style={{ marginTop: 16 }}><SecondaryButton title="Mostra altri prodotti" onPress={loadMore} /></View> : null;

    if (searchOpen) {
      const q = query.trim().toLowerCase();
      const closeSearch = () => { setQuery(''); setDebounced(''); setSearchOpen(false); router.setParams({ q: undefined, search: undefined }); if (!categoryId && !collection && router.canGoBack()) router.back(); };
      const header = <BrandHeader plain pad={[14, 16, 16]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <HeaderBack onPress={closeSearch} />
          <View style={styles.sBox}>
            <Icon name="search" size={20} color={colors.text} strokeWidth={2.1} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Prodotto, marca o reparto" placeholderTextColor={colors.faint}
              accessibilityLabel="Cerca prodotti" autoFocus returnKeyType="search" autoCorrect={false} keyboardType={params.code ? 'number-pad' : 'default'}
              onSubmitEditing={() => recent.remember(query)} onFocus={() => setFocused(true)}
              onBlur={() => { setFocused(false); if (shown.length) recent.remember(query); }} style={styles.sInput} />
            {!!query && <Pressable onPress={() => { setQuery(''); setDebounced(''); }} accessibilityRole="button" accessibilityLabel="Cancella ricerca" style={styles.sClear}>
              <Icon name="close" size={15} color={colors.text} strokeWidth={2.6} /></Pressable>}
          </View>
        </View>
      </BrandHeader>;
      const showRecents = focused && !query && recent.terms.length > 0;
      // Departments and subcategories whose name matches the search ("piatti" -> Piatti a mano, Piatti, bicchieri e tazze…).
      const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const words = fold(debounced.trim()).split(/\s+/).filter((w) => w.length >= 3);
      const catHits = words.length ? all.filter((c) => {
        const name = fold(c.name);
        const n = c.parent_id ? counts.data?.[c.id] ?? 0 : 1;
        return n > 0 && words.every((w) => name.split(/[^a-z0-9]+/).some((part) => part.startsWith(w)));
      }).sort((a, b) => (counts.data?.[b.id] ?? 0) - (counts.data?.[a.id] ?? 0)).slice(0, 5) : [];
      const openCategory = (id: string) => { recent.remember(query); setQuery(''); setSearchOpen(false); router.setParams({ search: undefined, q: undefined }); selectCategory(id); };
      return <Screen header={header} ground={colors.page} contentContainerStyle={{ padding: 0, paddingBottom: 24 }}>
        {!debounced.trim() ? <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
          {/* Recent searches only while typing a new one (field focused, still empty): out of the way otherwise. */}
          {showRecents && <View style={{ marginBottom: 26 }}>
            <View style={styles.sHead}>
              <Text style={styles.sCaps}>RICERCHE RECENTI</Text>
              <Pressable onPress={recent.clear} accessibilityRole="button" hitSlop={8}><Text style={styles.sLink}>Cancella tutto</Text></Pressable>
            </View>
            <View style={styles.sRecents}>{recent.terms.slice(0, 5).map((t) => <View key={t} style={styles.sRecent}>
              <Pressable onPress={() => { setQuery(t); setDebounced(t); recent.remember(t); }} accessibilityRole="button" accessibilityLabel={`Cerca ancora ${t}`}
                style={styles.sRecentTerm}>
                <Icon name="clock" size={15} color={colors.muted} strokeWidth={2.2} /><Text style={styles.sRecentText} numberOfLines={1}>{t}</Text>
              </Pressable>
              <Pressable onPress={() => recent.forget(t)} accessibilityRole="button" accessibilityLabel={`Rimuovi ${t} dalle ricerche recenti`} hitSlop={8} style={styles.sRecentX}>
                <Icon name="close" size={13} color={colors.muted} strokeWidth={2.4} /></Pressable>
            </View>)}</View>
          </View>}
          <Text style={[styles.sCaps, { marginBottom: 6 }]}>ESPLORA PER REPARTO</Text>
          <View style={styles.sList}>{all.filter((c) => !c.parent_id).map((c, i) => {
            const subs = all.filter((x) => x.parent_id === c.id && (counts.data ? (counts.data[x.id] ?? 0) > 0 : true));
            const n = [c.id, ...all.filter((x) => x.parent_id === c.id).map((x) => x.id)].reduce((sum, id) => sum + (counts.data?.[id] ?? 0), 0);
            const cover = covers.data?.[c.id]?.image ?? subs.map((x) => covers.data?.[x.id]?.image).find(Boolean) ?? null;
            const open = openDept === c.id && subs.length > 1;
            const go = (id: string) => { setQuery(''); setOpenDept(null); setSearchOpen(false); router.setParams({ search: undefined }); selectCategory(id); };
            return <View key={c.id} style={i > 0 && { borderTopWidth: 1, borderColor: '#EFECE3' }}>
              <Pressable onPress={() => subs.length > 1 ? setOpenDept(open ? null : c.id) : go(c.id)}
                accessibilityRole={subs.length > 1 ? 'button' : 'link'} accessibilityState={subs.length > 1 ? { expanded: open } : undefined}
                accessibilityLabel={`${c.name}${n ? `, ${n} ${n === 1 ? 'prodotto' : 'prodotti'}` : ''}`} style={styles.sRow}>
                <Thumb image={cover} slug={c.slug} name={c.name} size={44} />
                <Text style={styles.sRowText} numberOfLines={1}>{c.name}</Text>
                <View style={open && { transform: [{ rotate: '90deg' }] }}><Icon name="chevron" size={18} color="#9A9F94" strokeWidth={2.2} /></View>
              </Pressable>
              {open && <View style={styles.sSubs}>
                <Pressable onPress={() => go(c.id)} accessibilityRole="link" accessibilityLabel={`Tutto in ${c.name}`} style={styles.sAll}>
                  <Text style={styles.sAllText}>Vedi tutto in {c.name}</Text>
                  <Icon name="arrow" size={15} color={colors.green} strokeWidth={2.4} />
                </Pressable>
                <View style={styles.sGrid}>{subs.map((x) => <Pressable key={x.id} onPress={() => go(x.id)} accessibilityRole="link"
                  accessibilityLabel={x.name} style={({ pressed }) => [styles.sCell, pressed && { opacity: 0.75 }]}>
                  <View style={styles.sTile}>
                    {covers.data?.[x.id]?.image
                      ? <Image source={{ uri: covers.data[x.id].image as string }} resizeMode="contain" accessibilityIgnoresInvertColors
                          style={[styles.sTileImage, { mixBlendMode: 'multiply' } as object]} />
                      : <CategoryIcon slug={c.slug} name={x.name} size={34} strokeWidth={1.4} />}
                  </View>
                  <Text style={styles.sCellText} numberOfLines={2}>{x.name}</Text>
                </Pressable>)}</View>
              </View>}
            </View>;
          })}</View>
        </View>
        : !loading && !error && !shown.length && !catHits.length ? <View style={styles.sEmpty}>
          <View style={styles.sEmptyIcon}><Icon name="search" size={30} color={colors.muted} strokeWidth={1.8} /></View>
          <Text style={styles.sEmptyTitle}>Nessun risultato per “{debounced.trim()}”</Text>
          <Text style={styles.sEmptyText}>Controlla come l’hai scritto o prova con il nome della marca.</Text>
          <Pressable onPress={() => { setQuery(''); setDebounced(''); }} accessibilityRole="button" style={styles.sEmptyButton}><Text style={styles.sEmptyButtonText}>Nuova ricerca</Text></Pressable>
        </View>
        : <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          {error && !items.length ? <Notice tone="error" message="Impossibile cercare. Controlla la connessione." /> : null}
          {catHits.length > 0 && <View style={styles.sCats}>
            <Text style={[styles.sCaps, { marginBottom: 6 }]}>REPARTI</Text>
            <View style={styles.sList}>{catHits.map((c, i) => {
              const top = topOf(c.id);
              return <Pressable key={c.id} onPress={() => openCategory(c.id)} accessibilityRole="link"
                accessibilityLabel={`${c.name}${top && top.id !== c.id ? `, in ${top.name}` : ''}`}
                style={({ pressed }) => [styles.sCatRow, i > 0 && { borderTopWidth: 1, borderColor: '#EFECE3' }, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sCatName} numberOfLines={1}>{c.name}</Text>
                  {!!top && top.id !== c.id && <Text style={styles.sCatPath} numberOfLines={1}>{top.name}</Text>}
                </View>
                <Text style={styles.sCatCount}>{(counts.data?.[c.id] ?? 0) || ''}</Text>
                <Icon name="chevron" size={17} color="#9A9F94" strokeWidth={2.2} />
              </Pressable>;
            })}</View>
          </View>}
          <View style={styles.sResultsHead}>
            <Text style={styles.sCaps}>PRODOTTI</Text>
            <Text style={styles.sCount}>{loading && !items.length ? ' ' : `${count} ${count === 1 ? 'prodotto' : 'prodotti'}${storeLabel ? ` a ${storeLabel}` : ''}`}</Text>
          </View>
          <View style={styles.fGrid}>{shown.map((product) => <View key={product.id} style={styles.fCell}><ProductCard product={product} /></View>)}</View>
          {more}
        </View>}
      </Screen>;
    }

    // "Categorie" tab with nothing chosen: the category browser instead of every product in one list.
    if (!categoryId && !collection) {
      return <CategoryBrowser all={all} counts={counts.data} covers={covers.data} layout={BROWSER_LAYOUT}
        onOpen={selectCategory} onSearch={() => { setSearchOpen(true); router.setParams({ search: '1' }); }} />;
    }

    const coverOf = (id: string) => covers.data?.[id]?.image ?? liveChildren(all, counts.data, id).map((c) => covers.data?.[c.id]?.image).find(Boolean) ?? null;
    const sheetItems = parent
      ? [{ id: parent.id, name: `Tutto in ${parent.name}`, count: counts.data ? departmentCount(all, counts.data, parent.id) : undefined, image: coverOf(parent.id), slug: parent.slug },
        ...tabs.slice(1).map((t) => ({ id: t.id, name: t.name, count: counts.data?.[t.id as string], image: covers.data?.[t.id as string]?.image, slug: parent.slug }))]
      : all.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name, count: counts.data ? departmentCount(all, counts.data, c.id) : undefined, image: coverOf(c.id), slug: c.slug }));
    const deptTitle = collection ? (parent ? `${collection} · ${parent.name}` : collection) : parent?.name ?? 'Tutti i prodotti';
    return <RollingAwning title={deptTitle}
      subtitle={loading && !items.length ? ' ' : `${count.toLocaleString('it-IT')} ${count === 1 ? 'prodotto disponibile' : 'prodotti disponibili'}${storeLabel ? ` a ${storeLabel}` : ''}`}
      onBack={canGoBackHere() ? goBack : undefined} searchScope={parent?.name}
      onSearch={() => { setSearchOpen(true); router.setParams({ search: '1' }); }}
      overlay={<>{filterSheetPhone}
        <SubcategorySheet visible={allOpen} onClose={() => setAllOpen(false)} title={parent?.name ?? 'Reparti'} items={sheetItems}
          active={parent ? activeTab : categoryId} onSelect={selectCategory} />
      </>}
      chips={<SubcategoryTabs key={parent?.id ?? 'all'} items={tabs} active={activeTab} onSelect={selectCategory} onOpenAll={() => setAllOpen(true)} />}>
      <View style={styles.fBar}>
        <Text style={styles.fCount}>{loading && !items.length ? ' ' : `${shown.length} ${shown.length === 1 ? 'prodotto mostrato' : 'prodotti mostrati'}`}</Text>
        <Pressable onPress={() => setSheet('all')} accessibilityRole="button" accessibilityLabel={`Filtra e ordina${filterCount ? `, ${filterCount} attivi` : ''}`} style={styles.fButton}>
          <Icon name="sliders" size={17} color={colors.text} strokeWidth={2.2} /><Text style={styles.fButtonText}>Filtra e ordina</Text>
          {filterCount > 0 && <View style={styles.fBadge}><Text style={styles.fBadgeText}>{filterCount}</Text></View>}
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        {results}
        <View style={styles.fGrid}>{shown.map((product) => <View key={product.id} style={styles.fCell}><ProductCard product={product} /></View>)}</View>
        {more}
      </View>
    </RollingAwning>;
  }

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

/** Department photo (a real product of it) on a white plate, like every product photo; the department icon while there is none. */
function Thumb({ image, slug, name, size }: { image: string | null; slug: string; name: string; size: number }) {
  return <View style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: colors.photo, borderWidth: 1, borderColor: colors.photoLine,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    {image ? <Image source={{ uri: image }} resizeMode="contain" accessibilityIgnoresInvertColors
        style={{ position: 'absolute', top: size * 0.1, left: size * 0.1, right: size * 0.1, bottom: size * 0.1 }} />
      : <CategoryIcon slug={slug} name={name} size={size * 0.55} strokeWidth={1.5} />}
  </View>;
}


const styles = StyleSheet.create({
  fBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 12 },
  fCount: { fontSize: 13.5, fontFamily: fonts.sansSemiBold, color: colors.muted, flexShrink: 1 },
  fButton: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF' },
  fButtonText: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.text },
  fBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  fBadgeText: { fontSize: 12, fontFamily: fonts.heavy, color: '#FFFFFF' },
  fGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  fCell: { width: '48.6%', flexDirection: 'row' },
  sBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingLeft: 16, paddingRight: 6, borderRadius: 25, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: colors.yellow },
  sInput: { flex: 1, minWidth: 0, height: 44, fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.text, outlineWidth: 0, outlineStyle: 'none' } as object,
  sClear: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EFECE3', alignItems: 'center', justifyContent: 'center' },
  sHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sCaps: { fontSize: 13, letterSpacing: 0.6, fontFamily: fonts.heavy, color: colors.muted },
  sLink: { fontSize: 13.5, fontFamily: fonts.sansBold, color: colors.green, paddingVertical: 8 },
  sRecents: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  sRecent: { flexDirection: 'row', alignItems: 'center', height: 38, paddingLeft: 12, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', maxWidth: 260 },
  sRecentTerm: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, height: 38 },
  sRecentX: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  sRecentText: { fontSize: 14.5, fontFamily: fonts.sansSemiBold, color: colors.text },
  sList: { backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', borderBottomWidth: 1, borderColor: colors.line },
  sRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 10, paddingHorizontal: 16 },
  sSubs: { paddingHorizontal: 12, paddingBottom: 16 },
  sAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 12, paddingHorizontal: 14, height: 42,
    borderRadius: 21, backgroundColor: colors.page },
  sAllText: { fontSize: 14, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.green },
  sGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  sCell: { width: '33.333%', paddingHorizontal: 4, alignItems: 'center' },
  sTile: { width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photo, borderWidth: 1, borderColor: colors.photoLine },
  sTileImage: { position: 'absolute', top: '12%', left: '12%', right: '12%', bottom: '12%' },
  sCellText: { marginTop: 7, fontSize: 12.5, lineHeight: 16, textAlign: 'center', fontFamily: fonts.sansMedium, fontWeight: '500', color: colors.text },
  sRowText: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansBold, color: colors.text },
  sCats: { marginBottom: 22 },
  sCatRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 16 },
  sCatName: { fontSize: 15.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  sCatPath: { fontSize: 13, fontFamily: fonts.sans, color: colors.muted, marginTop: 1 },
  sCatCount: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.muted },
  sResultsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  sCount: { fontSize: 13.5, fontFamily: fonts.sansSemiBold, color: colors.muted, marginTop: 16, marginBottom: 8 },
  sEmpty: { paddingTop: 64, paddingHorizontal: 32, alignItems: 'center' },
  sEmptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EFECE3', alignItems: 'center', justifyContent: 'center' },
  sEmptyTitle: { fontSize: 23, lineHeight: 28, fontFamily: fonts.display, color: colors.text, textAlign: 'center', marginTop: 16, marginBottom: 6 },
  sEmptyText: { fontSize: 15, lineHeight: 21, fontFamily: fonts.sans, color: colors.muted, textAlign: 'center' },
  sEmptyButton: { marginTop: 18, height: 46, paddingHorizontal: 20, borderRadius: 23, backgroundColor: colors.green, justifyContent: 'center' },
  sEmptyButtonText: { fontSize: 15, fontFamily: fonts.sansBold, color: '#FFFFFF' },
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
  pillTextPhone: { fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: '700' },
  pillPhone: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, borderColor: colors.line, gap: 7 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  count: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans },
  viewButton: { width: 32, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  viewButtonOn: { backgroundColor: colors.cream },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, rowGap: 8 },
  recent: { marginTop: 4, marginBottom: 10 },
  recentPhone: { marginHorizontal: 16, marginTop: 6, marginBottom: 6, padding: 14, paddingTop: 6, borderRadius: 20, backgroundColor: '#FFFFFF' },
  recentCaps: { fontSize: 12.5, letterSpacing: 0.6, color: colors.muted, fontFamily: fonts.heavy },
  recentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentChip: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, backgroundColor: colors.page, paddingLeft: 12 },
  recentChipTerm: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, maxWidth: 220 },
  recentChipText: { fontSize: 14.5, color: colors.text, fontFamily: fonts.sansSemiBold },
  countPhone: { fontSize: 13.5, color: colors.muted, fontFamily: fonts.sansSemiBold, flexShrink: 1 },
  viewButtonPhone: { width: 40, height: 38, borderRadius: 12 },
  band: { paddingTop: 4, paddingBottom: 2, gap: 8 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipSale: { borderColor: colors.sale, backgroundColor: '#FFFFFF' },
  chipSaleOn: { backgroundColor: colors.sale, borderColor: colors.sale },
  chipText: { fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text },
  chipTextOn: { color: '#FFFFFF', fontFamily: fonts.sansBold, fontWeight: '700' },
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
