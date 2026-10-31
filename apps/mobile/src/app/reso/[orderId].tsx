// Return / after-sales request for an order, as a short guided flow: one question per screen
// (items → what happened → photos and message → refund or exchange with a summary), then a confirmation
// with the request number and what happens next. The refund shown is an estimate; the server decides the amount.
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import {
  RETURN_GUARANTEE_DAYS, RETURN_REASON_LABELS, RETURN_WINDOW_DAYS, daysSinceHandover, friendlyError, returnableQuantities,
  type RefundMethod, type ReturnReason, type ReturnResolution,
} from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { BrandHeader, HeaderBack } from '@/components/BrandHeader';
import { StepTag } from '@/components/ShopMarks';
import { ProductImage } from '@/components/ProductImage';
import { Icon } from '@/components/Icon';
import { Loading, Notice, OptionCard } from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { createReturnRequest, fetchOrder, fetchOrderReturns, imageUrl, uploadReturnPhoto } from '@/lib/api';
import { formatEuro } from '@/lib/price';
import { invalidate, useQuery } from '@/lib/useQuery';
import { useStores } from '@/lib/hooks';
import { useUser } from '@/store/session';

const MAX_PHOTOS = 5;
const STEPS = ['Articoli', 'Motivo', 'Dettagli', 'Soluzione'] as const;
const euro = (c: number) => formatEuro(c).replace(/€\s/, '€');

/** The reasons, in the order a shopper thinks of them, each with one line that says what it means. */
const REASONS: Array<{ id: ReturnReason; text: string }> = [
  { id: 'damaged', text: 'Rotto, non funziona o arrivato rovinato' },
  { id: 'wrong_item', text: 'Non è il prodotto che avevi ordinato' },
  { id: 'missing', text: 'Manca nel sacchetto o nel pacco' },
  { id: 'changed_mind', text: '' },
  { id: 'other', text: 'Raccontaci tu cosa è successo' },
];

export default function ReturnRequestScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const user = useUser();
  const order = useQuery(orderId && user ? `orders:${orderId}` : null, () => fetchOrder(orderId!));
  const returns = useQuery(orderId && user ? `returns:${orderId}` : null, () => fetchOrderReturns(orderId!));
  const { stores } = useStores();
  const [step, setStep] = useState(0);
  const [forward, setForward] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<Array<{ uri: string; path: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [resolution, setResolution] = useState<ReturnResolution>('refund');
  const [method, setMethod] = useState<RefundMethod>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ number: string } | null>(null);

  const left = useMemo(() => order.data ? returnableQuantities(order.data.order_items, returns.data ?? []) : {}, [order.data, returns.data]);
  const items = order.data ? order.data.order_items.filter((i) => (left[i.id] ?? 0) > 0) : [];
  // A single returnable line is chosen from the start.
  useEffect(() => { if (items.length === 1 && !Object.keys(qty).length) setQty({ [items[0].id]: 1 }); }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Redirect href="/auth/sign-in" />;
  if (!order.data || !returns.data) return <Screen stack><Stack.Screen options={{ title: 'Reso e assistenza' }} /><Loading /></Screen>;
  const o = order.data;
  const days = daysSinceHandover(o);
  const changeOk = days !== null && days <= RETURN_WINDOW_DAYS;
  const daysLeft = Math.max(1, Math.ceil(RETURN_WINDOW_DAYS - (days ?? 0)));
  const store = stores.find((s) => s.id === o.store_id);
  const storeName = store ? store.name.replace(/^CASA & TE\s*/, '').replace(/^(\S+)\s+(?!·)/, '$1 · ') : 'negozio';
  const chosen = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const count = chosen.reduce((n, i) => n + (qty[i.id] ?? 0), 0);
  const value = chosen.reduce((sum, i) => sum + i.unit_price_cents * (qty[i.id] ?? 0), 0);
  // Display only: the server computes the amount after the order discount.
  const estimate = o.subtotal_cents > 0 ? Math.round(value * (1 - o.discount_cents / o.subtotal_cents)) : value;
  const photosNeeded = reason === 'damaged' || reason === 'wrong_item';
  const exchangeOk = reason !== 'missing';
  const refund = resolution === 'refund' || !exchangeOk;
  const toOrder = () => router.replace({ pathname: '/order/[id]', params: { id: o.id } });

  if (days === null || days > RETURN_GUARANTEE_DAYS || (!items.length && !sent)) return <Screen stack>
    <Stack.Screen options={{ title: 'Reso e assistenza' }} />
    <Notice title="Nessun articolo da rendere" message="Per questo ordine non è possibile aprire un nuovo reso. Per assistenza rivolgiti al negozio." />
  </Screen>;

  const go = (to: number) => { setError(''); setForward(to > step); setStep(to); };
  const back = () => step > 0 ? go(step - 1) : router.canGoBack() ? router.back() : toOrder();

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
    if (!chosen.length || !reason) return;
    setBusy(true);
    try {
      const res = await createReturnRequest({ orderId: o.id, items: chosen.map((i) => ({ order_item_id: i.id, quantity: qty[i.id] })),
        reason, note: note.trim(), resolution: refund ? 'refund' : 'exchange', refundMethod: refund ? method : null,
        photos: photos.map((p) => p.path) });
      invalidate(`returns:${o.id}`); invalidate(`orders:${o.id}`);
      setSent({ number: res.return_number });
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  // ---- Sent: the request number and the three things that happen next. ----
  if (sent) {
    const header = <BrandHeader title="Richiesta inviata" subtitle={`Ordine ${o.order_number}`} titleSize={26} pad={[14, 16, 18]}
      left={<HeaderBack icon="close" label="Chiudi" onPress={toOrder} />} />;
    return <Screen stack header={header} ground={colors.page} maxWidth={640} contentContainerStyle={{ paddingTop: 22, paddingBottom: 32 }}
      footer={<Pressable onPress={toOrder} accessibilityRole="button" style={({ pressed }) => [styles.next, pressed && { opacity: 0.88 }]}>
        <Text style={styles.nextText}>Torna all’ordine</Text></Pressable>}>
      <Stack.Screen options={{ headerShown: false, title: 'Richiesta inviata' }} />
      <Animated.View entering={FadeIn.duration(300)} style={styles.done}>
        <View style={styles.doneMark}><Icon name="check" size={34} color={colors.green} strokeWidth={2.6} /></View>
        <Text style={styles.doneTitle} accessibilityRole="header">Ci pensiamo noi</Text>
        <Text style={styles.doneLead}>La tua richiesta è arrivata al negozio.</Text>
        <View style={styles.doneNumber}><Text style={styles.doneNumberLabel}>Numero richiesta</Text><Text selectable style={styles.doneNumberValue}>{sent.number}</Text></View>
      </Animated.View>
      <View style={[styles.plate, { paddingVertical: 6 }]}>
        {[
          ['Il negozio valuta', 'Di solito entro 2 giorni lavorativi.'],
          ['Ti scriviamo via email', 'Con l’esito e, se approvata, il codice da mostrare.'],
          [refund ? 'Porti gli articoli e ricevi il rimborso' : 'Porti gli articoli e ritiri il cambio', `Al negozio ${storeName}, nessuna spedizione.`],
        ].map(([t, d], i) => <View key={t} style={[styles.nextStep, i > 0 && styles.sep]}>
          <StepTag n={i + 1} />
          <View style={{ flex: 1 }}><Text style={styles.nextStepTitle}>{t}</Text><Text style={styles.nextStepText}>{d}</Text></View>
        </View>)}
      </View>
    </Screen>;
  }

  // ---- The flow ----
  const canNext = step === 0 ? count > 0
    : step === 1 ? !!reason
    : step === 2 ? (!photosNeeded || photos.length > 0) && (reason !== 'other' || !!note.trim()) && !uploading
    : true;
  const hint = step === 0 ? (count ? `${count} ${count === 1 ? 'articolo scelto' : 'articoli scelti'}` : 'Scegli almeno un articolo')
    : step === 1 ? (reason ? RETURN_REASON_LABELS[reason] : 'Tocca il motivo')
    : step === 2 ? (photosNeeded && !photos.length ? 'Aggiungi almeno una foto' : reason === 'other' && !note.trim() ? 'Scrivici due righe' : 'Tutto pronto')
    : refund ? `Rimborso stimato ${euro(estimate)}` : 'Cambio con lo stesso prodotto';
  const header = <BrandHeader title="Reso e assistenza" subtitle={`Passo ${step + 1} di ${STEPS.length} · ${STEPS[step]}`} titleSize={26} pad={[14, 16, 16]}
    left={<HeaderBack onPress={back} />}>
    <View style={styles.progress} accessibilityElementsHidden>{STEPS.map((s, i) => <View key={s} style={[styles.progressBar, i <= step && styles.progressOn]} />)}</View>
  </BrandHeader>;
  const footer = <View style={styles.footer}>
    <Text style={styles.footerHint} numberOfLines={1}>{hint}</Text>
    <Pressable onPress={() => step < 3 ? go(step + 1) : submit()} disabled={!canNext || busy} accessibilityRole="button"
      style={({ pressed }) => [styles.next, (!canNext || busy) && styles.nextOff, pressed && { opacity: 0.88 }]}>
      <Text style={styles.nextText}>{step < 3 ? 'Continua' : busy ? 'Invio…' : 'Invia richiesta'}</Text>
      {step < 3 && <Icon name="arrow" size={18} color="#FFFFFF" strokeWidth={2.4} />}
    </Pressable>
  </View>;
  const enter = (forward ? FadeInRight : FadeInLeft).duration(240);

  return <Screen stack header={header} footer={footer} ground={colors.page} maxWidth={640} contentContainerStyle={{ paddingTop: 22, paddingBottom: 32 }}>
    <Stack.Screen options={{ headerShown: false, title: 'Reso e assistenza' }} />
    <Animated.View key={step} entering={enter}>

      {step === 0 && <>
        <Text style={styles.q} accessibilityRole="header">Cosa vuoi rendere?</Text>
        <Text style={styles.sub}>Non serve spedire nulla: dopo l’approvazione li riporti al negozio {storeName}.</Text>
        <View style={styles.grid}>{items.map((i) => {
          const q = qty[i.id] ?? 0; const max = left[i.id] ?? 0; const on = q > 0;
          const set = (v: number) => setQty((s) => ({ ...s, [i.id]: Math.max(0, Math.min(max, v)) }));
          // One line only: a wide card (photo beside the name) instead of half a grid.
          const single = items.length === 1;
          return <View key={i.id} style={[styles.cell, single && { width: '100%' }]}>
            <Pressable onPress={() => set(on ? 0 : 1)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${i.name}, ${euro(i.unit_price_cents)}`}
              style={({ pressed }) => [styles.item, single && styles.itemWide, on && styles.itemOn, pressed && { opacity: 0.9 }]}>
              <View style={[styles.itemPhoto, single && styles.itemPhotoWide]}><ProductImage uri={imageUrl(i.image_path)} sku={i.sku} label={i.name} inset={0.1} /></View>
              <View style={[styles.tick, on && styles.tickOn]}>{on && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}</View>
              <View style={single && { flex: 1 }}>
                <Text style={[styles.itemName, single && { marginTop: 0, minHeight: 0 }]} numberOfLines={2}>{i.name}</Text>
                <Text style={styles.itemPrice}>{euro(i.unit_price_cents)}</Text>
              </View>
            </Pressable>
            {on && max > 1 && <View style={styles.qty}>
              <Pressable onPress={() => set(q - 1)} accessibilityRole="button" accessibilityLabel={`Togli un ${i.name}`} style={styles.qtyBtn}><Text style={styles.qtyGlyph}>−</Text></Pressable>
              <Text style={styles.qtyValue} accessibilityLabel={`Da rendere: ${q} di ${max}`}>{q} di {max}</Text>
              <Pressable onPress={() => set(q + 1)} disabled={q >= max} accessibilityRole="button" accessibilityLabel={`Aggiungi un ${i.name}`} style={[styles.qtyBtn, q >= max && { opacity: 0.3 }]}><Text style={styles.qtyGlyph}>+</Text></Pressable>
            </View>}
          </View>;
        })}</View>
      </>}

      {step === 1 && <>
        <Text style={styles.q} accessibilityRole="header">Cosa è successo?</Text>
        <Text style={styles.sub} numberOfLines={2}>{count === 1 ? chosen[0].name : `${count} articoli`}</Text>
        <View style={{ gap: 10 }} accessibilityRole="radiogroup">{REASONS.map((r) => {
          const disabled = r.id === 'changed_mind' && !changeOk;
          const on = reason === r.id;
          const text = r.id === 'changed_mind'
            ? (changeOk ? `Hai ancora ${daysLeft} ${daysLeft === 1 ? 'giorno' : 'giorni'}. Non per cosmetici e igiene aperti.` : `Possibile entro ${RETURN_WINDOW_DAYS} giorni dal ritiro.`)
            : r.text;
          // Choosing a reason is the whole step: it moves on by itself.
          return <Pressable key={r.id} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }}
            onPress={() => { setReason(r.id); if (r.id === 'missing') setResolution('refund'); go(2); }}
            style={({ pressed }) => [styles.reason, on && styles.reasonOn, disabled && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reasonTitle}>{RETURN_REASON_LABELS[r.id]}</Text>
              <Text style={styles.reasonText}>{text}</Text>
            </View>
            <Icon name="chevron" size={18} color={on ? colors.green : '#9A9F94'} strokeWidth={2.2} />
          </Pressable>;
        })}</View>
      </>}

      {step === 2 && <>
        <Text style={styles.q} accessibilityRole="header">{photosNeeded ? 'Mostraci il problema' : reason === 'other' ? 'Raccontaci cosa è successo' : 'Vuoi dirci qualcosa?'}</Text>
        <Text style={styles.sub}>{photosNeeded ? 'Una foto del prodotto e, se c’è, della confezione: così il negozio decide subito.'
          : reason === 'other' ? 'Due righe bastano. Puoi aggiungere anche una foto.' : 'Facoltativo: puoi andare avanti.'}</Text>
        <View style={styles.photos}>
          {photos.map((p) => <View key={p.path} style={styles.photo}>
            <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
            <Pressable onPress={() => setPhotos((s) => s.filter((x) => x.path !== p.path))} accessibilityRole="button" accessibilityLabel="Togli foto" hitSlop={6} style={styles.photoX}>
              <Icon name="close" size={12} color="#FFFFFF" strokeWidth={3} /></Pressable>
          </View>)}
          {photos.length < MAX_PHOTOS && <Pressable onPress={pick} disabled={uploading} accessibilityRole="button" accessibilityLabel="Aggiungi foto"
            style={({ pressed }) => [styles.photo, styles.photoAdd, photosNeeded && !photos.length && styles.photoAddNeeded, pressed && { opacity: 0.7 }]}>
            <Icon name="plus" size={24} color={colors.green} strokeWidth={2.2} />
            <Text style={styles.photoAddText}>{uploading ? 'Carico…' : photos.length ? 'Altra foto' : 'Aggiungi foto'}</Text>
          </Pressable>}
        </View>
        <Text style={styles.label}>Messaggio per il negozio{reason === 'other' ? '' : ' (facoltativo)'}</Text>
        <TextInput value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Es. la confezione era aperta, il colore non è quello ordinato…"
          placeholderTextColor={colors.faint} accessibilityLabel="Messaggio per il negozio" style={styles.note} />
      </>}

      {step === 3 && <>
        <Text style={styles.q} accessibilityRole="header">Come preferisci?</Text>
        <Text style={styles.sub}>{exchangeOk ? 'Rimborso o lo stesso prodotto nuovo, al negozio.' : 'Per un articolo mancante ti rimborsiamo.'}</Text>
        <View style={{ gap: 10 }}>
          <OptionCard selected={refund} onPress={() => setResolution('refund')} title="Rimborso" description="Il prezzo pagato, sconti inclusi" right={euro(estimate)} />
          {exchangeOk && <OptionCard selected={!refund} onPress={() => setResolution('exchange')} title="Cambio" description="Lo stesso prodotto, da ritirare quando porti il tuo" />}
        </View>
        {refund && <>
          <Text style={styles.label}>Dove ricevi il rimborso</Text>
          <View style={{ gap: 10 }}>
            <OptionCard selected={method === 'card'} onPress={() => setMethod('card')} title="Sulla carta usata" description="In 5–10 giorni lavorativi" />
            <OptionCard selected={method === 'voucher'} onPress={() => setMethod('voucher')} title="Buono CASA & TE" description="Subito dopo la verifica, valido 12 mesi online" />
          </View>
        </>}

        <Text style={styles.label}>Riepilogo</Text>
        <View style={[styles.plate, styles.summary]}>
          {chosen.map((i) => <View key={i.id} style={styles.sumItem}>
            <View style={styles.sumThumb}><ProductImage uri={imageUrl(i.image_path)} sku={i.sku} label={i.name} inset={0} /></View>
            <Text style={styles.sumName} numberOfLines={1}>{qty[i.id]} × {i.name}</Text>
          </View>)}
          <View style={styles.sumRule} />
          {([
            ['Motivo', reason ? RETURN_REASON_LABELS[reason] : '', 1],
            ['Foto', photos.length ? `${photos.length}` : 'Nessuna', 2],
            ['Riporti a', storeName, 0],
          ] as const).map(([k, v, to]) => <Pressable key={k} onPress={() => { if (to) go(to); }} disabled={!to} accessibilityRole={to ? 'button' : undefined}
            accessibilityLabel={to ? `${k}: ${v}. Modifica` : undefined} style={styles.sumRow}>
            <Text style={styles.sumKey}>{k}</Text>
            <Text style={styles.sumValue} numberOfLines={1}>{v}</Text>
            {!!to && <Text style={styles.sumEdit}>Modifica</Text>}
          </Pressable>)}
          {refund && <View style={[styles.sumRow, styles.sumTotal]}>
            <Text style={styles.sumTotalKey}>Rimborso stimato</Text><Text style={styles.sumTotalValue}>{euro(estimate)}</Text>
          </View>}
        </View>
        <Text style={styles.fine}>L’importo finale lo conferma il negozio. La spedizione non è rimborsata.</Text>
      </>}

      {!!error && <View style={{ marginTop: 16 }}><Notice tone="error" message={error} /></View>}
    </Animated.View>
  </Screen>;
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 5, marginTop: 14 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  progressOn: { backgroundColor: colors.yellow },
  q: { fontSize: 30, lineHeight: 35, fontFamily: fonts.display, color: colors.text },
  sub: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.sans, color: colors.muted, marginTop: 6, marginBottom: 18 },
  label: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.text, marginTop: 22, marginBottom: 8 },
  fine: { fontSize: 12.5, lineHeight: 17, color: colors.muted, fontFamily: fonts.sans, marginTop: 10, textAlign: 'center' },
  plate: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 },
  sep: { borderTopWidth: 1, borderColor: '#EFECE3' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: { width: '48.5%', gap: 8 },
  item: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 10, paddingBottom: 12 },
  itemWide: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  itemPhotoWide: { width: 104 },
  itemOn: { borderColor: colors.green, borderWidth: 2, padding: 9, paddingBottom: 11 },
  itemPhoto: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.photo },
  tick: { position: 'absolute', top: 16, left: 16, width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#B9B4A6', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.green, borderColor: colors.green },
  itemName: { fontSize: 13.5, lineHeight: 17, fontFamily: fonts.sansSemiBold, color: colors.text, marginTop: 8, minHeight: 34 },
  itemPrice: { fontSize: 14, fontFamily: fonts.heavy, color: colors.text, marginTop: 4 },
  qty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40, borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: colors.line },
  qtyBtn: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  qtyGlyph: { fontSize: 19, fontFamily: fonts.sansBold, color: colors.text },
  qtyValue: { fontSize: 14, fontFamily: fonts.sansBold, color: colors.text },

  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: colors.line },
  reasonOn: { borderColor: colors.green, borderWidth: 2, paddingVertical: 15, paddingHorizontal: 15 },
  reasonTitle: { fontSize: 16, fontFamily: fonts.sansBold, color: colors.text },
  reasonText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },

  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: '31%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.photo },
  photoX: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  photoAdd: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9B4A6', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoAddNeeded: { borderColor: colors.green },
  photoAddText: { fontSize: 12.5, color: colors.green, fontFamily: fonts.sansBold },
  note: { minHeight: 110, textAlignVertical: 'top', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: colors.line,
    padding: 14, fontSize: 15, lineHeight: 21, fontFamily: fonts.sans, color: colors.text },

  summary: { paddingVertical: 12 },
  sumItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  sumThumb: { width: 36, height: 36 },
  sumName: { flex: 1, fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.text },
  sumRule: { height: 1, backgroundColor: '#EFECE3', marginVertical: 8 },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 },
  sumKey: { width: 82, fontSize: 13.5, fontFamily: fonts.sans, color: colors.muted },
  sumValue: { flex: 1, fontSize: 14, fontFamily: fonts.sansSemiBold, color: colors.text },
  sumEdit: { fontSize: 13, fontFamily: fonts.sansBold, color: colors.green, textDecorationLine: 'underline' },
  sumTotal: { borderTopWidth: 1, borderColor: '#EFECE3', marginTop: 6, paddingTop: 10 },
  sumTotalKey: { flex: 1, fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  sumTotalValue: { fontSize: 20, fontFamily: fonts.heavy, color: colors.text },

  footer: { gap: 10 },
  footerHint: { fontSize: 13, fontFamily: fonts.sansSemiBold, color: colors.muted, textAlign: 'center' },
  next: { height: 54, borderRadius: 27, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  nextOff: { opacity: 0.4 },
  nextText: { fontSize: 16.5, fontFamily: fonts.sansBold, color: '#FFFFFF' },

  done: { alignItems: 'center', paddingTop: 8, paddingBottom: 22 },
  doneMark: { width: 72, height: 72, borderRadius: 36, borderWidth: 2.5, borderColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 32, lineHeight: 37, fontFamily: fonts.display, color: colors.text, marginTop: 16 },
  doneLead: { fontSize: 15, fontFamily: fonts.sans, color: colors.muted, marginTop: 4 },
  doneNumber: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  doneNumberLabel: { fontSize: 12, fontFamily: fonts.sansBold, color: colors.muted },
  doneNumberValue: { fontSize: 20, letterSpacing: 1, fontFamily: fonts.heavy, color: colors.text, marginTop: 2 },
  nextStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  nextStepTitle: { fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  nextStepText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 1 },
});
