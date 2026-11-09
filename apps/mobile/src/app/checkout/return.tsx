import { useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { friendlyError } from '@casa-te/shared';
import { formatEuro } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { StepTag } from '@/components/ShopMarks';
import { EmptyState, Loading, PrimaryButton, SecondaryButton } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { useLayout, useStores } from '@/lib/hooks';
import { Monogram } from '@/components/ClubPass';
import { Barcode } from '@/components/Barcode';
import { cancelPendingOrder, fetchOrder, resumeCheckout, type OrderDetail } from '@/lib/api';
import { openCheckout } from '@/lib/payments';
import { invalidate } from '@/lib/useQuery';
import { useCartStore } from '@/store/cart';
import { useSession } from '@/store/session';

/** The ticket slides out of the slot above it, like a receipt from the till (clipped by its frame). */
function PrintedTicket({ children }: { children: React.ReactNode }) {
  const y = useRef(new RNAnimated.Value(-340)).current;
  useEffect(() => {
    RNAnimated.timing(y, { toValue: 0, duration: 1200, delay: 350, easing: RNEasing.out(RNEasing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [y]);
  return <View style={styles.tClip}>
    <RNAnimated.View style={[styles.ticket, { transform: [{ translateY: y }] }]}>
      {children}
      {/* Torn edge: half-discs of the page green along the bottom. */}
      <View style={styles.tTear} pointerEvents="none">{Array.from({ length: 24 }, (_, i) => <View key={i} style={styles.tTooth} />)}</View>
    </RNAnimated.View>
  </View>;
}

/** Landing page after Stripe Checkout (deep link on native, redirect on web). */
export default function CheckoutReturnScreen() {
  const { order: orderId, result } = useLocalSearchParams<{ order?: string; result?: string }>();
  const ready = useSession((s) => s.ready);
  const removeOrdered = useCartStore((s) => s.removeMany);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cleared = useRef(false);
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const { stores } = useStores();

  useEffect(() => {
    if (!orderId || !ready) return;
    let active = true;
    let attempts = 0;
    // A successful payment is usually confirmed within a few seconds (return endpoint + webhook).
    const maxAttempts = result === 'success' ? 20 : 3;
    const tick = async () => {
      attempts += 1;
      try {
        const o = await fetchOrder(orderId);
        if (!active) return;
        setOrder(o);
        if (o && o.status !== 'pending_payment') { setPolling(false); return; }
      } catch { /* retry */ }
      if (attempts >= maxAttempts) { setPolling(false); return; }
      setTimeout(() => { if (active) void tick(); }, 2000);
    };
    void tick();
    return () => { active = false; };
  }, [orderId, ready, result]);

  const paid = order && order.payment_status !== 'unpaid' && order.status !== 'cancelled';
  useEffect(() => {
    if (paid && order && !cleared.current) {
      cleared.current = true;
      removeOrdered(order.order_items.map((i) => i.product_id).filter((id): id is string => !!id));
      invalidate('orders'); invalidate('featured');
    }
  }, [paid, order, removeOrdered]);

  if (!orderId) return <Screen stack><EmptyState title="Link non valido" message="Torna alla home per continuare." icon="close">
    <PrimaryButton title="Vai alla home" onPress={() => router.replace('/')} /></EmptyState></Screen>;
  if (!order && polling) return <Screen stack><Loading label="Verifica del pagamento…" /></Screen>;
  if (!order) return <Screen stack><EmptyState title="Ordine non trovato" message="Accedi con lo stesso account usato per l'ordine." icon="search">
    <PrimaryButton title="I miei ordini" onPress={() => router.replace('/orders')} /></EmptyState></Screen>;

  if (paid) {
    const next: Record<string, string[]> = {
      store: ['Il negozio prepara il tuo ordine.', 'Quando è pronto lo vedi in «Ordini» come "Pronto per il ritiro".', `Passa in negozio con il numero ${order.order_number}.`],
      home: ['Il negozio prepara il tuo ordine.', 'Lo affidiamo al corriere: in «Ordini» trovi il tracciamento.', 'Consegna in 2–4 giorni lavorativi.'],
      pickup: ['Il negozio prepara il tuo ordine.', 'Lo spediamo al punto di ritiro che hai scelto.', 'In «Ordini» vedi quando è arrivato.'],
    };
    // Phone (November 2026): the green page with the monogram, "Grazie, Nome." in large type and the lime pickup
    // ticket printing out of a slot, with the order's barcode to show at the till.
    if (!wide) {
      const first = order.customer_name?.trim().split(/\s+/)[0];
      const store = stores.find((x) => x.id === order.store_id)?.name.replace(/^CASA & TE\s*/, '');
      const n = order.order_items.reduce((sum, i) => sum + i.quantity, 0);
      return <Animated.View entering={FadeIn.duration(260)} style={[styles.green, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Monogram width={520} color={colors.bandLogo} opacity={0.07} style={{ position: 'absolute', right: -200, top: insets.top - 30 }} />
        <Animated.Text entering={FadeInDown.duration(420)} style={styles.gKicker}>ORDINE CONFERMATO</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(60).duration(420)} style={styles.gTitle} accessibilityRole="header" numberOfLines={2}>
          {first ? `Grazie,\n${first}.` : 'Grazie!'}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(120).duration(420)} style={styles.gText}>{order.fulfilment === 'store'
          ? 'Lo prepariamo noi: ti scriviamo appena è pronto al ritiro.' : 'Lo prepariamo noi: ti scriviamo quando parte.'}</Animated.Text>
        <View style={styles.slot} />
        <PrintedTicket>
          <View style={styles.tTop}>
            <Text style={styles.tKicker} numberOfLines={1}>ORDINE {order.order_number}</Text>
            <Monogram width={46} color={colors.band} />
          </View>
          <Text style={styles.tTitle} numberOfLines={1}>{order.fulfilment === 'store' ? `Ritiro a ${store ?? 'negozio'}` : 'Consegna in arrivo'}</Text>
          <Text style={styles.tSub}>{n} {n === 1 ? 'articolo' : 'articoli'} · {formatEuro(order.total_cents)} pagati</Text>
          {order.fulfilment === 'store' && <View style={styles.tCode}>
            <Barcode value={order.order_number} height={46} color={colors.text} label={`Codice dell'ordine ${order.order_number}`} />
            <Text style={styles.tCodeText}>Mostralo in cassa quando ritiri</Text>
          </View>}
        </PrintedTicket>
        <Animated.View entering={FadeInDown.delay(900).duration(420)} style={{ marginTop: 'auto', gap: 14, alignItems: 'center' }}>
          <Pressable onPress={() => router.replace(`/order/${order.id}`)} accessibilityRole="button" style={({ pressed }) => [styles.gButton, pressed && { opacity: 0.9 }]}>
            <Text style={styles.gButtonText}>Segui l’ordine</Text></Pressable>
          <Pressable onPress={() => router.replace('/')} accessibilityRole="button" hitSlop={8}><Text style={styles.gLink}>Continua lo shopping</Text></Pressable>
        </Animated.View>
      </Animated.View>;
    }
    return <Screen stack maxWidth={560}>
      <View style={styles.done}>
        <View style={styles.badge}><Icon name="check" size={30} color="#fff" /></View>
        <Text style={styles.title} accessibilityRole="header">Grazie, ordine ricevuto</Text>
        <Text style={styles.meta}>Ordine {order.order_number} · {formatEuro(order.total_cents)} pagati</Text>
      </View>
      <View style={styles.steps}>{(next[order.fulfilment] ?? next.home).map((t, i) => <View key={t} style={styles.step}>
        <StepTag n={i + 1} /><Text style={styles.stepText}>{t}</Text></View>)}</View>
      <View style={{ gap: 10, marginTop: 8 }}>
        <PrimaryButton title="Segui l'ordine" onPress={() => router.replace(`/order/${order.id}`)} />
        <SecondaryButton title="Continua lo shopping" onPress={() => router.replace('/')} />
      </View>
    </Screen>;
  }

  if (order.status === 'cancelled') return <Screen stack>
    <EmptyState icon="close" title="Ordine annullato" message="Il pagamento non è stato completato in tempo. I prodotti sono ancora nel tuo carrello.">
      <PrimaryButton title="Torna al carrello" onPress={() => router.replace('/cart')} />
    </EmptyState>
  </Screen>;

  // Still pending: payment abandoned or not yet confirmed.
  const retry = async () => {
    setBusy(true); setError('');
    try { await openCheckout(await resumeCheckout(order.id)); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true); setError('');
    try { await cancelPendingOrder(order.id); router.replace('/cart'); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  return <Screen stack>
    <EmptyState icon="card" title={polling ? 'Verifica del pagamento…' : 'Pagamento non completato'}
      message={`L'ordine ${order.order_number} è in attesa di pagamento e resterà riservato per qualche minuto.`}>
      {polling ? <Loading label="Attendi qualche secondo" /> : <>
        <PrimaryButton title={`Paga ${formatEuro(order.total_cents)}`} icon="card" loading={busy} onPress={retry} />
        <SecondaryButton title="Annulla ordine e torna al carrello" onPress={cancel} disabled={busy} />
      </>}
      {!!error && <View><Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text></View>}
    </EmptyState>
  </Screen>;
}

const styles = StyleSheet.create({
  green: { flex: 1, backgroundColor: colors.band, paddingHorizontal: 22, overflow: 'hidden' },
  gKicker: { fontSize: 12.5, letterSpacing: 1.8, fontFamily: fonts.sansSemiBold, color: colors.bandMuted },
  gTitle: { fontSize: 48, lineHeight: 52, letterSpacing: -1.6, fontFamily: fonts.display, color: '#FFFFFF', marginTop: 12 },
  gText: { fontSize: 16, lineHeight: 22, fontFamily: fonts.sans, color: colors.bandMuted, marginTop: 10 },
  // The till's slot the ticket comes out of.
  slot: { height: 10, borderRadius: 5, backgroundColor: '#132A18', marginTop: 28, marginHorizontal: -4, zIndex: 2 }, // ui-check: allow (slot, darker band)
  tClip: { overflow: 'hidden', marginTop: -5, paddingBottom: 16 },
  ticket: { marginHorizontal: 8, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 26, backgroundColor: colors.bandLogo,
    borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  tTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  tKicker: { flexShrink: 1, fontSize: 11.5, letterSpacing: 2, fontFamily: fonts.sansBold, color: colors.band, marginTop: 4 },
  tTitle: { fontSize: 25, lineHeight: 30, letterSpacing: -0.6, fontFamily: fonts.display, color: colors.band, marginTop: 4 },
  tSub: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.band, opacity: 0.8, marginTop: 2 },
  tCode: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 12, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 8 },
  tCodeText: { textAlign: 'center', fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.text, marginTop: 6 },
  tTear: { position: 'absolute', left: 0, right: 0, bottom: -7, height: 14, flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' },
  tTooth: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.band },
  gButton: { alignSelf: 'stretch', height: 54, paddingHorizontal: 26, borderRadius: 27, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', minWidth: 300 },
  gButtonText: { fontSize: 16, fontFamily: fonts.sansBold, color: colors.text },
  gLink: { fontSize: 14.5, fontFamily: fonts.sansBold, color: colors.onBrand, textDecorationLine: 'underline' },
  done: { alignItems: 'center', paddingTop: 24, gap: 8 },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 28, lineHeight: 34, fontFamily: fonts.display, color: colors.text, textAlign: 'center' },
  meta: { fontSize: 15, color: colors.muted, textAlign: 'center', fontFamily: fonts.sans },
  steps: { marginTop: 24, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 14 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text, fontFamily: fonts.sans },
});
