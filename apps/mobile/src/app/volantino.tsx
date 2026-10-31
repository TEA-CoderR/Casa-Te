// Volantino: the shop's printed flyer, published from the admin. The cover hangs from the green band like a
// leaflet on the shop counter; the pages are listed by name and open in a full-screen viewer you swipe through.
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import type { FlyerRow } from '@casa-te/shared';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Screen } from '@/components/Screen';
import { BrandHeader, HeaderBack, StatusBand } from '@/components/BrandHeader';
import { EmptyState, Loading, Notice, PrimaryButton } from '@/components/UI';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/config/theme';
import { fetchFlyers } from '@/lib/api';
import { useLayout } from '@/lib/hooks';
import { useQuery } from '@/lib/useQuery';

type Flyer = FlyerRow & { pdf: string | null; pages: string[] };

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

/** "Valido dal 15 ottobre al 1 novembre", from whatever dates the flyer has. */
function validity(from: string | null, to: string | null): string {
  if (from && to) return `Valido dal ${day(from)} al ${day(to)}`;
  if (to) return `Valido fino al ${day(to)}`;
  if (from) return `Valido dal ${day(from)}`;
  return '';
}

/** Days left including today (1 = last day), or null without an end date. */
function daysLeft(to: string | null): number | null {
  if (!to) return null;
  const end = new Date(`${to}T23:59:59`).getTime();
  return Math.max(1, Math.ceil((end - Date.now()) / 86400000));
}
const leftLabel = (n: number | null) => n === null ? '' : n === 1 ? 'Ultimo giorno' : n === 2 ? 'Fino a domani' : `Ancora ${n} giorni`;
const pageName = (f: Flyer, i: number) => f.page_titles?.[i]?.trim() || (i === 0 ? 'Copertina' : `Pagina ${i + 1}`);

/** Width / height of an image, portrait A4 until it is known. */
function useRatio(uri: string | undefined) {
  const [ratio, setRatio] = useState(0.73);
  useEffect(() => { if (uri) Image.getSize(uri, (w, h) => { if (w && h) setRatio(w / h); }, () => {}); }, [uri]);
  return ratio;
}

export default function FlyerScreen() {
  const { data, loading, error, refetch } = useQuery('flyers', fetchFlyers);
  const { wide } = useLayout();
  const [viewer, setViewer] = useState<{ flyer: Flyer; page: number } | null>(null);
  const first = data?.[0];
  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  const hasCover = !!first?.pages.length;
  // Phone: the band leaves room for the cover to hang from it.
  const band = wide ? undefined : <BrandHeader inScroll title="Volantino" subtitle={first ? validity(first.valid_from, first.valid_to) : undefined}
    titleSize={30} pad={[14, 16, hasCover ? 190 : 18]} left={<HeaderBack onPress={back} />} />;

  return <Screen stack header={wide ? undefined : <StatusBand />} top={band} ground={colors.page} refreshing={loading && !!data} onRefresh={refetch}
    maxWidth={760} contentContainerStyle={wide ? { padding: 24, gap: 12 } : { padding: 0, paddingBottom: 32 }} bodyStyle={wide ? undefined : { paddingHorizontal: 16 }}>
    <Stack.Screen options={wide ? { title: 'Volantino', header: () => <SiteHeader /> } : { headerShown: false, title: 'Volantino' }} />
    {error && !data ? <Notice tone="error" message="Impossibile caricare il volantino. Controlla la connessione e riprova." />
      : !data ? <Loading />
      : !data.length ? <EmptyState icon="flyer" title="Nessun volantino al momento" message="Il nuovo volantino arriva presto. Intanto guarda le offerte del negozio online.">
          <PrimaryButton title="Vedi le offerte" onPress={() => router.push({ pathname: '/catalog', params: { offerte: '1', evidenza: '', category: '' } })} />
        </EmptyState>
      : data.map((flyer, n) => <FlyerSection key={flyer.id} flyer={flyer} hanging={!wide && n === 0} onOpen={(page) => setViewer({ flyer, page })} />)}
    {viewer && <FlyerViewer flyer={viewer.flyer} start={viewer.page} onClose={() => setViewer(null)} />}
  </Screen>;
}

function FlyerSection({ flyer, hanging, onOpen }: { flyer: Flyer; hanging: boolean; onOpen: (page: number) => void }) {
  const cover = flyer.pages[0];
  const ratio = useRatio(cover);
  const left = daysLeft(flyer.valid_to);
  const open = (url: string) => Platform.OS === 'web' && typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener') : Linking.openURL(url);

  return <View style={{ marginTop: hanging ? -176 : 8 }}>
    {/* The cover, a little askew like a leaflet left on the counter, with the end date on a yellow tag. */}
    {!!cover && <Animated.View entering={FadeInDown.duration(380)} style={styles.coverWrap}>
      <Pressable onPress={() => onOpen(0)} accessibilityRole="button" accessibilityLabel={`Sfoglia ${flyer.title}`}
        style={({ pressed }) => [styles.cover, { aspectRatio: ratio }, pressed && { transform: [{ rotate: '-1deg' }, { scale: 0.985 }] }]}>
        <Image source={{ uri: cover }} resizeMode="cover" style={styles.coverImage} accessibilityIgnoresInvertColors />
      </Pressable>
      {left !== null && <View style={styles.tag} accessibilityElementsHidden>
        <View style={styles.tagHole} />
        <Text style={styles.tagSmall}>fino al</Text>
        <Text style={styles.tagBig}>{new Date(`${flyer.valid_to}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</Text>
      </View>}
    </Animated.View>}

    <Text style={styles.title} accessibilityRole="header">{flyer.title}</Text>
    <View style={styles.meta}>
      {left !== null && <View style={styles.status}><View style={[styles.dot, left <= 2 && { backgroundColor: colors.sale }]} />
        <Text style={[styles.statusText, left <= 2 && { color: colors.sale }]}>{leftLabel(left)}</Text></View>}
      {!!flyer.pages.length && <Text style={styles.metaText}>{flyer.pages.length} {flyer.pages.length === 1 ? 'pagina' : 'pagine'}</Text>}
    </View>

    <View style={styles.actions}>
      {!!flyer.pages.length && <Pressable onPress={() => onOpen(0)} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && { opacity: 0.88 }]}>
        <Text style={styles.primaryText}>Sfoglia il volantino</Text><Icon name="arrow" size={18} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>}
      {!!flyer.pdf && <Pressable onPress={() => open(flyer.pdf!)} accessibilityRole="link" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]}>
        <Text style={styles.secondaryText}>PDF</Text>
      </Pressable>}
    </View>

    {!!flyer.note && <View style={styles.note}>
      <Text style={styles.noteTitle}>Come funziona</Text>
      <Text style={styles.noteText}>{flyer.note}</Text>
      <Pressable onPress={() => router.push('/club')} accessibilityRole="link" hitSlop={6} style={styles.noteLink}>
        <Text style={styles.noteLinkText}>La tua tessera nell’app</Text><Icon name="chevron" size={15} color={colors.green} strokeWidth={2.4} />
      </Pressable>
    </View>}

    {flyer.pages.length > 1 && <>
      <Text style={styles.h}>Le pagine</Text>
      <View style={styles.grid}>{flyer.pages.map((uri, i) => <Pressable key={uri} onPress={() => onOpen(i)} accessibilityRole="button"
        accessibilityLabel={`${pageName(flyer, i)}, pagina ${i + 1} di ${flyer.pages.length}`} style={({ pressed }) => [styles.cell, pressed && { opacity: 0.8 }]}>
        <View style={[styles.thumb, { aspectRatio: ratio }]}>
          <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          <View style={styles.thumbNumber}><Text style={styles.thumbNumberText}>{i + 1}</Text></View>
        </View>
        <Text style={styles.thumbName} numberOfLines={1}>{pageName(flyer, i)}</Text>
      </Pressable>)}</View>
    </>}
  </View>;
}

/** Full-screen pages, one per screen: swipe or use the arrows; the strip at the bottom jumps to a page. */
function FlyerViewer({ flyer, start, onClose }: { flyer: Flyer; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(start);
  const go = (i: number) => { const to = Math.max(0, Math.min(flyer.pages.length - 1, i)); setPage(to); pager.current?.scrollTo({ x: to * width, animated: true }); };
  useEffect(() => { const t = setTimeout(() => pager.current?.scrollTo({ x: start * width, animated: false }), 0); return () => clearTimeout(t); }, [start, width]);
  // Arrow keys on the web shop.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const key = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(page + 1); else if (e.key === 'ArrowLeft') go(page - 1); else if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const pageH = height - insets.top - insets.bottom - 64 - 92;

  return <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={[styles.viewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.vBar}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi" hitSlop={8} style={styles.vClose}><Icon name="close" size={20} color="#FFFFFF" strokeWidth={2.4} /></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.vTitle} numberOfLines={1}>{pageName(flyer, page)}</Text>
          <Text style={styles.vCount}>{page + 1} di {flyer.pages.length}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={Platform.OS === 'web' ? (e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width)) : undefined} scrollEventThrottle={64}>
        {flyer.pages.map((uri, i) => <ScrollView key={uri} style={{ width }} contentContainerStyle={styles.vPage} maximumZoomScale={3} minimumZoomScale={1}
          centerContent showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
          <Animated.Image entering={FadeIn.duration(250)} source={{ uri }} resizeMode="contain" accessibilityLabel={`${pageName(flyer, i)}, pagina ${i + 1}`}
            style={{ width: width - 24, height: pageH }} />
        </ScrollView>)}
      </ScrollView>
      {flyer.pages.length > 1 && <>
        {page > 0 && <Pressable onPress={() => go(page - 1)} accessibilityRole="button" accessibilityLabel="Pagina precedente" style={[styles.vArrow, { left: 8 }]}>
          <Icon name="back" size={22} color="#FFFFFF" strokeWidth={2.4} /></Pressable>}
        {page < flyer.pages.length - 1 && <Pressable onPress={() => go(page + 1)} accessibilityRole="button" accessibilityLabel="Pagina successiva" style={[styles.vArrow, { right: 8 }]}>
          <Icon name="chevron" size={22} color="#FFFFFF" strokeWidth={2.4} /></Pressable>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.vStrip}>
          {flyer.pages.map((uri, i) => <Pressable key={uri} onPress={() => go(i)} accessibilityRole="button" accessibilityLabel={`Vai a ${pageName(flyer, i)}`}
            style={[styles.vThumb, i === page && styles.vThumbOn]}>
            <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          </Pressable>)}
        </ScrollView>
      </>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  coverWrap: { alignSelf: 'center', width: '74%', maxWidth: 360 },
  cover: { width: '100%', borderRadius: 6, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 5, borderColor: '#FFFFFF',
    transform: [{ rotate: '-2deg' }], shadowColor: '#0A180C', shadowOpacity: 0.3, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  coverImage: { width: '100%', height: '100%' },
  // A shelf price tag: yellow, a hole at the top, the end date.
  tag: { position: 'absolute', top: -10, right: -14, width: 74, paddingTop: 16, paddingBottom: 9, borderRadius: 10, backgroundColor: colors.yellow, alignItems: 'center',
    transform: [{ rotate: '6deg' }], shadowColor: '#0A180C', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  tagHole: { position: 'absolute', top: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  tagSmall: { fontSize: 11, fontFamily: fonts.sansBold, color: colors.text },
  tagBig: { fontSize: 17, lineHeight: 20, fontFamily: fonts.heavy, color: colors.text },

  title: { fontSize: 28, lineHeight: 33, fontFamily: fonts.display, color: colors.text, textAlign: 'center', marginTop: 26, paddingHorizontal: 8 },
  meta: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  statusText: { fontSize: 14, fontFamily: fonts.heavy, color: colors.green },
  metaText: { fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.muted },

  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primary: { flex: 1, height: 54, borderRadius: 27, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { fontSize: 16.5, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  secondary: { height: 54, paddingHorizontal: 22, borderRadius: 27, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontFamily: fonts.sansBold, color: colors.text },

  note: { marginTop: 16, padding: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: colors.green },
  noteTitle: { fontSize: 15, fontFamily: fonts.heavy, color: colors.green },
  noteText: { fontSize: 14.5, lineHeight: 21, fontFamily: fonts.sans, color: colors.text, marginTop: 3 },
  noteLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 8 },
  noteLinkText: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.green },

  h: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display, color: colors.text, marginTop: 26, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  cell: { width: '48.4%' },
  thumb: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  thumbNumber: { position: 'absolute', left: 8, bottom: 8, minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 6, backgroundColor: 'rgba(24,32,26,0.78)',
    alignItems: 'center', justifyContent: 'center' },
  thumbNumberText: { fontSize: 13, fontFamily: fonts.heavy, color: '#FFFFFF' },
  thumbName: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.text, marginTop: 7, marginLeft: 2 },

  viewer: { flex: 1, backgroundColor: '#0F1A12' },
  vBar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  vClose: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  vTitle: { fontSize: 18, fontFamily: fonts.display, color: '#FFFFFF' },
  vCount: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.onBrand, marginTop: 1 },
  vPage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  vArrow: { position: 'absolute', top: '46%', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  vStrip: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  vThumb: { width: 50, height: 68, borderRadius: 6, overflow: 'hidden', opacity: 0.55, borderWidth: 2, borderColor: 'transparent' },
  vThumbOn: { opacity: 1, borderColor: colors.yellow },
});
