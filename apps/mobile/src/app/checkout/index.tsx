import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  FULFILMENT_LABELS, formatEuro, formatShipping, formatWeight, friendlyError, isPhone, validateAddress, validateInvoice,
  type Address, type AddressRow, type CreateOrderInput, type FulfilmentMethod, type InvoiceDetails, type PickupPointRow,
} from '@casa-te/shared';
import { Screen } from '@/components/Screen';
import { StoreSelector } from '@/components/StoreSelector';
import type { IconName } from '@/components/Icon';
import {
  Checkbox, EmptyState, Loading, Notice, OptionCard, PrimaryButton, SecondaryButton, SectionTitle, SummaryRow, TextField,
} from '@/components/UI';
import { colors } from '@/config/theme';
import { fetchAddresses, fetchPickupPoints, fetchProfile, saveAddress, startCheckout, updateProfile } from '@/lib/api';
import { useCartQuote } from '@/lib/hooks';
import { usePreferences } from '@/store/preferences';
import { openCheckout } from '@/lib/payments';
import { useQuery } from '@/lib/useQuery';
import { useUser } from '@/store/session';

const METHODS: Array<{ id: FulfilmentMethod; description: string; icon: IconName }> = [
  { id: 'home', description: 'Consegna con corriere in 2–4 giorni lavorativi', icon: 'truck' },
  { id: 'pickup', description: 'Ritira in un punto convenzionato, quando preferisci', icon: 'box' },
  { id: 'store', description: 'Pronto in negozio, nessun costo in più', icon: 'store' },
];

const emptyAddress: Address = { fullName: '', line1: '', line2: '', city: '', province: '', postalCode: '', phone: '' };
const fromRow = (a: AddressRow): Address => ({ fullName: a.full_name, line1: a.line1, line2: a.line2 ?? '', city: a.city,
  province: a.province, postalCode: a.postal_code, phone: a.phone });

export default function CheckoutScreen() {
  const user = useUser();
  const preferred = usePreferences((s) => s.fulfilment);
  const savePreferred = usePreferences((s) => s.setFulfilment);
  const [method, setMethodState] = useState<FulfilmentMethod>(preferred);
  const setMethod = (m: FulfilmentMethod) => { setMethodState(m); savePreferred(m); };
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponOpen, setCouponOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const { quote, loading: quoting, error: quoteError, store, empty } = useCartQuote({ fulfilment: method, couponCode: coupon });

  const profile = useQuery(user ? `profile:${user.id}` : null, () => fetchProfile(user!.id));
  const addresses = useQuery<AddressRow[]>(user ? `addresses:${user.id}` : null, fetchAddresses);
  const pickupPoints = useQuery<PickupPointRow[]>('pickup-points', fetchPickupPoints);

  const [addressId, setAddressId] = useState<string | 'new'>('new');
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [saveToBook, setSaveToBook] = useState(true);
  const [pickupPointId, setPickupPointId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [invoice, setInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceDetails>({});
  const [notes, setNotes] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  // Prefill from profile / default address once loaded.
  useEffect(() => {
    if (profile.data) {
      setFullName((v) => v || profile.data?.full_name || '');
      setPhone((v) => v || profile.data?.phone || '');
    }
  }, [profile.data]);
  useEffect(() => {
    const list = addresses.data ?? [];
    if (list.length && addressId === 'new' && address === emptyAddress) {
      const def = list.find((a) => a.is_default) ?? list[0];
      setAddressId(def.id); setAddress(fromRow(def));
    }
  }, [addresses.data]); // eslint-disable-line react-hooks/exhaustive-deps


  if (!user) return <Screen stack><EmptyState icon="user" title="Accedi per completare l'ordine"
    message="Ti invieremo un codice via email: nessuna password da ricordare.">
    <PrimaryButton title="Accedi o registrati" onPress={() => router.push({ pathname: '/auth/sign-in', params: { next: '/checkout' } })} />
  </EmptyState></Screen>;
  if (empty) return <Screen stack><EmptyState title="Il carrello è vuoto" message="Aggiungi qualche prodotto per procedere.">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.replace('/catalog')} /></EmptyState></Screen>;
  if (!quote) return <Screen stack>{quoteError ? <Notice tone="error" message={friendlyError(quoteError)} /> : <Loading />}</Screen>;

  const methodQuote = quote.shipping[method];
  const total = quote.total_cents;

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (quote.issue_count > 0) e.cart = 'cart';
    if (!methodQuote) e.method = 'Metodo non disponibile';
    if (method === 'home') {
      const ae = validateAddress(address);
      for (const [k, v] of Object.entries(ae)) e[`address.${k}`] = v as string;
    } else {
      if (fullName.trim().length < 2) e.fullName = 'Inserisci nome e cognome';
      if (!isPhone(phone)) e.phone = 'Numero di telefono non valido';
    }
    if (method === 'pickup' && !pickupPointId) e.pickup = 'Seleziona un punto di ritiro';
    if (invoice) for (const [k, v] of Object.entries(validateInvoice(invoiceData))) e[`invoice.${k}`] = v as string;
    if (!accepted) e.accepted = 'Devi accettare le condizioni di vendita';
    return e;
  };
  // After the first "Paga", errors update as the customer fixes each field.
  const liveErrors = attempted ? validate() : errors;

  /** Web: bring the first problem into view and focus it, instead of a message far from the field. */
  const revealFirstError = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-invalid="true"], [data-field-error="true"]');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') el.focus({ preventScroll: true });
    });
  };

  const pay = async () => {
    if (submitting.current) return;
    setSubmitError('');
    const found = validate();
    setErrors(found); setAttempted(true);
    if (Object.keys(found).length || !store) { revealFirstError(); return; }
    submitting.current = true; setBusy(true);
    try {
      const order: CreateOrderInput = {
        store_id: store.id,
        items: quote.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        fulfilment: method,
        coupon_code: coupon || undefined,
        notes: notes.trim() || undefined,
        ...(method === 'home'
          ? { address: { full_name: address.fullName, line1: address.line1, line2: address.line2, city: address.city,
              province: address.province.toUpperCase(), postal_code: address.postalCode, phone: address.phone } }
          : { full_name: fullName.trim(), phone: phone.trim() }),
        ...(method === 'pickup' ? { pickup_point_id: pickupPointId! } : {}),
        ...(invoice ? { invoice_requested: true, invoice: { company_name: invoiceData.companyName, tax_code: invoiceData.taxCode,
          vat_number: invoiceData.vatNumber, sdi_code: invoiceData.sdiCode, pec: invoiceData.pec } } : {}),
      };
      // Keep the profile and address book up to date (best effort, never blocks payment).
      const name = method === 'home' ? address.fullName : fullName;
      const tel = method === 'home' ? address.phone : phone;
      if (profile.data && (!profile.data.full_name || !profile.data.phone)) {
        updateProfile(user.id, { full_name: profile.data.full_name || name.trim(), phone: profile.data.phone || tel.trim() }).catch(() => {});
      }
      if (method === 'home' && addressId === 'new' && saveToBook) {
        saveAddress(user.id, { full_name: address.fullName, line1: address.line1, line2: address.line2, city: address.city,
          province: address.province, postal_code: address.postalCode, phone: address.phone, is_default: !(addresses.data?.length) }).catch(() => {});
      }
      const res = await startCheckout(order);
      await openCheckout(res);
    } catch (e) {
      setSubmitError(friendlyError(e));
    } finally {
      submitting.current = false; setBusy(false);
    }
  };

  const setAddr = (patch: Partial<Address>) => { setAddress((a) => ({ ...a, ...patch })); if (addressId !== 'new') setAddressId('new'); };
  const err = (k: string) => liveErrors[k];
  const fieldError = (k: string) => err(k) ? <Text style={styles.error} {...({ dataSet: { fieldError: 'true' } } as object)} accessibilityRole="alert">{err(k)}</Text> : null;

  const pending = attempted ? Object.keys(liveErrors).filter((k) => k !== 'cart').length : 0;
  return <Screen stack maxWidth={720} footer={<View style={{ gap: 8 }}>
    {pending > 0 ? <Pressable onPress={revealFirstError} accessibilityRole="button">
      <Text style={styles.footerError} accessibilityRole="alert">{pending === 1 ? 'Manca un dato' : `Mancano ${pending} dati`} · <Text style={{ textDecorationLine: 'underline' }}>mostra</Text></Text></Pressable>
      : !!submitError && <Text style={styles.footerError} accessibilityRole="alert">{submitError}</Text>}
    <Text style={styles.secure}>Pagamento sicuro con Stripe · IVA inclusa · recesso entro 14 giorni</Text>
    <PrimaryButton title={total !== null ? `Paga ${formatEuro(total)}` : 'Scegli la consegna'} icon="card"
      loading={busy} disabled={quoting || total === null || quote.issue_count > 0} onPress={pay} />
  </View>}>
    {quote.issue_count > 0 && <Notice tone="error" title="Alcuni articoli non sono disponibili"
      message="Torna al carrello per aggiornare le quantità.">
      <Pressable onPress={() => router.back()}><Text style={{ color: colors.green, fontWeight: '600' }}>Torna al carrello</Text></Pressable>
    </Notice>}

    <SectionTitle>Come vuoi ricevere l'ordine?</SectionTitle>
    {METHODS.map((m) => {
      const q = quote.shipping[m.id];
      return <OptionCard key={m.id} selected={method === m.id} onPress={() => setMethod(m.id)} icon={m.icon} disabled={!q}
        title={FULFILMENT_LABELS[m.id]} description={q ? (q.provisional ? `${m.description} · tariffa oltre 10 kg` : m.description) : 'Non disponibile per questo ordine'}
        right={q ? formatShipping(q.price_cents) : undefined} />;
    })}

    <StoreSelector title={method === 'store' ? 'Negozio di ritiro' : 'Negozio che prepara il tuo ordine'} filter={method === 'store' ? 'pickup' : 'ships'} />

    {method === 'home' && <>
      <SectionTitle>Indirizzo di consegna</SectionTitle>
      {(addresses.data ?? []).map((a) => <OptionCard key={a.id} selected={addressId === a.id}
        onPress={() => { setAddressId(a.id); setAddress(fromRow(a)); }}
        title={a.label || a.full_name} description={`${a.line1}${a.line2 ? `, ${a.line2}` : ''} · ${a.postal_code} ${a.city} (${a.province})`} />)}
      {!!addresses.data?.length && <OptionCard selected={addressId === 'new'} onPress={() => { setAddressId('new'); setAddress(emptyAddress); }}
        icon="plus" title="Nuovo indirizzo" />}
      {addressId === 'new' && <View style={{ marginTop: 8 }}>
        <TextField label="Nome e cognome" value={address.fullName} onChangeText={(v) => setAddr({ fullName: v })} autoComplete="name" error={err('address.fullName')} />
        <TextField label="Via e numero civico" value={address.line1} onChangeText={(v) => setAddr({ line1: v })} autoComplete="street-address" error={err('address.line1')} />
        <TextField label="Scala, interno, presso (facoltativo)" value={address.line2} onChangeText={(v) => setAddr({ line2: v })} />
        <View style={styles.row}>
          <View style={{ flex: 2 }}><TextField label="Città" value={address.city} onChangeText={(v) => setAddr({ city: v })} error={err('address.city')} /></View>
          <View style={{ flex: 1 }}><TextField label="Prov." value={address.province} maxLength={2} autoCapitalize="characters"
            onChangeText={(v) => setAddr({ province: v.toUpperCase() })} error={err('address.province')} /></View>
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}><TextField label="CAP" value={address.postalCode} keyboardType="number-pad" maxLength={5}
            onChangeText={(v) => setAddr({ postalCode: v.replace(/\D/g, '') })} autoComplete="postal-code" error={err('address.postalCode')} /></View>
          <View style={{ flex: 1.4 }}><TextField label="Telefono" value={address.phone} keyboardType="phone-pad"
            onChangeText={(v) => setAddr({ phone: v })} autoComplete="tel" error={err('address.phone')} hint="Per il corriere" /></View>
        </View>
        <Checkbox checked={saveToBook} onChange={setSaveToBook}><Text style={styles.checkText}>Salva nella rubrica indirizzi</Text></Checkbox>
      </View>}
    </>}

    {method === 'pickup' && <>
      <SectionTitle>Punto di ritiro</SectionTitle>
      {fieldError('pickup')}
      {(pickupPoints.data ?? []).map((p) => <OptionCard key={p.id} selected={pickupPointId === p.id} onPress={() => setPickupPointId(p.id)}
        icon="pin" title={p.name} description={`${p.address}, ${p.postal_code} ${p.city}${p.opening_hours ? ` · ${p.opening_hours}` : ''}`} />)}
    </>}

    {method !== 'home' && <>
      <SectionTitle>Chi ritira</SectionTitle>
      <TextField label="Nome e cognome" value={fullName} onChangeText={setFullName} autoComplete="name" error={err('fullName')} />
      <TextField label="Telefono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={err('phone')}
        hint="Ti avvisiamo quando l'ordine è pronto" />
    </>}

    {coupon && !quote.coupon_error ? <View style={styles.applied}>
      <Text style={styles.appliedText}>Codice <Text style={{ fontWeight: '700' }}>{quote.coupon?.code ?? coupon}</Text> applicato</Text>
      <Pressable onPress={() => { setCoupon(''); setCouponInput(''); }} accessibilityRole="button"><Text style={styles.link}>Rimuovi</Text></Pressable>
    </View> : !couponOpen && !coupon ? <Pressable onPress={() => setCouponOpen(true)} accessibilityRole="button" style={styles.toggle}>
      <Text style={styles.link}>Hai un codice sconto?</Text></Pressable> : <>
      <SectionTitle>Codice sconto</SectionTitle>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1 }}><TextField label="Codice" value={couponInput} autoCapitalize="characters" autoCorrect={false} autoFocus={!coupon}
          onChangeText={(v) => setCouponInput(v.toUpperCase())} onSubmitEditing={() => setCoupon(couponInput.trim())}
          error={coupon && quote.coupon_error ? friendlyError(quote.coupon_error) : undefined} /></View>
        <View style={{ paddingTop: 22 }}><SecondaryButton title="Applica" disabled={!couponInput.trim()} onPress={() => setCoupon(couponInput.trim())} /></View>
      </View>
    </>}

    <SectionTitle>Fattura</SectionTitle>
    <Checkbox checked={invoice} onChange={setInvoice}><Text style={styles.checkText}>Richiedo la fattura</Text></Checkbox>
    {invoice && <View style={{ marginTop: 8 }}>
      <TextField label="Codice fiscale" value={invoiceData.taxCode ?? ''} autoCapitalize="characters" maxLength={16}
        onChangeText={(v) => setInvoiceData({ ...invoiceData, taxCode: v.toUpperCase() })} error={err('invoice.taxCode')} />
      <TextField label="Partita IVA (aziende)" value={invoiceData.vatNumber ?? ''} keyboardType="number-pad" maxLength={13}
        onChangeText={(v) => setInvoiceData({ ...invoiceData, vatNumber: v })} error={err('invoice.vatNumber')} />
      {!!invoiceData.vatNumber && <>
        <TextField label="Ragione sociale" value={invoiceData.companyName ?? ''} onChangeText={(v) => setInvoiceData({ ...invoiceData, companyName: v })} error={err('invoice.companyName')} />
        <TextField label="Codice SDI" value={invoiceData.sdiCode ?? ''} maxLength={7} autoCapitalize="characters"
          onChangeText={(v) => setInvoiceData({ ...invoiceData, sdiCode: v.toUpperCase() })} error={err('invoice.sdiCode')} />
        <TextField label="PEC (in alternativa al codice SDI)" value={invoiceData.pec ?? ''} keyboardType="email-address" autoCapitalize="none"
          onChangeText={(v) => setInvoiceData({ ...invoiceData, pec: v })} />
      </>}
    </View>}

    {notesOpen || notes ? <>
      <SectionTitle>Note per il negozio</SectionTitle>
      <TextField label="Note (facoltative)" value={notes} onChangeText={setNotes} multiline maxLength={500} autoFocus={!notes}
        style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
    </> : <Pressable onPress={() => setNotesOpen(true)} accessibilityRole="button" style={styles.toggle}>
      <Text style={styles.link}>Aggiungi una nota per il negozio</Text></Pressable>}

    <SectionTitle>Riepilogo</SectionTitle>
    <SummaryRow label={`Prodotti (${quote.item_count})`} value={formatEuro(quote.subtotal_cents)} />
    {quote.discount_cents > 0 && <SummaryRow label={`Sconto ${quote.coupon?.code ?? ''}`} value={`-${formatEuro(quote.discount_cents)}`} tone="green" />}
    <SummaryRow label={FULFILMENT_LABELS[method]} value={methodQuote ? formatShipping(methodQuote.price_cents) : '—'} />
    <SummaryRow label="Peso" value={formatWeight(quote.total_weight_g)} />
    <SummaryRow label="Totale (IVA inclusa)" value={total !== null ? formatEuro(total) : '—'} strong />

    <View style={{ marginTop: 16 }}>
      <Checkbox checked={accepted} onChange={setAccepted}>
        <Text style={styles.checkText}>Ho letto e accetto le{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/terms')}>Condizioni di vendita</Text> e l'{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/privacy')}>Informativa privacy</Text>.</Text>
      </Checkbox>
      {fieldError('accepted')}
      <Text style={styles.fine}>Paghi sulla pagina sicura di Stripe con carta o wallet digitale: i dati della carta non passano dai nostri server.
        Hai 14 giorni per il diritto di recesso.</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  checkText: { fontSize: 14, color: colors.text, lineHeight: 21 },
  link: { color: colors.green, textDecorationLine: 'underline', fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
  fine: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  footerError: { color: colors.danger, fontSize: 14, textAlign: 'center', fontWeight: '500' },
  secure: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  toggle: { minHeight: 44, justifyContent: 'center', marginTop: 10 },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E5F2DC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  appliedText: { flex: 1, fontSize: 14, color: colors.greenDark },
});
