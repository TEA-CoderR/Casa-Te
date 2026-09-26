import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatEuro, friendlyError } from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { EmptyState, Loading, PrimaryButton, SecondaryButton } from '@/components/UI';
import { colors } from '@/config/theme';
import { cancelPendingOrder, fetchOrder, resumeCheckout, type OrderDetail } from '@/lib/api';
import { openCheckout } from '@/lib/payments';
import { invalidate } from '@/lib/useQuery';
import { useCartStore } from '@/store/cart';
import { useSession } from '@/store/session';

/** Landing page after Stripe Checkout (deep link on native, redirect on web). */
export default function CheckoutReturnScreen() {
  const { order: orderId, result } = useLocalSearchParams<{ order?: string; result?: string }>();
  const ready = useSession((s) => s.ready);
  const clearCart = useCartStore((s) => s.clear);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cleared = useRef(false);

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
    if (paid && !cleared.current) { cleared.current = true; clearCart(); invalidate('orders'); invalidate('featured'); }
  }, [paid, clearCart]);

  if (!orderId) return <Screen stack><EmptyState title="Link non valido" message="Torna alla home per continuare." icon="close">
    <PrimaryButton title="Vai alla home" onPress={() => router.replace('/')} /></EmptyState></Screen>;
  if (!order && polling) return <Screen stack><Loading label="Verifica del pagamento…" /></Screen>;
  if (!order) return <Screen stack><EmptyState title="Ordine non trovato" message="Accedi con lo stesso account usato per l'ordine." icon="search">
    <PrimaryButton title="I miei ordini" onPress={() => router.replace('/orders')} /></EmptyState></Screen>;

  if (paid) return <Screen stack>
    <EmptyState icon="check" title="Grazie per il tuo ordine!"
      message={`Ordine ${order.order_number} · ${formatEuro(order.total_cents)}. Ti abbiamo inviato una conferma via email e ti avviseremo a ogni aggiornamento.`}>
      <PrimaryButton title="Segui l'ordine" onPress={() => router.replace(`/order/${order.id}`)} />
      <SecondaryButton title="Continua lo shopping" onPress={() => router.replace('/')} />
    </EmptyState>
  </Screen>;

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
