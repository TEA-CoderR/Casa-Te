import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatEuro } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { Icon } from './Icon';
import { PrimaryButton } from './UI';

export type SortId = 'featured' | 'price_asc' | 'price_desc' | 'name';
export type Filters = {
  sort: SortId;
  brands: string[];
  colors: string[];
  price: { min: number | null; max: number | null };
  onlyAvailable: boolean;
};
export const EMPTY_FILTERS: Filters = { sort: 'featured', brands: [], colors: [], price: { min: null, max: null }, onlyAvailable: false };
export type FilterSection = 'all' | 'brand' | 'color' | 'price';

export const SORTS: Array<{ id: SortId; label: string }> = [
  { id: 'featured', label: 'In evidenza' },
  { id: 'price_asc', label: 'Prezzo crescente' },
  { id: 'price_desc', label: 'Prezzo decrescente' },
  { id: 'name', label: 'Nome A-Z' },
];

/** Price bands built from the catalogue's real price range (in cents). */
export function priceBands(minCents: number, maxCents: number): Array<{ label: string; min: number | null; max: number | null }> {
  const steps = [500, 1000, 2500, 5000, 10000, 25000, 50000].filter((v) => v > minCents && v < maxCents);
  if (!steps.length) return [];
  const bands: Array<{ label: string; min: number | null; max: number | null }> = [{ label: `Fino a ${formatEuro(steps[0])}`, min: null, max: steps[0] }];
  for (let i = 1; i < steps.length; i++) bands.push({ label: `${formatEuro(steps[i - 1])} – ${formatEuro(steps[i])}`, min: steps[i - 1], max: steps[i] });
  bands.push({ label: `Oltre ${formatEuro(steps[steps.length - 1])}`, min: steps[steps.length - 1], max: null });
  return bands;
}

export function FilterSheet({ visible, section, filters, onChange, onClose, facets, total }: {
  visible: boolean; section: FilterSection; filters: Filters; onChange: (f: Filters) => void; onClose: () => void;
  facets: { brands: string[]; colors: string[]; minCents: number; maxCents: number } | null; total: number | null;
}) {
  const show = (s: FilterSection) => section === 'all' || section === s;
  const toggle = (list: string[], value: string) => list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const bands = facets ? priceBands(facets.minCents, facets.maxCents) : [];
  const title = section === 'brand' ? 'Marca' : section === 'color' ? 'Colore' : section === 'price' ? 'Prezzo' : 'Filtra e ordina';
  const reset = () => onChange(section === 'all' ? EMPTY_FILTERS
    : section === 'brand' ? { ...filters, brands: [] } : section === 'color' ? { ...filters, colors: [] } : { ...filters, price: { min: null, max: null } });

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi filtri" />
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Pressable onPress={reset} accessibilityRole="button" hitSlop={8}><Text style={styles.reset}>Azzera</Text></Pressable>
      </View>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {section === 'all' && <>
          <Text style={styles.group}>Ordina per</Text>
          <View style={styles.wrap}>{SORTS.map((o) => <Chip key={o.id} label={o.label} on={filters.sort === o.id}
            onPress={() => onChange({ ...filters, sort: o.id })} radio />)}</View>
          <Text style={styles.group}>Disponibilità</Text>
          <View style={styles.wrap}><Chip label="Solo disponibili nel mio negozio" on={filters.onlyAvailable}
            onPress={() => onChange({ ...filters, onlyAvailable: !filters.onlyAvailable })} /></View>
        </>}
        {show('brand') && <>
          {section === 'all' && <Text style={styles.group}>Marca</Text>}
          {facets?.brands.length ? <View style={styles.wrap}>{facets.brands.map((b) => <Chip key={b} label={b} on={filters.brands.includes(b)}
            onPress={() => onChange({ ...filters, brands: toggle(filters.brands, b) })} />)}</View>
            : <Text style={styles.empty}>Nessuna marca indicata per questi prodotti.</Text>}
        </>}
        {show('color') && <>
          {section === 'all' && <Text style={styles.group}>Colore</Text>}
          {facets?.colors.length ? <View style={styles.wrap}>{facets.colors.map((c) => <Chip key={c} label={c} on={filters.colors.includes(c)}
            onPress={() => onChange({ ...filters, colors: toggle(filters.colors, c) })} />)}</View>
            : <Text style={styles.empty}>Nessun colore indicato per questi prodotti.</Text>}
        </>}
        {show('price') && <>
          {section === 'all' && <Text style={styles.group}>Prezzo</Text>}
          {bands.length ? <View style={styles.wrap}>{bands.map((b) => {
            const on = filters.price.min === b.min && filters.price.max === b.max;
            return <Chip key={b.label} label={b.label} on={on} radio
              onPress={() => onChange({ ...filters, price: on ? { min: null, max: null } : { min: b.min, max: b.max } })} />;
          })}</View> : <Text style={styles.empty}>Tutti i prodotti hanno un prezzo simile.</Text>}
        </>}
      </ScrollView>
      <PrimaryButton title={total === null ? 'Mostra prodotti' : `Mostra ${total} ${total === 1 ? 'prodotto' : 'prodotti'}`} onPress={onClose} />
    </View>
  </Modal>;
}

function Chip({ label, on, onPress, radio }: { label: string; on: boolean; onPress: () => void; radio?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityState={{ checked: on }}
    style={[styles.chip, on && styles.chipOn]}>
    {on && <Icon name="check" size={14} color="#fff" strokeWidth={2} />}
    <Text style={[styles.chipText, on && { color: '#fff' }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 24, 18, 0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 560, alignSelf: 'center', width: '100%', marginHorizontal: 'auto',
    backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28, gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontFamily: fonts.serif, color: colors.text },
  reset: { fontSize: 14, color: colors.green, textDecorationLine: 'underline', fontFamily: fonts.sansMedium },
  group: { fontSize: 16, fontFamily: fonts.serif, color: colors.text, marginTop: 16, marginBottom: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontSize: 14, color: colors.text, fontFamily: fonts.sans },
  empty: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans, paddingVertical: 6 },
});
