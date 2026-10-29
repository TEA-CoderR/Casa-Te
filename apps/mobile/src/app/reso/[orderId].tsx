// Return / after-sales request for an order: items, reason, photos, refund or same-product exchange.
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  RETURN_GUARANTEE_DAYS, RETURN_REASON_LABELS, RETURN_WINDOW_DAYS, daysSinceHandover, friendlyError, returnableQuantities,
  type RefundMethod, type ReturnReason, type ReturnResolution,
} from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { ProductImage } from '@/components/ProductImage';
import { Icon } from '@/components/Icon';
import { Loading, Notice, OptionCard, PrimaryButton } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { createReturnRequest, fetchOrder, fetchOrderReturns, imageUrl, uploadReturnPhoto } from '@/lib/api';
import { formatEuro } from '@/lib/price';
import { invalidate, useQuery } from '@/lib/useQuery';
import { useStores } from '@/lib/hooks';
import { useUser } from '@/store/session';

const REASONS: ReturnReason[] = ['changed_mind', 'damaged', 'wrong_item', 'missing', 'other'];
const MAX_PHOTOS = 5;

export default function ReturnRequestScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const user = useUser();
  const order = useQuery(orderId && user ? `orders:${orderId}` : null, () => fetchOrder(orderId!));
  const returns = useQuery(orderId && user ? `returns:${orderId}` : null, () => fetchOrderReturns(orderId!));
  const { stores } = useStores();
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

  return <Screen stack maxWidth={640} ground={colors.page}>
    <Stack.Screen options={{ title: 'Reso e assistenza' }} />
    <Text style={styles.lead}>Ordine {o.order_number}. Dopo l'approvazione porti gli articoli {store ? `nel negozio ${store.name.replace(/^CASA & TE\s*/, '')}` : 'in negozio'}: non serve spedire nulla.</Text>

    <Text style={styles.h}>1. Quali articoli?</Text>
    <View style={styles.box}>{items.map((i, n) => {
      const q = qty[i.id] ?? 0; const max = left[i.id] ?? 0;
      const set = (v: number) => setQty((s) => ({ ...s, [i.id]: Math.max(0, Math.min(max, v)) }));
      return <View key={i.id} style={[styles.itemRow, n > 0 && styles.sep]}>
        <View style={{ width: 48, height: 48 }}><ProductImage uri={imageUrl(i.image_path)} sku={i.sku} label={i.name} inset={0} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.itemName} numberOfLines={2}>{i.name}</Text>
          <Text style={styles.itemMeta}>{formatEuro(i.unit_price_cents)} · acquistati {i.quantity}{max < i.quantity ? ` · rendibili ${max}` : ''}</Text>
        </View>
        <View style={styles.stepper}>
          <Pressable onPress={() => set(q - 1)} disabled={q === 0} accessibilityRole="button" accessibilityLabel={`Togli un ${i.name}`} style={[styles.step, q === 0 && { opacity: 0.3 }]}><Text style={styles.stepGlyph}>−</Text></Pressable>
          <Text style={styles.stepValue} accessibilityLabel={`Da rendere: ${q}`}>{q}</Text>
          <Pressable onPress={() => set(q + 1)} disabled={q >= max} accessibilityRole="button" accessibilityLabel={`Aggiungi un ${i.name}`} style={[styles.step, q >= max && { opacity: 0.3 }]}><Text style={styles.stepGlyph}>+</Text></Pressable>
        </View>
      </View>;
    })}</View>

    <Text style={styles.h}>2. Perché?</Text>
    <View style={styles.chips}>{REASONS.map((r) => {
      const disabled = r === 'changed_mind' && !changeOk;
      return <Pressable key={r} onPress={() => setReason(r)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: reason === r, disabled }}
        style={[styles.chip, reason === r && styles.chipOn, disabled && { opacity: 0.4 }]}>
        <Text style={[styles.chipText, reason === r && { color: '#FFFFFF' }]}>{RETURN_REASON_LABELS[r]}</Text>
      </Pressable>;
    })}</View>
    <Text style={styles.fine}>{changeOk ? `Puoi cambiare idea entro ${RETURN_WINDOW_DAYS} giorni dal ritiro o dalla consegna (ancora ${Math.max(1, Math.ceil(RETURN_WINDOW_DAYS - (days ?? 0)))}).`
      : `Sono passati più di ${RETURN_WINDOW_DAYS} giorni: puoi chiedere assistenza per prodotti difettosi, danneggiati o sbagliati.`}
      {' '}Prodotti cosmetici e per l'igiene aperti non si possono rendere per ripensamento.</Text>

    {reason && <>
      <Text style={styles.label}>{reason === 'other' ? 'Raccontaci cosa è successo' : 'Vuoi aggiungere qualcosa? (facoltativo)'}</Text>
      <TextInput value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Es. la confezione era aperta, il colore non è quello ordinato…"
        placeholderTextColor={colors.faint} accessibilityLabel="Messaggio per il negozio" style={styles.note} />

      <Text style={styles.label}>Foto {photosNeeded ? '(obbligatorie)' : '(facoltative)'}</Text>
      <View style={styles.photos}>
        {photos.map((p) => <View key={p.path} style={styles.photo}>
          <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          <Pressable onPress={() => setPhotos((s) => s.filter((x) => x.path !== p.path))} accessibilityRole="button" accessibilityLabel="Togli foto" style={styles.photoX}>
            <Icon name="close" size={12} color="#FFFFFF" strokeWidth={3} /></Pressable>
        </View>)}
        {photos.length < MAX_PHOTOS && <Pressable onPress={pick} disabled={uploading} accessibilityRole="button" style={[styles.photo, styles.photoAdd]}>
          <Icon name="share" size={20} color={colors.green} strokeWidth={2} />
          <Text style={styles.photoAddText}>{uploading ? 'Carico…' : 'Aggiungi'}</Text>
        </Pressable>}
      </View>

      <Text style={styles.h}>3. Come preferisci risolvere?</Text>
      <View style={{ gap: 8 }}>
        <OptionCard selected={resolution === 'refund' || !exchangeOk} onPress={() => setResolution('refund')} icon="card" title="Rimborso"
          description={chosen.length ? `Circa ${formatEuro(estimate)} (prezzo pagato, sconti inclusi; la spedizione non è rimborsata)` : 'Il prezzo pagato per gli articoli resi'} />
        {exchangeOk && <OptionCard selected={resolution === 'exchange'} onPress={() => setResolution('exchange')} icon="recycle" title="Cambio con lo stesso prodotto"
          description="Lo ritiri in negozio quando porti l'articolo da cambiare" />}
      </View>
      {(resolution === 'refund' || !exchangeOk) && <>
        <Text style={styles.label}>Ricevi il rimborso</Text>
        <View style={{ gap: 8 }}>
          <OptionCard selected={method === 'card'} onPress={() => setMethod('card')} icon="card" title="Sul metodo di pagamento" description="Accredito in 5–10 giorni lavorativi" />
          <OptionCard selected={method === 'voucher'} onPress={() => setMethod('voucher')} icon="percent" title="Buono CASA & TE" description="Subito dopo la verifica in negozio, da usare online entro 12 mesi" />
        </View>
      </>}
    </>}

    {!!error && <View style={{ marginTop: 14 }}><Notice tone="error" message={error} /></View>}
    <View style={{ marginTop: 20 }}><PrimaryButton title="Invia richiesta" icon="check" loading={busy} disabled={uploading} onPress={submit} /></View>
    <Text style={[styles.fine, { marginTop: 10, textAlign: 'center' }]}>Ti rispondiamo via email. Puoi seguire la richiesta nella pagina dell'ordine.</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, lineHeight: 20, color: colors.muted, fontFamily: fonts.sans, marginBottom: 6 },
  h: { fontSize: 18, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text, marginTop: 22, marginBottom: 10 },
  label: { fontSize: 13.5, fontFamily: fonts.sansBold, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 6 },
  box: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  sep: { borderTopWidth: 1, borderColor: '#EFECE3' },
  itemName: { fontSize: 14, lineHeight: 18, fontFamily: fonts.sansSemiBold, color: colors.text },
  itemMeta: { fontSize: 12, color: colors.muted, fontFamily: fonts.sans, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 38, borderRadius: 19, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line },
  step: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 18, fontFamily: fonts.sansBold, color: colors.text },
  stepValue: { minWidth: 14, textAlign: 'center', fontSize: 15, fontFamily: fonts.heavy, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.text },
  fine: { fontSize: 12, lineHeight: 17, color: colors.muted, fontFamily: fonts.sans, marginTop: 8 },
  note: { minHeight: 90, textAlignVertical: 'top', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    padding: 12, fontSize: 14.5, fontFamily: fonts.sans, color: colors.text },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.photo },
  photoX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  photoAdd: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.green, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoAddText: { fontSize: 12, color: colors.green, fontFamily: fonts.sansBold },
});
