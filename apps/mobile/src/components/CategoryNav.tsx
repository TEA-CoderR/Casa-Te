import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CategoryRow } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { BrandHeader } from './BrandHeader';
import { CategoryIcon } from './CategoryIcon';
import { Icon } from './Icon';

type Covers = Record<string, { image: string | null }> | null | undefined;
type Counts = Record<string, number> | null | undefined;

const plural = (n: number) => `${n.toLocaleString('it-IT')} ${n === 1 ? 'prodotto' : 'prodotti'}`;

/** Products in a department: its own plus its subcategories'. */
export function departmentCount(all: CategoryRow[], counts: Counts, id: string) {
  return [id, ...all.filter((c) => c.parent_id === id).map((c) => c.id)].reduce((sum, x) => sum + (counts?.[x] ?? 0), 0);
}

/** Subcategories that have something to show (all of them until the counts arrive). */
export function liveChildren(all: CategoryRow[], counts: Counts, id: string) {
  return all.filter((c) => c.parent_id === id && (!counts || (counts[c.id] ?? 0) > 0));
}

/** A product photo on a white plate, like every product photo in the shop; the department sign while there is none. */
export function CategoryPhoto({ image, slug, name, size, radius, bare }: {
  image: string | null | undefined; slug: string; name: string; size?: number; radius?: number;
  /** Inside a plate that already has its own edge. */
  bare?: boolean;
}) {
  return <View style={[styles.photo, bare && { borderWidth: 0 }, size ? { width: size, height: size, borderRadius: radius ?? size * 0.24 } : { width: '100%', aspectRatio: 1, borderRadius: radius ?? 14 }]}>
    {image
      ? <Image source={{ uri: image }} resizeMode="contain" accessibilityIgnoresInvertColors style={[styles.photoImage, { mixBlendMode: 'multiply' } as object]} />
      : <CategoryIcon slug={slug} name={name} size={size ? size * 0.5 : 30} strokeWidth={1.4} />}
  </View>;
}

/**
 * "Categorie" tab on phones: the whole shop at two taps. Departments down a rail on the left, the chosen
 * department's subcategories as photo tiles on the right (the layout of the big grocery and household apps,
 * which carry the same 15–20 departments). `layout="tiles"` is the alternative under review: the departments as
 * a grid of photo plates, each opening its department page.
 */
export function CategoryBrowser({ all, counts, covers, layout = 'rail', onOpen, onSearch }: {
  all: CategoryRow[]; counts: Counts; covers: Covers; layout?: 'rail' | 'tiles';
  onOpen: (id: string) => void; onSearch: () => void;
}) {
  const departments = all.filter((c) => !c.parent_id && (!counts || departmentCount(all, counts, c.id) > 0));
  const [dept, setDept] = useState<string | null>(null);
  const active = departments.find((d) => d.id === dept) ?? departments[0] ?? null;
  const total = departments.reduce((sum, d) => sum + departmentCount(all, counts, d.id), 0);
  const cover = (id: string) => covers?.[id]?.image ?? liveChildren(all, counts, id).map((c) => covers?.[c.id]?.image).find(Boolean) ?? null;
  const panel = useRef<ScrollView>(null);

  const header = <BrandHeader title="Categorie" pad={[12, 16, 16]}>
    <Pressable onPress={onSearch} accessibilityRole="search" accessibilityLabel="Cerca prodotti"
      style={({ pressed }) => [styles.search, pressed && { opacity: 0.9 }]}>
      <Icon name="search" size={19} color={colors.text} strokeWidth={2.1} />
      <Text style={styles.searchText} numberOfLines={1}>{total ? `Cerca tra ${plural(total)}` : 'Cerca prodotti e marche'}</Text>
    </Pressable>
  </BrandHeader>;

  if (layout === 'tiles') {
    return <View style={styles.page}>
      {header}
      <ScrollView contentContainerStyle={styles.tiles}>
        {departments.map((d) => {
          const n = departmentCount(all, counts, d.id);
          return <Pressable key={d.id} onPress={() => onOpen(d.id)} accessibilityRole="link" accessibilityLabel={`${d.name}, ${plural(n)}`}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8 }]}>
            <CategoryPhoto image={cover(d.id)} slug={d.slug} name={d.name} radius={0} bare />
            <View style={styles.tileText}>
              <Text style={styles.tileName} numberOfLines={1}>{d.name}</Text>
              {counts && <Text style={styles.tileCount}>{plural(n)}</Text>}
            </View>
          </Pressable>;
        })}
      </ScrollView>
    </View>;
  }

  const subs = active ? liveChildren(all, counts, active.id) : [];
  return <View style={styles.page}>
    {header}
    <View style={styles.split}>
      <ScrollView style={styles.rail} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} accessibilityRole="tablist">
        {departments.map((d) => {
          const on = d.id === active?.id;
          return <Pressable key={d.id} onPress={() => { setDept(d.id); panel.current?.scrollTo({ y: 0, animated: false }); }}
            accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.railItem, on && styles.railItemOn, pressed && !on && { backgroundColor: colors.well }]}>
            {on && <View style={styles.railMark} />}
            <Text style={[styles.railText, on && styles.railTextOn]} numberOfLines={2}>{d.name}</Text>
          </Pressable>;
        })}
      </ScrollView>
      <ScrollView ref={panel} style={styles.panel} contentContainerStyle={{ padding: 12, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {active && <>
          <Pressable onPress={() => onOpen(active.id)} accessibilityRole="link" accessibilityLabel={`Tutto in ${active.name}`}
            style={({ pressed }) => [styles.panelHead, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.panelTitle} numberOfLines={1} accessibilityRole="header">{active.name}</Text>
              <Text style={styles.panelLink}>Vedi tutti{counts ? ` · ${plural(departmentCount(all, counts, active.id))}` : ''}</Text>
            </View>
            <Icon name="chevron" size={18} color={colors.text} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.grid}>
            {subs.map((c) => <Pressable key={c.id} onPress={() => onOpen(c.id)} accessibilityRole="link"
              accessibilityLabel={`${c.name}${counts ? `, ${plural(counts[c.id] ?? 0)}` : ''}`}
              style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}>
              <CategoryPhoto image={covers?.[c.id]?.image} slug={active.slug} name={c.name} />
              <Text style={styles.cellName} numberOfLines={2}>{c.name}</Text>
            </Pressable>)}
          </View>
        </>}
      </ScrollView>
    </View>
  </View>;
}

/**
 * Subcategories on a department page: one line of plain tabs with an underline (no pills), the chosen one
 * scrolled into view, and a "list" button in front that opens every subcategory at once (SubcategorySheet),
 * so nothing is ever more than one tap away, however many there are.
 */
export function SubcategoryTabs({ items, active, onSelect, onOpenAll }: {
  items: Array<{ id: string | null; name: string }>; active: string | null;
  onSelect: (id: string | null) => void; onOpenAll: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const [x, setX] = useState<Record<string, number>>({});
  const key = (id: string | null) => id ?? 'all';
  useEffect(() => {
    const at = x[key(active)];
    if (at !== undefined) scroll.current?.scrollTo({ x: Math.max(0, at - 24), animated: true });
  }, [active, x[key(active)]]); // eslint-disable-line react-hooks/exhaustive-deps

  return <View style={styles.tabsRow}>
    <Pressable onPress={onOpenAll} accessibilityRole="button" accessibilityLabel={`Tutte le categorie (${items.length - 1})`}
      style={({ pressed }) => [styles.allButton, pressed && { backgroundColor: colors.well }]}>
      <Icon name="menu" size={20} color={colors.text} strokeWidth={2.2} />
    </Pressable>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.id === active;
        return <Pressable key={key(it.id)} onPress={() => onSelect(it.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
          onLayout={(e: LayoutChangeEvent) => { const v = e.nativeEvent.layout.x; setX((m) => (m[key(it.id)] === v ? m : { ...m, [key(it.id)]: v })); }}
          style={styles.tab}>
          <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{it.name}</Text>
          <View style={[styles.tabLine, on && styles.tabLineOn]} />
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

/** Every subcategory of a department in one list, with a photo and the number of products; the current one is ticked. */
export function SubcategorySheet({ visible, onClose, title, items, active, onSelect }: {
  visible: boolean; onClose: () => void; title: string;
  items: Array<{ id: string | null; name: string; count?: number; image?: string | null; slug: string }>;
  active: string | null; onSelect: (id: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi" />
    <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]} accessibilityViewIsModal>
      <View style={styles.grip} />
      <View style={styles.sheetHead}>
        <Text style={styles.sheetTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi" style={styles.close}><Icon name="close" size={18} /></Pressable>
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {items.map((it, i) => {
          const on = it.id === active;
          return <Pressable key={it.id ?? 'all'} onPress={() => { onSelect(it.id); onClose(); }} accessibilityRole="link" accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { backgroundColor: colors.page }]}>
            <CategoryPhoto image={it.image} slug={it.slug} name={it.name} size={48} radius={12} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.rowName, on && styles.rowNameOn]} numberOfLines={1}>{it.name}</Text>
              {it.count !== undefined && <Text style={styles.rowCount}>{plural(it.count)}</Text>}
            </View>
            {on ? <Icon name="check" size={20} color={colors.green} strokeWidth={2.6} /> : <Icon name="chevron" size={17} color="#9A9F94" strokeWidth={2.2} />}
          </Pressable>;
        })}
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, marginTop: 14, paddingHorizontal: 16, borderRadius: 23, backgroundColor: '#FFFFFF' },
  searchText: { flex: 1, fontSize: 15.5, fontFamily: fonts.sansSemiBold, color: colors.muted },

  split: { flex: 1, flexDirection: 'row' },
  rail: { width: 104, flexGrow: 0, backgroundColor: colors.page },
  railItem: { minHeight: 62, justifyContent: 'center', paddingLeft: 12, paddingRight: 8, paddingVertical: 10 },
  railItemOn: { backgroundColor: '#FFFFFF' },
  railMark: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.green },
  railText: { fontSize: 13, lineHeight: 17, fontFamily: fonts.sansSemiBold, color: colors.muted },
  railTextOn: { fontFamily: fonts.heavy, color: colors.text },
  panel: { flex: 1, backgroundColor: '#FFFFFF' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 14, marginBottom: 14, borderBottomWidth: 1, borderColor: colors.line },
  panelTitle: { fontSize: 24, lineHeight: 29, fontFamily: fonts.display, color: colors.text },
  panelLink: { fontSize: 13.5, fontFamily: fonts.sansSemiBold, color: colors.muted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 16 },
  cell: { width: '33.333%', paddingHorizontal: 4 },
  cellName: { marginTop: 7, fontSize: 12, lineHeight: 15.5, textAlign: 'center', fontFamily: fonts.sansMedium, color: colors.text },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, padding: 16, paddingBottom: 32 },
  tile: { width: '48.4%', backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  tileText: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.line },
  tileName: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display, color: colors.text },
  tileCount: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted, marginTop: 1 },

  photo: { backgroundColor: colors.photo, borderWidth: 1, borderColor: colors.photoLine, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoImage: { position: 'absolute', top: '12%', left: '12%', right: '12%', bottom: '12%' },

  tabsRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderColor: colors.line },
  allButton: { width: 52, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.line },
  tabs: { paddingHorizontal: 8 },
  tab: { paddingHorizontal: 10, justifyContent: 'flex-end' },
  tabText: { fontSize: 15, lineHeight: 20, paddingTop: 13, paddingBottom: 11, fontFamily: fonts.sansSemiBold, color: colors.muted },
  tabTextOn: { fontFamily: fonts.heavy, color: colors.text },
  tabLine: { height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  tabLineOn: { backgroundColor: colors.green },

  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16, 24, 18, 0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '82%', maxWidth: 520, alignSelf: 'center', marginHorizontal: 'auto',
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30, shadowOffset: { width: 0, height: -8 } },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCD7CA' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  sheetTitle: { flex: 1, fontSize: 26, lineHeight: 31, fontFamily: fonts.display, color: colors.text },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 10, paddingHorizontal: 20 },
  rowLine: { borderTopWidth: 1, borderColor: '#EFECE3' },
  rowName: { fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.text },
  rowNameOn: { fontFamily: fonts.heavy },
  rowCount: { fontSize: 13, fontFamily: fonts.sans, color: colors.muted, marginTop: 1 },
});
