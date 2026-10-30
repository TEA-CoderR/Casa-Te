import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp, ZoomIn } from 'react-native-reanimated';
import { Link, useLocalSearchParams, router, Stack } from 'expo-router';
import { formatPackSize, formatWeight, type CategoryRow } from '@casa-te/shared';
import { discountLabel, formatEuro, unitPriceLabel, untilLabel } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductImage } from '@/components/ProductImage';
import { FavoriteButton, stockLabel } from '@/components/ProductCard';
import { Icon, type IconName } from '@/components/Icon';
import { EmptyState, Loading, PriceTag, PrimaryButton, QuantityControl } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { fetchCategories, fetchProduct, fetchProducts, fetchVariants } from '@/lib/api';
import { Stars } from '@/components/Stars';
import { ProductReviews } from '@/components/ProductReviews';
import { ProductVariants } from '@/components/ProductVariants';
import { invalidate } from '@/lib/useQuery';
import { useDelivery, useLayout, useStores } from '@/lib/hooks';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import { useQuery } from '@/lib/useQuery';
import { cartItemCount, useCartStore } from '@/store/cart';
import { useFavorites } from '@/store/favorites';
import { BrandHeader, HeaderBack, HeaderButton } from '@/components/BrandHeader';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SITE_WIDTH, type WebState } from '@/components/site/shared';
import { ALL_PRODUCTS } from '@/lib/links';
import { useClubMember } from '@/store/club';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selected } = useStores();
  const delivery = useDelivery();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(0);
  const [storeSheet, setStoreSheet] = useState(false);
  const [shared, setShared] = useState(false);
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const add = useCartStore((s) => s.add);
  const setCartQuantity = useCartStore((s) => s.setQuantity);
  const [toast, setToast] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const inCart = useCartStore((s) => s.items[id ?? ''] ?? 0);
  const cartCount = cartItemCount(useCartStore((s) => s.items));
  const favorite = useFavorites((s) => s.ids.includes(id ?? ''));
  const toggleFavorite = useFavorites((s) => s.toggle);
  const isMember = useClubMember();
  // Buttons show what this customer will pay: non-members pay the regular price of a Soci offer.
  const payCents = (p: { price_cents: number; clubPrice: { regularCents: number } | null }) =>
    p.clubPrice && !isMember ? p.clubPrice.regularCents : p.price_cents;
  const categories = useQuery<CategoryRow[]>('categories', fetchCategories);
  const { data: product, loading, error, refetch } = useQuery(id ? `product:${id}:${selected?.id}` : null, () => fetchProduct(id!, selected?.id ?? null));
  const group = product?.variant_group ?? null;
  const variants = useQuery(group ? `variants:${group}:${selected?.id}` : null, () => fetchVariants(group!, selected?.id ?? null));
  const [folds, setFolds] = useState<string | null>(null);
  const related = useQuery(product?.category_id && !wide ? `related:${product.category_id}:${selected?.id}` : null,
    () => fetchProducts({ storeId: selected?.id ?? null, categoryIds: [product!.category_id as string], sort: 'featured', pageSize: 3 }));

  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  const share = async (name: string) => {
    const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : undefined;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator as Navigator & { share?: unknown } : null;
      if (Platform.OS === 'web' && nav && !nav.share && url) {
        await nav.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2500); return;
      }
      await Share.share({ title: name, message: url ? `${name} · CASA & TE\n${url}` : `${name} · CASA & TE`, url });
    } catch { /* dismissed */ }
  };

  const plainHeader = wide ? undefined : <BrandHeader title="Prodotto" left={<HeaderBack onPress={back} />} />;
  if (loading && !product) return <Screen stack header={plainHeader}><Stack.Screen options={{ headerShown: wide }} /><Loading /></Screen>;
  if (!product) return <Screen stack header={plainHeader}><Stack.Screen options={{ headerShown: wide }} /><EmptyState title={error ? 'Connessione assente' : 'Prodotto non trovato'}
    message={error ? 'Controlla la rete e riprova.' : 'Scopri gli altri prodotti del catalogo.'} icon="search">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.replace(ALL_PRODUCTS)} />
  </EmptyState></Screen>;

  const stock = stockLabel(product.stock, storeShortName(selected));
  // "Disponibile a Lucca S. Filippo" → state "Disponibile" + place "a Lucca · S. Filippo".
  const stockSplit = stock.text.match(/^(.*?)\s((?:a|ad|in)\s.+)$/);
  const stockState = stockSplit?.[1] ?? '';
  const stockPlace = (stockSplit?.[2] ?? '').replace(/ a (\S+) (?!·)/, ' a $1 · ').replace(/^(a|ad|in) (\S+) (?!·)/, '$1 $2 · ');
  const maxQty = Math.max(1, Math.min(product.max_per_order, (product.stock ?? 99) - inCart));
  const canAdd = stock.available && (product.stock === null || inCart + quantity <= product.stock);
  const addToCart = () => { add(product.id, quantity); setAdded(quantity); setQuantity(1); };

  // One buy box, placed beside the image on desktop and in a sticky footer on phones.
  const buy = <View style={{ gap: 10 }}>
    {added > 0 && <View style={styles.added} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <View style={styles.addedTick}><Icon name="check" size={15} color={colors.text} strokeWidth={3} /></View>
      <Text style={styles.addedText}>{added === 1 ? 'Aggiunto' : `${added} pezzi aggiunti`} al carrello</Text>
      <Link href="/cart" style={styles.addedLink}>Vai al carrello</Link>
    </View>}
    <View style={styles.buyRow}>
      {canAdd && <QuantityControl value={quantity} onChange={setQuantity} min={1} max={maxQty} label={product.name} />}
      <View style={{ flex: 1 }}>
        <PrimaryButton title={canAdd ? 'Aggiungi al carrello' : 'Non disponibile in questo negozio'} disabled={!canAdd} onPress={addToCart}
          icon={canAdd && !wide ? 'cart' : null} />
      </View>
    </View>
  </View>;

  const caption = inCart ? `Già ${inCart} nel carrello` : product.stock !== null && product.stock < product.max_per_order ? `${product.stock} disponibili` : '';
  const store = storeShortName(selected) || 'negozio';
  const discount = discountLabel(product.price_cents, product.compare_at_price_cents);
  const unitPrice = unitPriceLabel(product.price_cents, product.unit_quantity, product.unit);
  // Club member price: shown as the offer and always marked "Prezzo Soci" (only Club members pay it).
  const soci = !!product.clubPrice;
  const badge = discount ? `${soci ? 'Soci ' : ''}${discount.replace('-', '−')}` : '';
  const sociText = product.clubPrice ? [isMember ? 'applicato al tuo account' : 'solo per i membri del Club · iscrizione gratuita',
    product.clubPrice.endsOn ? untilLabel(product.clubPrice.endsOn) : null].filter(Boolean).join(' · ') : '';
  const sociLine = soci ? <Pressable onPress={() => router.push('/club')} accessibilityRole="link" style={styles.sociLine}
    accessibilityLabel={`Prezzo Soci, ${sociText}`}>
    <Text style={styles.sociText}><Text style={styles.sociStrong}>Prezzo Soci</Text> · {sociText}{isMember ? '' : ' ›'}</Text>
  </Pressable> : null;
  const pack = formatPackSize(product.unit_quantity, product.unit);
  const features: Array<{ icon: IconName; text: string }> = product.highlights.length
    ? product.highlights.map((h) => ({ icon: h.icon as IconName, text: h.label }))
    : [{ icon: 'store', text: `Ritiro gratuito\n${atPlace(store)}` }, { icon: 'truck', text: delivery.open ? 'Spedizione gratis\nda €66' : 'Spedizione\nprossimamente' },
       { icon: 'shield', text: 'Pagamento\nsicuro' }, ...(product.weight_g ? [{ icon: 'weight' as IconName, text: `Peso\n${formatWeight(product.weight_g)}` }] : [])];
  const details = <>
    {!!product.brand && <Text style={styles.brand}>{product.brand}</Text>}
    <Text style={[styles.title, wide && styles.titleWide]} accessibilityRole="header">{product.name}</Text>
    <View style={styles.priceRow}>
      <Text style={[styles.price, wide && { fontSize: 36 }, !!discount && { color: colors.sale }]}>{formatEuro(product.price_cents)}</Text>
      {!!product.compare_at_price_cents && <Text style={styles.compare}>{formatEuro(product.compare_at_price_cents)}</Text>}
      {!!discount && <View style={styles.discount}><Text style={styles.discountText}>{badge}</Text></View>}
      {unitPrice ? <Text style={styles.vat}>{unitPrice}{pack ? ` · ${pack}` : ''}</Text> : <Text style={styles.vat}>IVA inclusa</Text>}
    </View>
    {sociLine}
    {(!wide || !!product.rating_count) && <View style={styles.ratingRow} accessibilityLabel={product.rating_count ? `Valutazione ${product.rating_avg} su 5, ${product.rating_count} recensioni` : 'Nessuna recensione'}>
      <Stars value={product.rating_avg ?? 0} size={15} />
      <Text style={styles.ratingText}>{product.rating_count ? `(${product.rating_count})` : 'Nessuna recensione'}</Text>
    </View>}
    <Pressable style={styles.availability} onPress={() => setStoreSheet(true)} accessibilityRole="button"
      accessibilityLabel={`${stock.text}. Cambia negozio`}>
      <View style={[styles.dot, !stock.available && { backgroundColor: colors.danger }]} />
      <Text style={[styles.availabilityText, !stock.available && { color: colors.danger }]}>{stock.text}{caption ? ` · ${caption}` : ''}</Text>
      <Text style={styles.change}>Cambia</Text>
    </Pressable>
    <View style={styles.features}>
      {features.map((f) => <View key={f.icon + f.text} style={styles.feature}><Icon name={f.icon} size={23} color={colors.text} strokeWidth={1.15} />
        <Text style={[styles.featureText, wide && styles.featureTextWide]}>{f.text}</Text></View>)}
    </View>
    {!!product.description && <Text style={styles.description}>{product.description}</Text>}
    {!!variants.data && <ProductVariants title={product.variant_title} current={product.id} variants={variants.data} />}
    {wide && <View style={{ marginTop: 24 }}>{buy}</View>}
    <Text style={styles.sku}>Codice articolo {product.sku}{product.color ? ` · Colore ${product.color}` : ''} · IVA inclusa</Text>
    <ProductReviews productId={product.id} average={product.rating_avg} count={product.rating_count}
      onChanged={() => { void refetch(); invalidate('featured'); }} />
  </>;

  const actions = <>
    {wide ? <View /> : <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Indietro" style={[styles.round, styles.roundLeft]}>
      <Icon name="back" size={22} strokeWidth={1.5} /></Pressable>}
    <View style={styles.roundRight}>
      <FavoriteButton productId={product.id} name={product.name} size={20} style={styles.round} />
      <Pressable onPress={() => share(product.name)} accessibilityRole="button" accessibilityLabel={`Condividi ${product.name}`} style={[styles.round, !wide && styles.roundBare]}>
        <Icon name="share" size={21} strokeWidth={1.4} /></Pressable>
    </View>
  </>;
  const sharedNote = shared && <View style={styles.toast} accessibilityLiveRegion="polite"><Text style={styles.toastText}>Link copiato</Text></View>;

  const crumb = (label: string, onPress?: () => void) => onPress
    ? <Pressable onPress={onPress} accessibilityRole="link">{({ hovered }: WebState) =>
        <Text style={[styles.crumb, hovered && { color: colors.green }]}>{label}</Text>}</Pressable>
    : <Text style={[styles.crumb, { color: colors.text }]} numberOfLines={1}>{label}</Text>;
  // Phone (design F, F-Prodotto): the product leads on a white stage with a soft floor shadow; name and price on the
  // ivory ground; availability, then folding sections; a sticky buy bar where "Aggiungi" becomes a stepper.
  if (!wide) {
    const department = categories.data?.find((c) => c.id === product.category_id);
    const top = department?.parent_id ? categories.data?.find((c) => c.id === department.parent_id) : null;
    const addFirst = () => {
      add(product.id, 1);
      setToast((n) => n + 1);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(0), 2400);
    };
    const canMore = stock.available && (product.stock === null || inCart < product.stock) && inCart < product.max_per_order;
    const euro = (c: number) => formatEuro(c).replace(/€\s/, '€');
    const phoneBuy = inCart > 0
      ? <Animated.View entering={ZoomIn.springify().damping(16)} style={styles.buyPhone}>
          <View style={styles.stepper}>
            <Pressable onPress={() => setCartQuantity(product.id, inCart - 1)} accessibilityRole="button" accessibilityLabel={`Togli un ${product.name}`} style={styles.step}>
              <Text style={styles.stepGlyph}>−</Text></Pressable>
            <Text style={styles.stepValue} accessibilityLiveRegion="polite" accessibilityLabel={`${inCart} nel carrello`}>{inCart}</Text>
            <Pressable onPress={() => add(product.id, 1)} disabled={!canMore} accessibilityRole="button" accessibilityLabel={`Aggiungi un altro ${product.name}`}
              style={[styles.step, !canMore && { opacity: 0.35 }]}><Text style={styles.stepGlyph}>+</Text></Pressable>
          </View>
          <Pressable onPress={() => router.push('/cart')} accessibilityRole="link" style={({ pressed }) => [styles.toCart, pressed && { opacity: 0.88 }]}>
            <Text style={styles.toCartText}>Vai al carrello</Text>
            <Text style={styles.toCartSub}>{inCart === 1 ? '1 pezzo' : `${inCart} pezzi`} · {euro(payCents(product) * inCart)}</Text>
          </Pressable>
        </Animated.View>
      : <Pressable onPress={addFirst} disabled={!stock.available} accessibilityRole="button"
          accessibilityLabel={stock.available ? `Aggiungi ${product.name} al carrello, ${formatEuro(payCents(product))}` : 'Non disponibile in questo negozio'}
          style={({ pressed }) => [styles.addPhone, !stock.available && { backgroundColor: colors.line }, pressed && { opacity: 0.9 }]}>
          <Text style={[styles.addPhoneText, !stock.available && { color: colors.muted }]}>{stock.available ? 'Aggiungi al carrello' : 'Non disponibile in questo negozio'}</Text>
          {stock.available && <View style={styles.priceChip}><Text style={styles.priceChipText}>{euro(payCents(product))}</Text></View>}
        </Pressable>;
    const round = (icon: IconName, label: string, onPress: () => void, filled?: boolean) =>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [styles.roundPhone, pressed && { opacity: 0.7 }]}>
        <Icon name={icon} size={icon === 'back' ? 22 : 20} color={filled ? colors.sale : colors.text} fill={filled ? colors.sale : undefined} strokeWidth={icon === 'back' ? 2.2 : 2} />
      </Pressable>;
    const details = [pack && `Formato: ${pack}`, product.brand && `Marca: ${product.brand}`, department && `Reparto: ${top ? `${top.name} › ` : ''}${department.name}`,
      product.color && `Colore: ${product.color}`, product.weight_g ? `Peso: ${formatWeight(product.weight_g)}` : null, `Codice: ${product.sku}`].filter(Boolean).join('\n');
    const sections: Array<{ key: string; title: string; body: React.ReactNode }> = [
      ...(product.description ? [{ key: 'd', title: 'Descrizione', body: <Text style={styles.foldText}>{product.description}</Text> }] : []),
      { key: 'i', title: 'Dettagli', body: <Text style={styles.foldText}>{details}</Text> },
      { key: 'r', title: product.rating_count ? `Recensioni (${product.rating_count})` : 'Recensioni', body: <ProductReviews productId={product.id} average={product.rating_avg} count={product.rating_count}
        onChanged={() => { void refetch(); invalidate('featured'); }} /> },
    ];
    const openKey = folds ?? (product.description ? 'd' : 'i');
    return <Screen stack ground={colors.page} footer={phoneBuy} header={<View style={{ height: insets.top, backgroundColor: '#FFFFFF' }} />}
      contentContainerStyle={{ padding: 0, paddingBottom: 20 }}>
      <Stack.Screen options={{ title: product.name, headerShown: false }} />
      <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
      <View style={styles.stage}>
        <View pointerEvents="none" style={styles.floor} />
        <View style={styles.stageImage}><ProductGallery images={product.images} sku={product.sku} label={product.name} inset={0} /></View>
        {!!discount && <View style={styles.phoneBadge}><Text style={styles.phoneBadgeText}>{badge}</Text></View>}
        <View style={styles.stageBar}>
          {round('back', 'Indietro', back)}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {round('heart', favorite ? `Rimuovi ${product.name} dai preferiti` : `Aggiungi ${product.name} ai preferiti`, () => toggleFavorite(product.id), favorite)}
            {round('share', `Condividi ${product.name}`, () => share(product.name))}
          </View>
        </View>
      </View>
      <View style={styles.phoneInfo}>
        {!!department && <Pressable onPress={() => router.push({ pathname: '/catalog', params: { offerte: '', evidenza: '', category: department.id } })} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.phoneCrumb} numberOfLines={1}>{top ? `${top.name} › ${department.name}` : department.name}</Text></Pressable>}
        <Text style={styles.phoneTitle} accessibilityRole="header">{product.name}</Text>
        <View style={styles.phonePriceRow}>
          <PriceTag cents={product.price_cents} size={38} sale={!!discount} />
          <Text style={styles.phoneUnit}>{!!discount && <Text style={styles.phoneStruck}>{euro(product.compare_at_price_cents as number)}</Text>}
            {[discount ? '' : null, unitPrice?.replace(/€\s/, '€').replace(/\s\/\s/, '/'), 'IVA inclusa'].filter((x) => x !== null && x !== undefined).join(' · ')}</Text>
        </View>
        {sociLine}
        {!!variants.data && <ProductVariants title={product.variant_title} current={product.id} variants={variants.data} />}
        <Pressable style={({ pressed }) => [styles.phoneCard, pressed && { opacity: 0.9 }]} onPress={() => setStoreSheet(true)} accessibilityRole="button" accessibilityLabel={`${stock.text}. Cambia negozio`}>
          {/* Design H: no icon, a status line with a dot ("DISPONIBILE") over the store name. */}
          <View style={{ flex: 1 }}>
            {!!stockState && <View style={styles.stockRow}>
              <View style={[styles.stockDot, !stock.available && { backgroundColor: colors.danger }]} />
              <Text style={[styles.stockState, !stock.available && { color: colors.danger }]}>{stockState.toUpperCase()}</Text>
            </View>}
            <Text style={styles.phoneCardTitle}>{stockState ? stockPlace : stock.text.replace(/ a (\S+) (?!·)/, ' a $1 · ') || 'Scegli il negozio'}</Text>
            <Text style={styles.phoneCardText}>{['Ritiro gratuito · resta 14 giorni in negozio', caption].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={styles.phoneLink}>Cambia</Text>
        </Pressable>
        <View style={styles.folds}>{sections.map((f, i) => {
          const open = openKey === f.key;
          return <View key={f.key} style={i > 0 && { borderTopWidth: 1, borderColor: '#EFECE3' }}>
            <Pressable onPress={() => setFolds(open ? '' : f.key)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.foldHead}>
              <Text style={styles.foldTitle}>{f.title}</Text>
              <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="down" size={18} color={colors.text} strokeWidth={2.2} /></View>
            </Pressable>
            {open && <View style={styles.foldBody}>{f.body}</View>}
          </View>;
        })}</View>
        {related.data && related.data.items.filter((p) => p.id !== product.id).length > 0 && <>
          <Text style={styles.relatedTitle} accessibilityRole="header">Altro in {department?.name ?? 'questo reparto'}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>{related.data.items.filter((p) => p.id !== product.id).slice(0, 2).map((p) =>
            <Pressable key={p.id} onPress={() => router.push(`/product/${p.id}`)} accessibilityRole="link" accessibilityLabel={`${p.name}, ${formatEuro(p.price_cents)}`} style={styles.related}>
              <View style={{ height: 92, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 84, height: 84 }}><ProductImage uri={p.image} sku={p.sku} inset={0} /></View></View>
              <Text style={styles.relatedName} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.relatedPrice}>{euro(p.price_cents)}</Text>
            </Pressable>)}</View>
        </>}
      </View>
      {sharedNote}
      {toast > 0 && <Animated.View entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp.duration(200)}
        style={[styles.addedToast, { top: insets.top + 14 }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <View style={styles.addedTick}><Icon name="check" size={15} color={colors.text} strokeWidth={3} /></View>
        <Text style={styles.addedToastText}>Aggiunto al carrello</Text>
        <Pressable onPress={() => router.push('/cart')} accessibilityRole="link" hitSlop={8}><Text style={styles.addedToastLink}>Vedi</Text></Pressable>
      </Animated.View>}
    </Screen>;
  }

  return <Screen stack footer={wide ? undefined : buy} maxWidth={wide ? SITE_WIDTH - 80 : undefined}
    contentContainerStyle={wide ? { paddingHorizontal: 40, paddingTop: 0 } : undefined} after={wide ? <SiteFooter /> : undefined} bleed={40}>
    <Stack.Screen options={wide ? { title: product.name, headerShown: true, header: () => <SiteHeader /> } : { title: '', headerShown: false }} />
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    {wide && <View style={styles.crumbs}>
      {crumb('Home', () => router.push('/'))}<Text style={styles.crumbSep}>/</Text>
      {crumb('Catalogo', () => router.push(ALL_PRODUCTS))}<Text style={styles.crumbSep}>/</Text>
      {crumb(product.name)}
    </View>}
    {wide ? <View style={styles.wide}>
      <View style={[styles.media, styles.mediaWide]}>
        <ProductGallery images={product.images} sku={product.sku} label={product.name} blend />
        <View style={[styles.overlay, { top: 12 }]}>{actions}</View>
      </View>
      <View style={{ flex: 1, maxWidth: 500, paddingTop: 8 }}>{details}</View>
    </View> : <>
      <View style={[styles.media, { paddingTop: insets.top + 8 }]}>
        <ProductGallery images={product.images} sku={product.sku} label={product.name} inset={0.12} blend />
        <View style={[styles.overlay, { top: insets.top + 12 }]}>{actions}</View>
      </View>
      {details}
    </>}
    {sharedNote}
  </Screen>;
}

const styles = StyleSheet.create({
  wide: { flexDirection: 'row', gap: 72, alignItems: 'flex-start', paddingTop: 8 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 28, paddingBottom: 24 },
  crumb: { fontSize: 13, color: colors.muted, fontFamily: fonts.sans },
  crumbSep: { fontSize: 13, color: colors.rule, fontFamily: fonts.sans },
  titleWide: { fontSize: 48, lineHeight: 52, letterSpacing: -0.8 },
  stage: { height: 380, backgroundColor: colors.photo, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, borderBottomWidth: 1, borderColor: colors.line },
  floor: { position: 'absolute', top: 318, alignSelf: 'center', width: 180, height: 22, borderRadius: 90, backgroundColor: 'rgba(24,32,26,0.14)', filter: 'blur(9px)' } as object,
  stageImage: { position: 'absolute', top: 58, alignSelf: 'center', width: 270, height: 270 },
  stageBar: { position: 'absolute', top: 14, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  roundPhone: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  phoneBadge: { position: 'absolute', left: 16, top: 70, backgroundColor: colors.sale, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 3 },
  phoneBadgeText: { fontSize: 18, fontFamily: fonts.heavy, color: '#FFFFFF' },
  phoneInfo: { paddingHorizontal: 20, paddingTop: 18 },
  phoneCrumb: { fontSize: 13.5, fontFamily: fonts.sansBold, color: colors.green },
  phoneTitle: { fontSize: 28, lineHeight: 32, fontFamily: fonts.display, color: colors.text, marginTop: 6, letterSpacing: -0.2 },
  phonePriceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  sociLine: { marginTop: 6, marginBottom: 4 },
  sociText: { fontSize: 13, lineHeight: 18, color: colors.sale, fontFamily: fonts.sans },
  sociStrong: { fontFamily: fonts.sansBold, fontWeight: '700' },
  phoneStruck: { textDecorationLine: 'line-through' },
  phoneUnit: { fontSize: 14, fontFamily: fonts.sans, color: colors.muted, paddingBottom: 6, flexShrink: 1 },
  phoneCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: colors.line },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2E9B3A' },
  stockState: { fontSize: 12.5, fontFamily: fonts.heavy, letterSpacing: 0.5, color: '#2E6B34' },
  phoneCardTitle: { fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  phoneCardText: { fontSize: 13, fontFamily: fonts.sans, color: colors.muted, marginTop: 1 },
  phoneLink: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.green },
  folds: { marginTop: 12, borderRadius: 18, backgroundColor: '#FFFFFF', overflow: 'hidden', borderBottomWidth: 1, borderColor: colors.line },
  foldHead: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  foldTitle: { fontSize: 15.5, fontFamily: fonts.sansBold, color: colors.text },
  foldBody: { paddingHorizontal: 16, paddingBottom: 16, marginTop: -6 },
  foldText: { fontSize: 15, lineHeight: 22, fontFamily: fonts.sans, color: '#4E554B' },
  relatedTitle: { fontSize: 21, lineHeight: 26, fontFamily: fonts.display, color: colors.text, marginTop: 24, marginBottom: 10 },
  related: { flex: 1, padding: 8, borderRadius: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: colors.line },
  relatedName: { fontSize: 13, lineHeight: 16, fontFamily: fonts.sansSemiBold, color: colors.text, marginTop: 4 },
  relatedPrice: { fontSize: 15, fontFamily: fonts.heavy, color: colors.text, marginTop: 4 },
  addPhone: { height: 60, borderRadius: 30, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  addPhoneText: { fontSize: 17, fontFamily: fonts.sansBold, color: '#FFFFFF', flexShrink: 1, textAlign: 'center' },
  priceChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: colors.yellow },
  priceChipText: { fontSize: 16, fontFamily: fonts.heavy, color: colors.text },
  buyPhone: { flexDirection: 'row', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 60, borderRadius: 30, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line },
  step: { width: 52, height: 58, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 24, lineHeight: 28, fontFamily: fonts.sansBold, color: colors.text },
  stepValue: { minWidth: 24, textAlign: 'center', fontSize: 19, fontFamily: fonts.heavy, color: colors.text },
  toCart: { flex: 1, height: 60, borderRadius: 30, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  toCartText: { fontSize: 16, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  toCartSub: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.onBrand },
  addedToast: { position: 'absolute', left: 16, right: 16, height: 54, borderRadius: 16, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  addedTick: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  addedToastText: { flex: 1, fontSize: 15, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  addedToastLink: { fontSize: 14.5, fontFamily: fonts.sansBold, color: colors.yellow },
  media: { backgroundColor: colors.photo, marginHorizontal: -20, marginTop: -20, marginBottom: 22, borderBottomWidth: 1, borderColor: colors.photoLine },
  overlay: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3A2E1A', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  roundBare: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  roundLeft: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  roundRight: { flexDirection: 'row', gap: 6 },
  toast: { position: 'absolute', alignSelf: 'center', top: 80, backgroundColor: colors.text, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  toastText: { color: '#fff', fontSize: 13, fontFamily: fonts.sansMedium },
  mediaWide: { flex: 1.25, marginHorizontal: 0, marginTop: 0, marginBottom: 0, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.photo, borderWidth: 1, borderColor: colors.photoLine },
  brand: { fontSize: 11, letterSpacing: 2.6, textTransform: 'uppercase', color: colors.text, fontFamily: fonts.sansSemiBold, fontWeight: '600', marginBottom: 6 },
  title: { fontSize: 30, lineHeight: 33, fontFamily: fonts.serif, color: colors.text, letterSpacing: -0.2 },
  discount: { alignSelf: 'center', backgroundColor: colors.sale, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  discountText: { fontSize: 15, color: '#fff', fontFamily: fonts.sansSemiBold, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 10 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  ratingText: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
  price: { fontSize: 31, fontFamily: fonts.serifMedium, color: colors.text },
  compare: { fontSize: 15, color: colors.muted, textDecorationLine: 'line-through', fontFamily: fonts.sans },
  vat: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, marginTop: 6, flexWrap: 'wrap' },
  availabilityText: { fontSize: 13, color: colors.green, fontFamily: fonts.sansMedium, fontWeight: '500' },
  change: { fontSize: 13, color: colors.text, textDecorationLine: 'underline', fontFamily: fonts.sans },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  features: { flexDirection: 'row', marginTop: 14, paddingVertical: 16, borderTopWidth: 1, borderColor: '#EEE9E0' },
  feature: { flex: 1, alignItems: 'center', gap: 7, paddingHorizontal: 3 },
  featureTextWide: { fontSize: 13, lineHeight: 17, color: colors.text },
  featureText: { fontSize: 11, lineHeight: 14, color: colors.muted, textAlign: 'center', fontFamily: fonts.sans },
  description: { fontSize: 13.5, lineHeight: 21, color: colors.muted, marginTop: 6, maxWidth: 560, fontFamily: fonts.sans },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sku: { fontSize: 12, color: colors.muted, marginTop: 22, fontFamily: fonts.sans },
  // Same confirmation as the phone toast: dark strip, yellow tick.
  added: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.text, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
  addedText: { flex: 1, fontSize: 14, color: '#FFFFFF', fontFamily: fonts.sansSemiBold, fontWeight: '600' },
  addedLink: { fontSize: 14, color: colors.yellow, fontFamily: fonts.sansBold, fontWeight: '700' },
});
