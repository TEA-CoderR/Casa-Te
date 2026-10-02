import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, Loading, Notice, PageTitle, PrimaryButton } from '@/components/UI';
import { fetchProducts } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';
import { useFavorites } from '@/store/favorites';

export default function FavoritesScreen() {
  const ids = useFavorites((s) => s.ids);
  const { selected } = useStores();
  const { columns } = useLayout();
  const key = ids.length ? `favorites:${selected?.id}:${ids.join(',')}` : null;
  const { data, loading, error, refetch } = useQuery(key, () => fetchProducts({ storeId: selected?.id ?? null, ids, pageSize: 200 }));
  // Keep the order in which products were saved (newest first); hide products no longer on sale.
  const items = (data?.items ?? []).slice().sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).filter((p) => ids.includes(p.id));

  if (!ids.length) return <Screen><PageTitle title="Preferiti" />
    <EmptyState icon="heart" title="Nessun preferito" message="Tocca il cuore su un prodotto per ritrovarlo qui.">
      <PrimaryButton title="Scopri i prodotti" onPress={() => router.push('/catalog')} />
    </EmptyState></Screen>;

  return <Screen refreshing={loading && !!data} onRefresh={refetch}>
    <PageTitle title="Preferiti" subtitle={`${ids.length} ${ids.length === 1 ? 'prodotto' : 'prodotti'}`} />
    {error && !data ? <Notice tone="error" message="Impossibile caricare i preferiti. Controlla la connessione." />
      : !data ? <Loading /> : <View style={styles.grid}>{items.map((product) =>
        <View key={product.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 6, flexDirection: 'row' }}>
          <ProductCard product={product} /></View>)}</View>}
  </Screen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 12 },
});
