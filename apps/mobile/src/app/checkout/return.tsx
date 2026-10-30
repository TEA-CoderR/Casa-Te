import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { friendlyError } from '@casa-te/shared';
import { formatEuro } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { StepTag } from '@/components/ShopMarks';
import { EmptyState, Loading, PrimaryButton, SecondaryButton } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { useLayout } from '@/lib/hooks';
import { cancelPendingOrder, fetchOrder, resumeCheckout, type OrderDetail } from '@/lib/api';
import { openCheckout } from '@/lib/payments';
import { invalidate } from '@/lib/useQuery';
import { useCartStore } from '@/store/cart';
import { useSession } from '@/store/session';

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
    // Phone (design F): a full green thank-you page with the yellow tick, then "Segui l'ordine".
    if (!wide) return <Animated.View entering={FadeIn.duration(260)} style={[styles.green, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.tick}><Icon name="check" size={46} color={colors.text} strokeWidth={2.6} /></Animated.View>
      <Animated.Text entering={FadeInDown.delay(80).duration(420)} style={styles.gTitle} accessibilityRole="header">Grazie, ordine ricevuto</Animated.Text>
      <Animated.Text entering={FadeInDown.delay(140).duration(420)} style={styles.gText}>{order.fulfilment === 'store'
        ? `Ti scriviamo appena è pronto al ritiro${order.order_number ? `. Ordine ${order.order_number}` : ''}.` : `Ti scriviamo quando parte. Ordine ${order.order_number}.`}</Animated.Text>
      <Animated.View entering={FadeInDown.delay(200).duration(420)} style={{ alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.replace(`/order/${order.id}`)} accessibilityRole="button" style={styles.gButton}><Text style={styles.gButtonText}>Segui l’ordine</Text></Pressable>
        <Pressable onPress={() => router.replace('/')} accessibilityRole="button" hitSlop={8}><Text style={styles.gLink}>Continua lo shopping</Text></Pressable>
      </Animated.View>
    </Animated.View>;
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
  green: { flex: 1, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  tick: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  gTitle: { fontSize: 32, lineHeight: 36, fontFamily: fonts.display, color: '#FFFFFF', textAlign: 'center', marginTop: 22, marginBottom: 8 },
  gText: { fontSize: 16, lineHeight: 23, fontFamily: fonts.sans, color: colors.onBrand, textAlign: 'center', marginBottom: 28 },
  gButton: { height: 54, paddingHorizontal: 26, borderRadius: 27, backgroundColor: '#FFFFFF', justifyContent: 'center' },
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
