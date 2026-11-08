import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, fonts } from '@/config/theme';
import { formatEuro } from '@/lib/price';
import type { CatalogProduct } from '@/lib/api';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';
import { RemoteImage } from './RemoteImage';

const CLUB_CARD = require('../../assets/club-card.webp');

/** Poster inks: the shop-sign green and the logo lime, the two colours of the CASA & TE sign. */
const GREEN = colors.sign;
const LIME = colors.signInk;
const HEIGHT = 300;

export type Poster =
  | { kind: 'offer'; product: CatalogProduct; onPress: () => void }
  | { kind: 'flyer'; title: string; until: string | null; cover: string; onPress: () => void }
  | { kind: 'club'; member: boolean; onPress: () => void }
  | { kind: 'pickup'; store: string; onPress: () => void };

/** Green and white awning stripes along the top of a poster: the shop front, as on the stores. */
function Awning({ width }: { width: number }) {
  const n = Math.ceil(width / 22);
  return <View style={styles.awning}>{Array.from({ length: n }, (_, i) =>
    <View key={i} style={[styles.stripe, { backgroundColor: i % 2 ? '#FFFFFF' : GREEN }]} />)}</View>;
}

function Cta({ label, ink, ground }: { label: string; ink: string; ground: string }) {
  return <View style={[styles.cta, { backgroundColor: ground }]}>
    <Text style={[styles.ctaText, { color: ink }]}>{label}</Text><Icon name="arrow" size={15} color={ink} strokeWidth={2.4} />
  </View>;
}

function OfferPoster({ product }: { product: CatalogProduct }) {
  const was = product.compare_at_price_cents ?? 0;
  const pct = was > product.price_cents ? Math.round((1 - product.price_cents / was) * 100) : 0;
  return <View style={[styles.fill, { backgroundColor: GREEN }]}>
    <View style={styles.disc}><View style={{ width: 168, height: 168 }}>
      <ProductImage uri={product.image} sku={product.sku} label={product.name} inset={0} />
    </View></View>
    <View style={styles.copy}>
      <Text style={[styles.eyebrow, { color: LIME }]}>OFFERTA</Text>
      <Text style={[styles.giant, { color: LIME }]} numberOfLines={1}>{pct ? `−${pct}%` : 'Offerta'}</Text>
      <Text style={styles.offerName} numberOfLines={2}>{product.brand ? `${product.brand} · ` : ''}{product.name}</Text>
      <View style={styles.priceRow}>
        <View style={styles.priceChip}><Text style={styles.priceChipText}>{formatEuro(product.price_cents)}</Text></View>
        {pct > 0 && <Text style={styles.was}>{formatEuro(was)}</Text>}
      </View>
    </View>
  </View>;
}

function FlyerPoster({ title, until, cover }: { title: string; until: string | null; cover: string }) {
  return <View style={[styles.fill, { backgroundColor: LIME }]}>
    <View style={styles.flyerCover}><RemoteImage uri={cover} style={{ width: '100%', height: '100%' }} /></View>
    <View style={[styles.copy, { width: '56%' }]}>
      <Text style={[styles.eyebrow, { color: GREEN }]}>VOLANTINO</Text>
      <Text style={[styles.title, { color: GREEN }]} numberOfLines={3}>{title}</Text>
      {!!until && <Text style={[styles.body, { color: GREEN }]}>Fino al {until}</Text>}
      <Cta label="Sfoglia" ink={LIME} ground={GREEN} />
    </View>
  </View>;
}

function ClubPoster({ member }: { member: boolean }) {
  return <View style={[styles.fill, { backgroundColor: GREEN }]}>
    <Image source={CLUB_CARD} style={styles.clubCard} accessibilityIgnoresInvertColors />
    <View style={styles.copy}>
      <Text style={[styles.eyebrow, { color: LIME }]}>CASA & TE CLUB</Text>
      <Text style={[styles.title, { color: LIME, fontSize: 40, lineHeight: 42 }]}>Prezzi{'\n'}Soci</Text>
      <Text style={[styles.body, { color: '#FFFFFF' }]}>{member ? 'Sei socio: li trovi già nel carrello' : 'Iscrizione gratuita, subito attiva'}</Text>
      <Cta label={member ? 'La tua tessera' : 'Iscriviti'} ink={GREEN} ground={LIME} />
    </View>
  </View>;
}

function PickupPoster({ store, width }: { store: string; width: number }) {
  return <View style={[styles.fill, { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line }]}>
    <Awning width={width} />
    {/* The price of pickup, on the lime price chip of the shop. */}
    <View style={styles.zeroTag}><Text style={styles.zeroSmall}>€</Text><Text style={styles.zeroBig}>0</Text><Text style={styles.zeroSmall}>,00</Text></View>
    <View style={[styles.copy, { top: 52, width: '58%' }]}>
      <Text style={[styles.eyebrow, { color: GREEN }]}>RITIRO IN NEGOZIO</Text>
      <Text style={[styles.title, { color: GREEN, fontSize: 40, lineHeight: 42 }]}>Sempre{'\n'}gratis</Text>
      <Text style={[styles.body, { color: colors.text }]} numberOfLines={2}>{store ? `Ordina ora, ritira a ${store}` : 'Ordina ora, ritira nel tuo negozio'}</Text>
      <Cta label="Come funziona" ink={LIME} ground={GREEN} />
    </View>
  </View>;
}

const LABEL: Record<Poster['kind'], string> = { offer: 'Offerta', flyer: 'Volantino', club: 'Casa & Te Club', pickup: 'Ritiro gratis' };

/**
 * Home posters: the shop's own campaign posters, set from real data (the best offer, the flyer, the Club, free
 * pickup) in the two colours of the CASA & TE sign. They turn every 5 s until touched.
 */
export function HomePosters({ posters }: { posters: Poster[] }) {
  const { width } = useWindowDimensions();
  const w = width - 32;
  const [index, setIndex] = useState(0);
  const pager = useRef<ScrollView>(null);
  const touched = useRef(false);
  useEffect(() => {
    if (posters.length < 2) return;
    const t = setInterval(() => {
      if (touched.current) return;
      setIndex((i) => { const next = (i + 1) % posters.length; pager.current?.scrollTo({ x: next * (w + 10), animated: true }); return next; });
    }, 5000);
    return () => clearInterval(t);
  }, [posters.length, w]);
  if (!posters.length) return null;
  const art = (p: Poster): ReactNode => p.kind === 'offer' ? <OfferPoster product={p.product} />
    : p.kind === 'flyer' ? <FlyerPoster title={p.title} until={p.until} cover={p.cover} />
    : p.kind === 'club' ? <ClubPoster member={p.member} /> : <PickupPoster store={p.store} width={w} />;
  return <View>
    <ScrollView ref={pager} horizontal showsHorizontalScrollIndicator={false} snapToInterval={w + 10} decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} onScrollBeginDrag={() => { touched.current = true; }}
      onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / (w + 10)))}>
      {posters.map((p) => <Pressable key={p.kind} onPress={p.onPress} accessibilityRole="link" accessibilityLabel={LABEL[p.kind]}
        style={({ pressed }) => [{ width: w, height: HEIGHT }, pressed && { transform: [{ scale: 0.985 }] }]}>{art(p)}</Pressable>)}
    </ScrollView>
    {posters.length > 1 && <View style={styles.dots}>{posters.map((p, i) =>
      <Pressable key={p.kind} accessibilityRole="button" accessibilityLabel={`Mostra ${LABEL[p.kind]}`} style={styles.dotHit}
        onPress={() => { touched.current = true; setIndex(i); pager.current?.scrollTo({ x: i * (w + 10), animated: true }); }}>
        <View style={[styles.dot, i === index && styles.dotOn]} /></Pressable>)}</View>}
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, borderRadius: 26, overflow: 'hidden' },
  copy: { position: 'absolute', left: 22, top: 24, width: '62%' },
  eyebrow: { fontSize: 12, letterSpacing: 1.6, fontFamily: fonts.heavy },
  giant: { fontSize: 76, lineHeight: 82, fontFamily: fonts.heavy, letterSpacing: -3, marginTop: 4 },
  title: { fontSize: 34, lineHeight: 37, fontFamily: fonts.heavy, letterSpacing: -1, marginTop: 8 },
  body: { fontSize: 14.5, lineHeight: 19, fontFamily: fonts.sansSemiBold, marginTop: 10 },
  offerName: { fontSize: 14, lineHeight: 18, fontFamily: fonts.sansSemiBold, color: '#FFFFFF', marginTop: 2, width: '82%' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  priceChip: { backgroundColor: LIME, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
  priceChipText: { fontSize: 24, fontFamily: fonts.heavy, color: GREEN, letterSpacing: -0.5 },
  was: { fontSize: 15, fontFamily: fonts.sansSemiBold, color: 'rgba(255,255,255,0.7)', textDecorationLine: 'line-through' },
  // The product stands in a white spotlight, half out of the poster.
  disc: { position: 'absolute', right: -46, bottom: -40, width: 236, height: 236, borderRadius: 118, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', paddingRight: 30, paddingBottom: 26 },
  flyerCover: { position: 'absolute', right: -14, top: 34, width: 150, aspectRatio: 0.71, backgroundColor: '#FFFFFF', transform: [{ rotate: '7deg' }],
    shadowColor: '#1C2A18', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  clubCard: { position: 'absolute', right: -40, bottom: 26, width: 210, height: 132, borderRadius: 12, transform: [{ rotate: '-12deg' }] },
  zeroTag: { position: 'absolute', right: 18, bottom: 34, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: LIME, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 4, transform: [{ rotate: '-8deg' }] },
  zeroBig: { fontSize: 70, lineHeight: 78, fontFamily: fonts.heavy, color: GREEN, letterSpacing: -2 },
  zeroSmall: { fontSize: 28, lineHeight: 34, fontFamily: fonts.heavy, color: GREEN, marginTop: 8 },
  awning: { flexDirection: 'row', height: 30, borderBottomWidth: 3, borderColor: GREEN },
  stripe: { width: 22 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 40, paddingHorizontal: 16, borderRadius: 20, marginTop: 16 },
  ctaText: { fontSize: 14.5, fontFamily: fonts.heavy },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 2, marginTop: 6 },
  dotHit: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D0D0CB' },
  dotOn: { width: 22, backgroundColor: GREEN },
});
