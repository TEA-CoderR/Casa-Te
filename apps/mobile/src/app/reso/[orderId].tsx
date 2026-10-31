// Return / after-sales request for an order: items, reason, photos, refund or same-product exchange.
// Laid out like the order page: the green band, then three numbered steps on white plates, and a bar at the
// bottom with the estimated refund and "Invia richiesta". The amount charged back is decided by the server.
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  RETURN_GUARANTEE_DAYS, RETURN_REASON_LABELS, RETURN_WINDOW_DAYS, daysSinceHandover, friendlyError, returnableQuantities,
  type RefundMethod, type ReturnReason, type ReturnResolution,
} from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { BrandHeader, HeaderBack, StatusBand } from '@/components/BrandHeader';
import { StepTag } from '@/components/ShopMarks';
import { ProductImage } from '@/components/ProductImage';
import { Icon } from '@/components/Icon';
import { Loading, Notice, OptionCard, RadioMark } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { createReturnRequest, fetchOrder, fetchOrderReturns, imageUrl, uploadReturnPhoto } from '@/lib/api';
import { formatEuro } from '@/lib/price';
import { invalidate, useQuery } from '@/lib/useQuery';
import { useLayout, useStores } from '@/lib/hooks';
import { useUser } from '@/store/session';

const REASONS: ReturnReason[] = ['changed_mind', 'damaged', 'wrong_item', 'missing', 'other'];
/** What each reason asks for, under its name. */
const REASON_HINT: Partial<Record<ReturnReason, string>> = {
  damaged: 'Ci servono una o più foto', wrong_item: 'Ci servono una o più foto', missing: 'Solo rimborso', other: 'Raccontaci cosa è successo',
};
const MAX_PHOTOS = 5;

export default function ReturnRequestScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const user = useUser();
  const order = useQuery(orderId && user ? `orders:${orderId}` : null, () => fetchOrder(orderId!));
  const returns = useQuery(orderId && user ? `returns:${orderId}` : null, () => fetchOrderReturns(orderId!));
  const { stores } = useStores();
  const { wide } = useLayout();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<Array<{ uri: string; path: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [resolution, setResolution] = useState<ReturnResolution>('refund');
  const [method, setMethod] = useState<RefundMethod>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const left = useMemo(() => order.data ? returnableQuantities(order.data.order_items, returns.data ?? []) : {}, [order.data, returns.data]);
  if (!user) return <Redirect href="/auth/sign-in" />;
  if (!order.data || !returns.data) return <Screen stack><Stack.Screen options={{ title: 'Reso e assistenza' }} /><Loading /></Screen>;
  const o = order.data;
  const days = daysSinceHandover(o);
  const changeOk = days !== null && days <= RETURN_WINDOW_DAYS;
  const store = stores.find((s) => s.id === o.store_id);
  const items = o.order_items.filter((i) => (left[i.id] ?? 0) > 0);
  const chosen = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const value = chosen.reduce((sum, i) => sum + i.unit_price_cents * (qty[i.id] ?? 0), 0);
  // Display only: the server computes the amount after the order discount.
  const estimate = o.subtotal_cents > 0 ? Math.round(value * (1 - o.discount_cents / o.subtotal_cents)) : value;
  const photosNeeded = reason === 'damaged' || reason === 'wrong_item';
  const exchangeOk = reason !== 'missing';

  if (days === null || days > RETURN_GUARANTEE_DAYS || !items.length) return <Screen stack>
    <Stack.Screen options={{ title: 'Reso e assistenza' }} />
    <Notice title="Nessun articolo da rendere" message="Per questo ordine non è possibile aprire un nuovo reso. Per assistenza rivolgiti al negozio." />
  </Screen>;

  const pick = async () => {
    setError('');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length });
    if (res.canceled) return;
    setUploading(true);
    try {
      const added: Array<{ uri: string; path: string }> = [];
      for (const a of res.assets.slice(0, MAX_PHOTOS - photos.length)) added.push({ uri: a.uri, path: await uploadReturnPhoto(user.id, a.uri, a.mimeType) });
      setPhotos((p) => [...p, ...added]);
    } catch (e) { setError(friendlyError(e)); } finally { setUploading(false); }
  };

  const submit = async () => {
    setError('');
    if (!chosen.length) return setError('Scegli almeno un articolo.');
    if (!reason) return setError('Scegli il motivo.');
    if (photosNeeded && !photos.length) return setError('Aggiungi almeno una foto del prodotto.');
    if (reason === 'other' && !note.trim()) return setError('Spiegaci brevemente il problema.');
    setBusy(true);
    try {
      const res = await createReturnRequest({ orderId: o.id, items: chosen.map((i) => ({ order_item_id: i.id, quantity: qty[i.id] })),
        reason, note: note.trim(), resolution: exchangeOk ? resolution : 'refund', refundMethod: exchangeOk && resolution === 'exchange' ? null : method,
        photos: photos.map((p) => p.path) });
      invalidate(`returns:${o.id}`); invalidate(`orders:${o.id}`);
      router.replace({ pathname: '/order/[id]', params: { id: o.id, reso: res.return_number } });
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const daysLeft = Math.max(1, Math.ceil(RETURN_WINDOW_DAYS - (days ?? 0)));
  const storeName = store ? store.name.replace(/^CASA & TE\s*/, '').replace(/^(\S+)\s+(?!·)/, '$1 · ') : 'il negozio';
  const refund = resolution === 'refund' || !exchangeOk;
  const count = chosen.reduce((n, i) => n + (qty[i.id] ?? 0), 0);
  const back = () => router.canGoBack() ? router.back() : router.replace({ pathname: '/order/[id]', params: { id: o.id } });
  const header = wide ? undefined : <BrandHeader inScroll title="Reso e assistenza" subtitle={`Ordine ${o.order_number}`} titleSize={26} pad={[14, 16, 18]}
    left={<HeaderBack onPress={back} />} />;

  // The bar at the bottom: what the request is worth so far, and the button.
  const footer = <View style={styles.bar}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.barLabel} numberOfLines={1}>{!count ? 'Nessun articolo scelto' : refund ? `Rimborso stimato · ${count} ${count === 1 ? 'articolo' : 'articoli'}` : `Cambio · ${count} ${count === 1 ? 'articolo' : 'articoli'}`}</Text>
      <Text style={styles.barValue} numberOfLines={1}>{!count ? '—' : refund ? formatEuro(estimate).replace(/€\s/, '€') : 'Stesso prodotto'}</Text>
    </View>
    <Pressable onPress={submit} disabled={busy || uploading} accessibilityRole="button"
      style={({ pressed }) => [styles.send, (busy || uploading) && { opacity: 0.5 }, pressed && { opacity: 0.88 }]}>
      <Text style={styles.sendText}>{busy ? 'Invio…' : 'Invia richiesta'}</Text>
    </Pressable>
  </View>;

  return <Screen stack header={wide ? undefined : <StatusBand />} top={header} ground={colors.page} maxWidth={640} footer={footer}
    contentContainerStyle={wide ? undefined : { padding: 0, paddingBottom: 24 }} bodyStyle={wide ? undefined : { paddingHorizontal: 16 }}>
    <Stack.Screen options={{ title: 'Reso e assistenza', headerShown: wide }} />

    {/* How it works, in three tags: nothing to ship, the store approves, the items go back to the store. */}
    <View style={[styles.plate, styles.how]}>
      {['Scegli gli articoli', 'Il negozio approva', `Li porti a ${storeName}`].map((t, i) => <View key={t} style={styles.howStep}>
        <StepTag n={i + 1} /><Text style={styles.howText}>{t}</Text>
      </View>)}
    </View>

    <Text style={styles.h} accessibilityRole="header">Cosa vuoi rendere?</Text>
    <View style={styles.plate}>{items.map((i, n) => {
      const q = qty[i.id] ?? 0; const max = left[i.id] ?? 0;
      const set = (v: number) => setQty((s) => ({ ...s, [i.id]: Math.max(0, Math.min(max, v)) }));
      return <Pressable key={i.id} onPress={() => set(q ? 0 : 1)} accessibilityRole="checkbox" accessibilityState={{ checked: q > 0 }}
        accessibilityLabel={`${i.name}, ${formatEuro(i.unit_price_cents)}`} style={[styles.itemRow, n > 0 && styles.sep]}>
        <View style={[styles.check, q > 0 && styles.checkOn]}>{q > 0 && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}</View>
        <View style={styles.thumb}><ProductImage uri={imageUrl(i.image_path)} sku={i.sku} label={i.name} inset={0} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.itemName} numberOfLines={2}>{i.name}</Text>
          <Text style={styles.itemMeta}>{formatEuro(i.unit_price_cents).replace(/€\s/, '€')}{max > 1 ? ` · fino a ${max}` : ''}</Text>
        </View>
        {q > 0 && max > 1 && <View style={styles.stepper}>
          <Pressable onPress={() => set(q - 1)} accessibilityRole="button" accessibilityLabel={`Togli un ${i.name}`} style={styles.step}><Text style={styles.stepGlyph}>−</Text></Pressable>
          <Text style={styles.stepValue} accessibilityLabel={`Da rendere: ${q}`}>{q}</Text>
          <Pressable onPress={() => set(q + 1)} disabled={q >= max} accessibilityRole="button" accessibilityLabel={`Aggiungi un ${i.name}`} style={[styles.step, q >= max && { opacity: 0.3 }]}><Text style={styles.stepGlyph}>+</Text></Pressable>
        </View>}
      </Pressable>;
    })}</View>

    <Text style={styles.h} accessibilityRole="header">Perché?</Text>
    <View style={styles.plate} accessibilityRole="radiogroup">{REASONS.map((r, n) => {
      const disabled = r === 'changed_mind' && !changeOk;
      const on = reason === r;
      const hint = r === 'changed_mind' ? (changeOk ? `Entro ${RETURN_WINDOW_DAYS} giorni dal ritiro: ne restano ${daysLeft}` : `Sono passati più di ${RETURN_WINDOW_DAYS} giorni dal ritiro`) : REASON_HINT[r];
      return <Pressable key={r} onPress={() => setReason(r)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }}
        style={[styles.reason, n > 0 && styles.sep, disabled && { opacity: 0.45 }]}>
        <RadioMark on={on} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.reasonText, on && styles.reasonTextOn]}>{RETURN_REASON_LABELS[r]}</Text>
          {!!hint && <Text style={styles.reasonHint}>{hint}</Text>}
        </View>
      </Pressable>;
    })}</View>
    {reason === 'changed_mind' && <Text style={styles.fine}>I prodotti cosmetici e per l’igiene aperti non si possono rendere per ripensamento.</Text>}

    {reason && <>
      <Text style={styles.label}>{photosNeeded ? 'Foto del prodotto' : 'Foto (facoltative)'}</Text>
      <View style={styles.photos}>
        {photos.map((p) => <View key={p.path} style={styles.photo}>
          <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          <Pressable onPress={() => setPhotos((s) => s.filter((x) => x.path !== p.path))} accessibilityRole="button" accessibilityLabel="Togli foto" style={styles.photoX}>
            <Icon name="close" size={12} color="#FFFFFF" strokeWidth={3} /></Pressable>
        </View>)}
        {photos.length < MAX_PHOTOS && <Pressable onPress={pick} disabled={uploading} accessibilityRole="button" accessibilityLabel="Aggiungi foto"
          style={({ pressed }) => [styles.photo, styles.photoAdd, pressed && { opacity: 0.7 }]}>
          <Icon name="plus" size={22} color={colors.green} strokeWidth={2.2} />
          <Text style={styles.photoAddText}>{uploading ? 'Carico…' : 'Foto'}</Text>
        </Pressable>}
      </View>
      <Text style={styles.label}>{reason === 'other' ? 'Cosa è successo?' : 'Messaggio per il negozio (facoltativo)'}</Text>
      <TextInput value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Es. la confezione era aperta, il colore non è quello ordinato…"
        placeholderTextColor={colors.faint} accessibilityLabel="Messaggio per il negozio" style={styles.note} />

      <Text style={styles.h} accessibilityRole="header">Come preferisci risolvere?</Text>
      <View style={{ gap: 8 }}>
        <OptionCard selected={refund} onPress={() => setResolution('refund')} title="Rimborso"
          description="Il prezzo pagato, sconti inclusi; la spedizione non è rimborsata" right={count ? formatEuro(estimate).replace(/€\s/, '€') : undefined} />
        {exchangeOk && <OptionCard selected={!refund} onPress={() => setResolution('exchange')} title="Cambio con lo stesso prodotto"
          description="Lo ritiri in negozio quando porti l’articolo" />}
      </View>
      {refund && <>
        <Text style={styles.label}>Dove ricevi il rimborso</Text>
        <View style={{ gap: 8 }}>
          <OptionCard selected={method === 'card'} onPress={() => setMethod('card')} title="Sul metodo di pagamento" description="Accredito in 5–10 giorni lavorativi" />
          <OptionCard selected={method === 'voucher'} onPress={() => setMethod('voucher')} title="Buono CASA & TE" description="Subito dopo la verifica in negozio, valido 12 mesi online" />
        </View>
      </>}
    </>}

    {!!error && <View style={{ marginTop: 16 }}><Notice tone="error" message={error} /></View>}
    <Text style={[styles.fine, { marginTop: 18, textAlign: 'center' }]}>Ti rispondiamo via email, di solito entro 2 giorni lavorativi. Segui la richiesta nella pagina dell’ordine.</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  plate: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 },
  how: { flexDirection: 'row', gap: 10, paddingVertical: 14, marginTop: 14 },
  howStep: { flex: 1, alignItems: 'center', gap: 6 },
  howText: { fontSize: 12.5, lineHeight: 16, textAlign: 'center', fontFamily: fonts.sansSemiBold, color: colors.text },
  h: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display, color: colors.text, marginTop: 26, marginBottom: 10, marginLeft: 2 },
  label: { fontSize: 13.5, fontFamily: fonts.sansBold, color: colors.text, marginTop: 18, marginBottom: 8, marginLeft: 2 },
  sep: { borderTopWidth: 1, borderColor: '#EFECE3' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#B9B4A6', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.green, borderColor: colors.green },
  thumb: { width: 52, height: 52 },
  itemName: { fontSize: 14.5, lineHeight: 19, fontFamily: fonts.sansSemiBold, color: colors.text },
  itemMeta: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 38, borderRadius: 19, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line },
  step: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 18, fontFamily: fonts.sansBold, color: colors.text },
  stepValue: { minWidth: 14, textAlign: 'center', fontSize: 15, fontFamily: fonts.heavy, color: colors.text },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  reasonText: { fontSize: 15, fontFamily: fonts.sansSemiBold, color: colors.text },
  reasonTextOn: { fontFamily: fonts.heavy },
  reasonHint: { fontSize: 12.5, color: colors.muted, fontFamily: fonts.sans, marginTop: 1 },
  fine: { fontSize: 12.5, lineHeight: 17, color: colors.muted, fontFamily: fonts.sans, marginTop: 8, marginHorizontal: 2 },
  note: { minHeight: 84, textAlignVertical: 'top', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    padding: 12, fontSize: 14.5, fontFamily: fonts.sans, color: colors.text },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 76, height: 76, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.photo },
  photoX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  photoAdd: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.green, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 2 },
  photoAddText: { fontSize: 12, color: colors.green, fontFamily: fonts.sansBold },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  barLabel: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.muted },
  barValue: { fontSize: 20, lineHeight: 25, fontFamily: fonts.heavy, color: colors.text },
  send: { height: 52, paddingHorizontal: 22, borderRadius: 26, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 16, fontFamily: fonts.sansBold, color: '#FFFFFF' },
});
