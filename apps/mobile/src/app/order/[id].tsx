import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FULFILMENT_LABELS, PAYMENT_STATUS_LABELS, formatWeight, friendlyError, orderStatusLabel, orderTimeline } from '@casa-te/shared';
import { BrandHeader, HeaderBack, StatusBand } from '@/components/BrandHeader';
import { formatEuro, formatShipping } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { OrderTimeline } from '@/components/OrderTimeline';
import { ProductImage } from '@/components/ProductImage';
import { EmptyState, Loading, Notice, PrimaryButton, SecondaryButton, SectionTitle, SummaryRow } from '@/components/UI';
import { colors, floatShadow, fonts } from '@/config/theme';
import { cancelPendingOrder, fetchOrder, imageUrl, resumeCheckout } from '@/lib/api';
import { useLayout, useStores } from '@/lib/hooks';
import { Icon } from '@/components/Icon';
import { openCheckout } from '@/lib/payments';
import { useQuery, useRefetchOnFocus } from '@/lib/useQuery';
import { useCartStore } from '@/store/cart';
import { OrderReturns } from '@/components/OrderReturns';

const HEADLINES: Record<string, string> = {
  pending_payment: 'In attesa di pagamento', paid: 'Abbiamo ricevuto il tuo ordine', picking: 'Stiamo preparando il tuo ordine',
  ready: 'Il tuo ordine è pronto', shipped: 'Il tuo ordine è in viaggio', completed: 'Ordine completato', cancelled: 'Ordine annullato',
};

export default function OrderDetailScreen() {
  const { id, reso } = useLocalSearchParams<{ id: string; reso?: string }>();
  const { data: order, loading, refetch } = useQuery(id ? `orders:${id}` : null, () => fetchOrder(id!));
  const { stores } = useStores();
  const add = useCartStore((s) => s.add);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { wide } = useLayout();
  const [itemsOpen, setItemsOpen] = useState(false);
  useRefetchOnFocus(refetch);

  if (loading && !order) return <Screen stack><Loading /></Screen>;
  if (!order) return <Screen stack><EmptyState title="Ordine non trovato" message="Controlla di aver effettuato l'accesso." icon="search">
    <PrimaryButton title="I miei ordini" onPress={() => router.replace('/orders')} /></EmptyState></Screen>;

  const store = stores.find((s) => s.id === order.store_id);
  const pending = order.status === 'pending_payment' && new Date(order.expires_at) > new Date();
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await refetch(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const reorder = () => { order.order_items.forEach((i) => i.product_id && add(i.product_id, i.quantity)); router.push('/cart'); };

  // Phone (design F, F-Ordine): the awning with the pickup pass hanging from it, the status timeline,
  // quick actions for the store, and the folded list of products.
  if (!wide) {
    const euro = (c: number) => formatEuro(c).replace(/€\s/, '€');
    const steps = orderTimeline(order.fulfilment);
    const current = steps.indexOf(order.status);
    const at = (st: string) => order.order_events.filter((e) => e.kind === 'status' && e.status === st).at(-1)?.created_at;
    const when = (iso?: string) => iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const readyAt = at('ready');
    const until = readyAt && order.fulfilment === 'store' ? new Date(new Date(readyAt).getTime() + 14 * 86400000).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : null;
    const SUB: Record<string, string> = { paid: 'Pagamento confermato', picking: 'Lo staff del negozio raccoglie i tuoi prodotti',
      ready: order.fulfilment === 'store' ? 'Ti abbiamo inviato un’email' : 'Pronto per il corriere', shipped: 'Affidato al corriere', completed: order.fulfilment === 'store' ? 'Grazie e a presto!' : 'Consegnato' };
    const count = order.order_items.reduce((n, i) => n + i.quantity, 0);
    const grid: Array<[string, string]> = [
      [order.fulfilment === 'store' ? 'Negozio' : 'Consegna', order.fulfilment === 'store' ? (store?.name.replace(/^CASA & TE\s*/, '').replace(/^(\S+)\s+(?!·)/, '$1 · ') ?? 'Negozio') : FULFILMENT_LABELS[order.fulfilment]],
      [order.fulfilment === 'store' ? 'Orari' : 'Data', order.fulfilment === 'store' && store?.opening_hours ? store.opening_hours : new Date(order.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })],
      [until ? 'Ritira entro' : 'Ordinato il', until ?? new Date(order.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })],
      ['Pagato', `${euro(order.total_cents)} · ${count} ${count === 1 ? 'articolo' : 'articoli'}`],
    ];
    const header = <BrandHeader inScroll title="Il tuo ordine" titleSize={26} pad={[14, 16, 92]}
      left={<HeaderBack onPress={() => router.canGoBack() ? router.back() : router.replace('/orders')} />} />;
    return <Screen header={<StatusBand />} top={header} ground={colors.page} onRefresh={refetch} refreshing={loading}
      contentContainerStyle={{ padding: 0, paddingBottom: 24 }} bodyStyle={{ paddingHorizontal: 16 }}>
      <Stack.Screen options={{ headerShown: false, title: `Ordine ${order.order_number}` }} />
      <View style={[styles.pass, { marginTop: -96 }]} accessibilityLabel={`${HEADLINES[order.status] ?? ''}. Ordine ${order.order_number}`}>
        <View style={styles.passTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.passDot, order.status === 'cancelled' && { backgroundColor: colors.danger, borderColor: colors.danger }]} />
            <Text style={styles.passStatus}>{orderStatusLabel(order.status, order.fulfilment)}</Text>
          </View>
          <Text style={styles.passHead} accessibilityRole="header">{order.fulfilment === 'store' && order.status === 'ready' ? 'Il tuo ordine ti aspetta' : HEADLINES[order.status] ?? orderStatusLabel(order.status, order.fulfilment)}</Text>
          <View style={styles.passGrid}>{grid.map(([k, v]) => <View key={k} style={styles.passCell}>
            <Text style={styles.passKey}>{k}</Text><Text style={styles.passValue}>{v}</Text></View>)}</View>
        </View>
        <View style={styles.tear}><View style={[styles.notch, { left: -12 }]} /><View style={styles.tearLine} /><View style={[styles.notch, { right: -12 }]} /></View>
        <View style={styles.passBottom}>
          <Text style={styles.passHint}>{order.fulfilment === 'store' ? 'Mostra questo codice in cassa' : 'Numero d’ordine'}</Text>
          <Text style={styles.passCode} selectable>{order.order_number}</Text>
        </View>
      </View>

      {pending && <View style={{ marginTop: 14 }}><Notice title="In attesa di pagamento" message="Completa il pagamento per confermare l'ordine.">
        <View style={{ gap: 8, marginTop: 6 }}>
          <PrimaryButton title={`Paga ${formatEuro(order.total_cents)}`} icon="card" loading={busy} onPress={() => act(async () => openCheckout(await resumeCheckout(order.id)))} />
          <SecondaryButton title="Annulla ordine" onPress={() => act(() => cancelPendingOrder(order.id))} disabled={busy} />
        </View></Notice></View>}
      {(order.payment_status === 'refunded' || order.payment_status === 'partially_refunded') && <View style={{ marginTop: 14 }}>
        <Notice tone="success" title={PAYMENT_STATUS_LABELS[order.payment_status]} message={`Importo rimborsato: ${formatEuro(order.refunded_cents)}. L'accredito può richiedere 5–10 giorni lavorativi.`} /></View>}
      {!!error && <Notice tone="error" message={error} />}
      {!!reso && <View style={{ marginTop: 14 }}><Notice tone="success" title={`Richiesta ${reso} inviata`}
        message="Il negozio la valuta e ti scrive via email. Trovi lo stato qui sotto, in Resi e assistenza." /></View>}

      {order.status !== 'pending_payment' && <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">Stato dell’ordine</Text>
        {order.status === 'cancelled' ? <Text style={[styles.stepSub, { color: colors.danger, marginVertical: 12 }]}>Ordine annullato</Text>
          : <View style={{ marginTop: 14 }}>{steps.map((st, i) => {
            const done = i < current || (i === current && st === 'completed');
            const now = i === current && st !== 'completed';
            return <View key={st} style={styles.tlRow}>
              <View style={{ width: 26, alignItems: 'center' }}>
                <View style={[styles.tlDot, (done || now) && styles.tlDone, now && styles.tlNow]}>
                  {(done || now) && <Icon name="check" size={14} color={now ? colors.text : '#FFFFFF'} strokeWidth={3.2} />}</View>
                {i < steps.length - 1 && <View style={[styles.tlLine, i < current && { backgroundColor: colors.green }]} />}
              </View>
              <View style={{ flex: 1, paddingTop: 2, paddingBottom: 14 }}>
                <Text style={[styles.stepTitle, now && { fontFamily: fonts.heavy }, i > current && { color: '#7A7F74' }]}>{st === 'paid' ? 'Ordine ricevuto' : orderStatusLabel(st, order.fulfilment)}</Text>
                <Text style={styles.stepSub}>{[SUB[st], when(at(st))].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>;
          })}</View>}
      </View>}

      {order.tracking_number && <Pressable style={[styles.card, { paddingBottom: 18 }]} disabled={!order.tracking_url} onPress={() => order.tracking_url && Linking.openURL(order.tracking_url)}>
        <Text style={styles.stepTitle}>{order.carrier ?? 'Corriere'} · {order.tracking_number}</Text>
        {order.tracking_url && <Text style={[styles.stepSub, { color: colors.green, fontFamily: fonts.sansBold }]}>Traccia spedizione</Text>}
      </Pressable>}

      <View style={styles.actions}>
        {!!store?.address && <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.address}, ${store.city}`)}`)}
          accessibilityRole="link" style={styles.action}><Icon name="pin" size={19} color={colors.green} strokeWidth={2} /><Text style={styles.actionText}>Indicazioni</Text></Pressable>}
        {!!store?.phone && <Pressable onPress={() => Linking.openURL(`tel:${store.phone}`)} accessibilityRole="link" style={styles.action}>
          <Icon name="phone" size={19} color={colors.green} strokeWidth={2} /><Text style={styles.actionText}>Chiama il negozio</Text></Pressable>}
      </View>

      <View style={styles.fold}>
        <Pressable onPress={() => setItemsOpen(!itemsOpen)} accessibilityRole="button" accessibilityState={{ expanded: itemsOpen }} style={styles.foldHead}>
          <Text style={styles.foldTitle}>Articoli nell’ordine</Text>
          <View style={{ transform: [{ rotate: itemsOpen ? '180deg' : '0deg' }] }}><Icon name="down" size={18} color={colors.text} strokeWidth={2.2} /></View>
        </Pressable>
        {itemsOpen && <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
          {order.order_items.map((item) => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44 }}><ProductImage uri={imageUrl(item.image_path)} sku={item.sku} label={item.name} inset={0} /></View>
            <Text style={styles.itemName} numberOfLines={2}>{item.quantity > 1 ? `${item.quantity} × ` : ''}{item.name}</Text>
            <Text style={styles.itemTotal}>{euro(item.line_total_cents)}</Text>
          </View>)}
          <View style={{ height: 1, backgroundColor: '#EFECE3', marginVertical: 4 }} />
          <SummaryRow label="Prodotti" value={euro(order.subtotal_cents)} />
          {order.discount_cents > 0 && <SummaryRow label={`Sconto ${order.coupon_code ?? ''}`} value={`-${euro(order.discount_cents)}`} tone="green" />}
          <SummaryRow label={order.fulfilment === 'store' ? 'Ritiro in negozio' : 'Spedizione'} value={formatShipping(order.shipping_cents).replace(/€\s/, '€')} />
          <SummaryRow label="Pagamento" value={PAYMENT_STATUS_LABELS[order.payment_status]} />
        </View>}
      </View>

      <OrderReturns order={order} />

      {order.status !== 'pending_payment' && <Pressable onPress={reorder} accessibilityRole="button" style={styles.reorder}>
        <Icon name="bag" size={18} color={colors.green} strokeWidth={2} /><Text style={styles.actionText}>Ordina di nuovo</Text></Pressable>}
      {!!order.seller_snapshot && <Text style={[styles.fine, { marginTop: 12, marginHorizontal: 4 }]}>
        Venditore: {order.seller_snapshot.legal_name} · P.IVA {order.seller_snapshot.vat_number}.</Text>}
    </Screen>;
  }

  return <Screen stack maxWidth={720} onRefresh={refetch} refreshing={loading} ground={wide ? undefined : colors.page}>
    <Stack.Screen options={{ title: `Ordine ${order.order_number}` }} />
    {wide ? <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.number}>{order.order_number}</Text>
        <Text style={styles.date}>{new Date(order.created_at).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}</Text>
      </View>
      <View style={styles.badge}><Text style={styles.badgeText}>{orderStatusLabel(order.status, order.fulfilment)}</Text></View>
    </View> : <View style={[styles.pass, floatShadow]} accessibilityLabel={`${HEADLINES[order.status] ?? orderStatusLabel(order.status, order.fulfilment)}. Ordine ${order.order_number}`}>
      {/* Phone (design F): the order as a pickup pass — status above, the code for the till below a tear line. */}
      <View style={styles.passTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.passDot, order.status === 'cancelled' && { backgroundColor: colors.danger }]} />
          <Text style={styles.passStatus}>{orderStatusLabel(order.status, order.fulfilment)}</Text>
        </View>
        <Text style={styles.passHead} accessibilityRole="header">{order.fulfilment === 'store' && order.status === 'ready' ? 'Il tuo ordine ti aspetta' : HEADLINES[order.status] ?? orderStatusLabel(order.status, order.fulfilment)}</Text>
        <View style={styles.passGrid}>
          {([
            [order.fulfilment === 'store' ? 'Negozio' : 'Consegna', order.fulfilment === 'store' ? (store?.name.replace(/^CASA & TE\s*/, '') ?? 'Negozio') : FULFILMENT_LABELS[order.fulfilment]],
            ['Data', new Date(order.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })],
            ...(order.fulfilment === 'store' && store?.opening_hours ? [['Orari', store.opening_hours]] : []),
            ['Totale', `${formatEuro(order.total_cents)} · ${order.order_items.reduce((n, i) => n + i.quantity, 0)} art.`],
          ] as Array<[string, string]>).map(([k, v]) => <View key={k} style={styles.passCell}>
            <Text style={styles.passKey}>{k}</Text><Text style={styles.passValue}>{v}</Text></View>)}
        </View>
      </View>
      <View style={styles.tear}>
        <View style={[styles.notch, { left: -12 }]} /><View style={styles.tearLine} /><View style={[styles.notch, { right: -12 }]} />
      </View>
      <View style={styles.passBottom}>
        <Text style={styles.passHint}>{order.fulfilment === 'store' ? 'Mostra questo codice in cassa' : 'Numero d’ordine'}</Text>
        <Text style={styles.passCode} selectable>{order.order_number}</Text>
        {order.fulfilment === 'store' && <Text style={styles.passName}>Ritiro a nome di {order.customer_name}</Text>}
      </View>
    </View>}

    {pending && <Notice title="In attesa di pagamento" message="Completa il pagamento per confermare l'ordine.">
      <View style={{ gap: 8, marginTop: 6 }}>
        <PrimaryButton title={`Paga ${formatEuro(order.total_cents)}`} icon="card" loading={busy}
          onPress={() => act(async () => openCheckout(await resumeCheckout(order.id)))} />
        <SecondaryButton title="Annulla ordine" onPress={() => act(() => cancelPendingOrder(order.id))} disabled={busy} />
      </View>
    </Notice>}
    {order.payment_status === 'refunded' || order.payment_status === 'partially_refunded'
      ? <Notice tone="success" title={PAYMENT_STATUS_LABELS[order.payment_status]} message={`Importo rimborsato: ${formatEuro(order.refunded_cents)}. L'accredito può richiedere 5–10 giorni lavorativi.`} /> : null}
    {!!error && <Notice tone="error" message={error} />}

    <View style={wide ? undefined : styles.card}>
      {!wide && <Text style={styles.cardTitle} accessibilityRole="header">Stato dell’ordine</Text>}
      <OrderTimeline order={order} events={order.order_events} />
    </View>
    {!wide && <View style={styles.actions}>
      {!!store?.address && order.fulfilment === 'store' && <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.address}, ${store.city}`)}`)}
        accessibilityRole="link" style={styles.action}><Icon name="pin" size={19} color={colors.green} strokeWidth={2} /><Text style={styles.actionText}>Indicazioni</Text></Pressable>}
      {!!store?.phone && <Pressable onPress={() => Linking.openURL(`tel:${store.phone}`)} accessibilityRole="link" style={styles.action}>
        <Icon name="phone" size={19} color={colors.green} strokeWidth={2} /><Text style={styles.actionText}>Chiama il negozio</Text></Pressable>}
    </View>}

    {order.tracking_number && <Pressable style={styles.tracking} disabled={!order.tracking_url}
      onPress={() => order.tracking_url && Linking.openURL(order.tracking_url)}>
      <Text style={styles.trackingText}>{order.carrier ?? 'Corriere'} · {order.tracking_number}</Text>
      {order.tracking_url && <Text style={[styles.trackingText, { textDecorationLine: 'underline' }]}>Traccia spedizione</Text>}
    </Pressable>}

    <SectionTitle>{FULFILMENT_LABELS[order.fulfilment]}</SectionTitle>
    {order.fulfilment === 'home' && order.shipping_address && <Text style={styles.block}>
      {order.shipping_address.full_name}{'\n'}{order.shipping_address.line1}{order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''}{'\n'}
      {order.shipping_address.postal_code} {order.shipping_address.city} ({order.shipping_address.province})</Text>}
    {order.fulfilment === 'pickup' && order.pickup_point_snapshot && <Text style={styles.block}>
      {order.pickup_point_snapshot.name}{'\n'}{order.pickup_point_snapshot.address}, {order.pickup_point_snapshot.postal_code} {order.pickup_point_snapshot.city}</Text>}
    {order.fulfilment === 'store' && <Text style={styles.block}>
      {store?.name ?? 'Negozio'}{store?.address ? `\n${store.address}, ${store.city}` : ''}{store?.opening_hours ? `\nOrari: ${store.opening_hours}` : ''}
      {'\n'}Ritiro a nome di {order.customer_name}. Mostra il numero d'ordine in cassa.</Text>}
    {wide && !!store?.phone && <Pressable onPress={() => Linking.openURL(`tel:${store.phone}`)}>
      <Text style={styles.link}>Contatta il negozio: {store.phone}</Text></Pressable>}

    <SectionTitle>Prodotti</SectionTitle>
    {order.order_items.map((item) => <View key={item.id} style={styles.item}>
      <View style={styles.thumb}><ProductImage uri={imageUrl(item.image_path)} sku={item.sku} label={item.name} inset={0.1} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemMeta}>{item.quantity} × {formatEuro(item.unit_price_cents)}</Text>
      </View>
      <Text style={styles.itemTotal}>{formatEuro(item.line_total_cents)}</Text>
    </View>)}

    <SectionTitle>Riepilogo</SectionTitle>
    <SummaryRow label="Prodotti" value={formatEuro(order.subtotal_cents)} />
    {order.discount_cents > 0 && <SummaryRow label={`Sconto ${order.coupon_code ?? ''}`} value={`-${formatEuro(order.discount_cents)}`} tone="green" />}
    <SummaryRow label="Spedizione" value={formatShipping(order.shipping_cents)} />
    <SummaryRow label="Peso" value={formatWeight(order.total_weight_g)} />
    <SummaryRow label="Totale (IVA inclusa)" value={formatEuro(order.total_cents)} strong />
    <SummaryRow label="Pagamento" value={PAYMENT_STATUS_LABELS[order.payment_status]} />
    {!!order.seller_snapshot && <Text style={[styles.fine, { marginTop: 10 }]}>
      Venditore: {order.seller_snapshot.legal_name}, {order.seller_snapshot.address}, {order.seller_snapshot.postal_code} {order.seller_snapshot.city} ({order.seller_snapshot.province}) · P.IVA {order.seller_snapshot.vat_number}</Text>}

    <View style={{ marginTop: 24, gap: 10 }}>
      {order.status !== 'pending_payment' && <SecondaryButton title="Ordina di nuovo" icon="bag" onPress={reorder} />}
    </View>
    {!!reso && <View style={{ marginTop: 14 }}><Notice tone="success" title={`Richiesta ${reso} inviata`}
      message="Il negozio la valuta e ti scrive via email. Trovi lo stato qui sotto." /></View>}
    <OrderReturns order={order} />
  </Screen>;
}

const styles = StyleSheet.create({
  pass: { borderRadius: 24, backgroundColor: '#FFFFFF', shadowColor: '#18201A', shadowOpacity: 0.16, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  tlRow: { flexDirection: 'row', gap: 14, minHeight: 60 },
  tlDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#D5D0C3', alignItems: 'center', justifyContent: 'center' },
  tlDone: { backgroundColor: colors.green, borderColor: colors.green },
  tlNow: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 4 },
  stepTitle: { fontSize: 15.5, fontFamily: fonts.sansSemiBold, color: colors.text },
  stepSub: { fontSize: 13, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  fold: { marginTop: 12, borderRadius: 18, backgroundColor: '#FFFFFF', overflow: 'hidden', borderBottomWidth: 1, borderColor: colors.line },
  foldHead: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  foldTitle: { fontSize: 15.5, fontFamily: fonts.sansBold, color: colors.text },
  reorder: { marginTop: 12, height: 54, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  passTop: { padding: 20, paddingBottom: 18 },
  passDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.yellow },
  passStatus: { fontSize: 13.5, fontFamily: fonts.heavy, color: colors.green },
  passHead: { fontSize: 30, lineHeight: 34, fontFamily: fonts.display, color: colors.text, marginTop: 8 },
  passGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, marginTop: 16 },
  passCell: { width: '50%', paddingRight: 8 },
  passKey: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  passValue: { fontSize: 15, fontFamily: fonts.sansBold, color: colors.text, marginTop: 2 },
  tear: { height: 24, justifyContent: 'center' },
  tearLine: { marginHorizontal: 22, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.line },
  notch: { position: 'absolute', top: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.page },
  passBottom: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20, alignItems: 'center' },
  passHint: { fontSize: 13, fontFamily: fonts.sansBold, color: colors.muted },
  passCode: { alignSelf: 'stretch', textAlign: 'center', marginTop: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.page,
    fontSize: 32, letterSpacing: 4, fontFamily: fonts.heavy, color: colors.text, overflow: 'hidden' },
  passName: { fontSize: 13, fontFamily: fonts.sansMedium, color: colors.muted, marginTop: 8 },
  card: { marginTop: 18, padding: 18, paddingBottom: 6, borderRadius: 22, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 21, lineHeight: 26, fontFamily: fonts.display, color: colors.text },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  actionText: { fontSize: 14.5, fontFamily: fonts.sansBold, color: colors.text },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  number: { fontSize: 22, fontWeight: '600', color: colors.text },
  date: { fontSize: 12, color: colors.muted, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#EBF1E5' },
  badgeText: { color: colors.green, fontSize: 12, fontWeight: '600' },
  tracking: { marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 4 },
  trackingText: { color: colors.green, fontSize: 13, fontWeight: '500' },
  block: { fontSize: 14, lineHeight: 21, color: colors.text, fontFamily: fonts.sans },
  link: { color: colors.green, marginTop: 10, fontWeight: '500' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  itemName: { flex: 1, fontSize: 14, color: colors.text, fontFamily: fonts.sansSemiBold },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  itemTotal: { fontSize: 14, fontFamily: fonts.heavy, color: colors.text },
  fine: { fontSize: 12, color: colors.muted, lineHeight: 17 },
});
