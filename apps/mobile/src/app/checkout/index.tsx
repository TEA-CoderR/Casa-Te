import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { FULFILMENT_LABELS, formatWeight, friendlyError, isPhone, validateAddress, validateInvoice, type Address, type AddressRow, type CreateOrderInput, type FulfilmentMethod, type InvoiceDetails, type PickupPointRow } from '@casa-te/shared';
import { formatEuro, formatShipping } from '@/lib/price';
import { Screen } from '@/components/Screen';
import { Icon, type IconName } from '@/components/Icon';
import { FulfilmentSheet } from '@/components/FulfilmentSheet';
import { atPlace, StoreSheet, storeShortName } from '@/components/StoreSheet';
import {
  Checkbox, EmptyState, Loading, Notice, OptionCard, PrimaryButton, SecondaryButton, SectionTitle, SummaryRow, TextField,
} from '@/components/UI';
import { colors, fonts } from '@/config/theme';
import { fetchAddresses, fetchPickupPoints, fetchProfile, imageUrl, saveAddress, startCheckout, updateProfile } from '@/lib/api';
import { ProductImage } from '@/components/ProductImage';
import { useCartQuote, useCompanies, useDelivery, useLayout } from '@/lib/hooks';
import { usePreferences } from '@/store/preferences';
import { openCheckout } from '@/lib/payments';
import { useQuery } from '@/lib/useQuery';
import { useUser } from '@/store/session';
import { ALL_PRODUCTS } from '@/lib/links';

const METHOD_INFO: Record<FulfilmentMethod, { description: string; icon: IconName }> = {
  home: { description: 'Consegna con corriere in 2–4 giorni lavorativi', icon: 'truck' },
  pickup: { description: 'Ritira in un punto convenzionato, quando preferisci', icon: 'pin' },
  store: { description: "Gratuito, quando l'ordine è pronto", icon: 'store' },
};

const emptyAddress: Address = { fullName: '', line1: '', line2: '', city: '', province: '', postalCode: '', phone: '' };
const fromRow = (a: AddressRow): Address => ({ fullName: a.full_name, line1: a.line1, line2: a.line2 ?? '', city: a.city,
  province: a.province, postalCode: a.postal_code, phone: a.phone });

export default function CheckoutScreen() {
  const user = useUser();
  // The delivery method is chosen in the cart; here it is only summarised (and can be changed in the same sheet).
  const method = usePreferences((s) => s.fulfilment);
  const setFulfilment = usePreferences((s) => s.setFulfilment);
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const [summaryOpen, setSummaryOpen] = useState(false);
  useDelivery();
  const [deliverySheet, setDeliverySheet] = useState(false);
  const [storeSheet, setStoreSheet] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponOpen, setCouponOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const { quote, loading: quoting, error: quoteError, store, empty } = useCartQuote({ fulfilment: method, couponCode: coupon });
  const seller = useCompanies().sellerOf(store?.id);

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
    <PrimaryButton title="Vai al catalogo" onPress={() => router.replace(ALL_PRODUCTS)} /></EmptyState></Screen>;
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

  // Phone (design F, F-Checkout): ivory page with its own header, radio cards, grouped white field cards,
  // a folding summary, the terms, and the total with "Paga" in a white sheet.
  if (!wide) {
    const euro = (c: number) => formatEuro(c).replace(/€\s/, '€');
    const methods = (['store', 'home', 'pickup'] as FulfilmentMethod[]).filter((m) => m === method || quote.shipping[m] != null);
    const field = (key: string, label: string, value: string, onChange: (v: string) => void, extra: object = {}, last = false) =>
      <View key={key} style={[styles.fRow, !last && styles.fRule]}>
        <Text style={styles.fLabel}>{label}</Text>
        <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} placeholderTextColor={colors.faint} style={styles.fInput}
          {...({ dataSet: { invalid: err(key) ? 'true' : 'false' } } as object)} {...extra} />
        {!!err(key) && <Text style={styles.fError} accessibilityLiveRegion="polite">{err(key)}</Text>}
      </View>;
    const radio = (on: boolean) => <View style={[styles.radio, on && { borderColor: colors.green }]}>{on && <View style={styles.radioDot} />}</View>;
    const head = <View style={[styles.head, { paddingTop: insets.top + 14 }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Torna al carrello" style={styles.headBack}>
        <Icon name="back" size={22} color={colors.text} strokeWidth={2.2} /></Pressable>
      <Text style={styles.headTitle} accessibilityRole="header">Conferma l’ordine</Text>
    </View>;
    const ready = accepted && !busy && !quoting && total !== null && quote.issue_count === 0;
    return <Screen header={head} ground={colors.page} contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 24 }}
      footer={<View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={styles.payLabel}>{method === 'store' ? 'Totale · ritiro gratuito' : `Totale · ${FULFILMENT_LABELS[method].toLowerCase()}`}</Text>
          <Text style={styles.payTotal}>{total !== null ? euro(total) : '—'}</Text>
        </View>
        {pending > 0 ? <Pressable onPress={revealFirstError} accessibilityRole="button">
          <Text style={styles.footerError} accessibilityRole="alert">{pending === 1 ? 'Manca un dato' : `Mancano ${pending} dati`} · <Text style={{ textDecorationLine: 'underline' }}>mostra</Text></Text></Pressable>
          : !!submitError && <Text style={styles.footerError} accessibilityRole="alert">{submitError}</Text>}
        <Pressable onPress={pay} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: !ready, busy }}
          style={({ pressed }) => [styles.payButton, !accepted && styles.payOff, pressed && accepted && { opacity: 0.88 }]}>
          {busy && <ActivityIndicator color="#FFFFFF" />}
          <Text style={[styles.payText, !accepted && { color: colors.muted }]}>{busy ? 'Pagamento in corso…' : accepted ? (total !== null ? `Paga ${euro(total)} con carta` : 'Scegli la consegna') : 'Accetta i termini per pagare'}</Text>
        </Pressable>
        <View style={styles.secureRow}><Icon name="lock" size={13} color={colors.muted} strokeWidth={2.2} /><Text style={styles.secure}>Pagamento sicuro con Stripe</Text></View>
      </View>}>
      <Stack.Screen options={{ headerShown: false }} />
      <FulfilmentSheet visible={deliverySheet} onClose={() => setDeliverySheet(false)} quote={quote} storeName={storeShortName(store) || 'negozio'}
        onChangeStore={() => setStoreSheet(true)} />
      <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
      {quote.issue_count > 0 && <Notice tone="error" title="Alcuni articoli non sono disponibili" message="Torna al carrello per aggiornare le quantità.">
        <Pressable onPress={() => router.back()}><Text style={{ color: colors.green, fontFamily: fonts.sansBold }}>Torna al carrello</Text></Pressable>
      </Notice>}

      <Text style={[styles.h2, { marginTop: 12 }]}>Come lo ricevi</Text>
      <View style={{ gap: 8 }}>{methods.map((m) => {
        const on = m === method;
        const q = quote.shipping[m];
        return <Pressable key={m} onPress={() => setFulfilment(m)} accessibilityRole="radio" accessibilityState={{ checked: on }}
          style={[styles.option, on ? styles.optionOn : null]}>
          {radio(on)}
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>{m === 'store' ? 'Ritiro in negozio' : FULFILMENT_LABELS[m]}</Text>
            <Text style={styles.optionSub}>{m === 'store' ? [storeShortName(store).replace(/^(\S+)\s+(?!·)/, '$1 · '), store?.opening_hours].filter(Boolean).join(' · ') : METHOD_INFO[m].description}</Text>
          </View>
          <Text style={[styles.optionPrice, q?.price_cents === 0 && { color: colors.green }]}>{q ? formatShipping(q.price_cents).replace(/€\s/, '€') : '—'}</Text>
        </Pressable>;
      })}</View>
      {!methodQuote && <Text style={styles.fError}>Metodo non disponibile per questo ordine: scegline un altro.</Text>}

      {method === 'home' && <>
        <Text style={styles.h2}>Indirizzo di consegna</Text>
        {(addresses.data ?? []).length > 0 && <View style={{ gap: 8, marginBottom: 8 }}>
          {[...(addresses.data ?? []).map((a) => ({ id: a.id, title: a.label || a.full_name, sub: `${a.line1}${a.line2 ? `, ${a.line2}` : ''} · ${a.postal_code} ${a.city} (${a.province})`, row: a })),
            { id: 'new', title: 'Nuovo indirizzo', sub: '', row: null }].map((o) => {
            const on = addressId === o.id;
            return <Pressable key={o.id} onPress={() => { setAddressId(o.id); setAddress(o.row ? fromRow(o.row) : emptyAddress); }} accessibilityRole="radio"
              accessibilityState={{ checked: on }} style={[styles.option, on && styles.optionOn]}>
              {radio(on)}
              <View style={{ flex: 1 }}><Text style={styles.optionTitle}>{o.title}</Text>{!!o.sub && <Text style={styles.optionSub}>{o.sub}</Text>}</View>
            </Pressable>;
          })}
        </View>}
        {addressId === 'new' && <>
          <View style={styles.group}>
            {field('address.fullName', 'Nome e cognome', address.fullName, (v) => setAddr({ fullName: v }), { autoComplete: 'name' })}
            {field('address.line1', 'Via e numero civico', address.line1, (v) => setAddr({ line1: v }), { autoComplete: 'street-address' })}
            {field('address.line2', 'Scala, interno, presso (facoltativo)', address.line2 ?? '', (v) => setAddr({ line2: v }))}
            {field('address.city', 'Città', address.city, (v) => setAddr({ city: v }))}
            {field('address.province', 'Provincia (sigla)', address.province, (v) => setAddr({ province: v.toUpperCase() }), { maxLength: 2, autoCapitalize: 'characters' })}
            {field('address.postalCode', 'CAP', address.postalCode, (v) => setAddr({ postalCode: v.replace(/\D/g, '') }), { keyboardType: 'number-pad', maxLength: 5 })}
            {field('address.phone', 'Telefono per il corriere', address.phone, (v) => setAddr({ phone: v }), { keyboardType: 'phone-pad', autoComplete: 'tel' }, true)}
          </View>
          <Checkbox checked={saveToBook} onChange={setSaveToBook}><Text style={styles.checkText}>Salva nella rubrica indirizzi</Text></Checkbox>
        </>}
      </>}

      {method === 'pickup' && <>
        <Text style={styles.h2}>Punto di ritiro</Text>
        {fieldError('pickup')}
        <View style={{ gap: 8 }}>{(pickupPoints.data ?? []).map((pt) => {
          const on = pickupPointId === pt.id;
          return <Pressable key={pt.id} onPress={() => setPickupPointId(pt.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.option, on && styles.optionOn]}>
            {radio(on)}
            <View style={{ flex: 1 }}><Text style={styles.optionTitle}>{pt.name}</Text>
              <Text style={styles.optionSub}>{`${pt.address}, ${pt.postal_code} ${pt.city}${pt.opening_hours ? ` · ${pt.opening_hours}` : ''}`}</Text></View>
          </Pressable>;
        })}</View>
      </>}

      <Text style={styles.h2}>I tuoi dati</Text>
      <View style={styles.group}>
        {method !== 'home' && field('fullName', 'Nome e cognome', fullName, setFullName, { autoComplete: 'name' })}
        <View style={[styles.fRow, method !== 'home' && styles.fRule]}>
          <Text style={styles.fLabel}>Email per gli avvisi dell’ordine</Text>
          <Text style={[styles.fInput, { paddingTop: 4 }]} numberOfLines={1}>{user.email}</Text>
        </View>
        {method !== 'home' && field('phone', 'Telefono', phone, setPhone, { keyboardType: 'phone-pad', autoComplete: 'tel', placeholder: 'Per contattarti se serve' }, true)}
      </View>

      <View style={[styles.group, { marginTop: 22 }]}>
        <Pressable onPress={() => setSummaryOpen(!summaryOpen)} accessibilityRole="button" accessibilityState={{ expanded: summaryOpen }} style={styles.sumHead}>
          <View style={{ flexDirection: 'row' }}>{quote.lines.slice(0, 3).map((l, i) =>
            <View key={l.product_id} style={[styles.sumThumb, i > 0 && { marginLeft: -10 }]}><ProductImage uri={imageUrl(l.image_path)} sku={l.sku} inset={0.04} /></View>)}</View>
          <Text style={styles.sumTitle}>{quote.item_count === 1 ? '1 articolo' : `${quote.item_count} articoli`}</Text>
          <View style={{ transform: [{ rotate: summaryOpen ? '180deg' : '0deg' }] }}><Icon name="down" size={18} color={colors.text} strokeWidth={2.2} /></View>
        </Pressable>
        {summaryOpen && <View style={styles.sumBody}>
          {quote.lines.map((l) => <View key={l.product_id} style={styles.sumLine}>
            <Text style={styles.sumText} numberOfLines={1}>{l.quantity > 1 ? `${l.quantity} × ` : ''}{l.name}</Text><Text style={styles.sumText}>{euro(l.line_total_cents)}</Text></View>)}
          {quote.discount_cents > 0 && <View style={styles.sumLine}><Text style={styles.sumText}>Sconto {quote.coupon?.code ?? ''}</Text><Text style={[styles.sumText, { color: colors.green }]}>-{euro(quote.discount_cents)}</Text></View>}
          <View style={styles.sumLine}><Text style={styles.sumText}>{FULFILMENT_LABELS[method]}</Text><Text style={styles.sumText}>{methodQuote ? formatShipping(methodQuote.price_cents).replace(/€\s/, '€') : '—'}</Text></View>
          <View style={styles.sumLine}><Text style={styles.sumText}>Peso</Text><Text style={styles.sumText}>{formatWeight(quote.total_weight_g)}</Text></View>
        </View>}
      </View>

      <View style={[styles.group, { marginTop: 10 }]}>
        {coupon && !quote.coupon_error ? <View style={[styles.sumHead, { justifyContent: 'space-between' }]}>
          <Text style={styles.sumTitle}>Codice {quote.coupon?.code ?? coupon} applicato</Text>
          <Pressable onPress={() => { setCoupon(''); setCouponInput(''); }} accessibilityRole="button"><Text style={styles.linkPhone}>Rimuovi</Text></Pressable>
        </View> : !couponOpen ? <Pressable onPress={() => setCouponOpen(true)} accessibilityRole="button" style={styles.sumHead}>
          <Icon name="percent" size={18} color={colors.green} strokeWidth={2} /><Text style={styles.sumTitle}>Hai un codice sconto?</Text><Icon name="chevron" size={17} color="#9A9F94" strokeWidth={2.2} />
        </Pressable> : <View style={[styles.fRow, { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }]}>
          <View style={{ flex: 1 }}><Text style={styles.fLabel}>Codice sconto</Text>
            <TextInput value={couponInput} autoCapitalize="characters" autoCorrect={false} autoFocus onChangeText={(v) => setCouponInput(v.toUpperCase())}
              onSubmitEditing={() => setCoupon(couponInput.trim())} style={styles.fInput} accessibilityLabel="Codice sconto" />
            {!!coupon && !!quote.coupon_error && <Text style={styles.fError}>{friendlyError(quote.coupon_error)}</Text>}</View>
          <Pressable onPress={() => setCoupon(couponInput.trim())} disabled={!couponInput.trim()} accessibilityRole="button" style={styles.apply}><Text style={styles.applyText}>Applica</Text></Pressable>
        </View>}
        <View style={styles.fRule} />
        {notesOpen || notes ? <View style={styles.fRow}><Text style={styles.fLabel}>Note per il negozio (facoltative)</Text>
          <TextInput value={notes} onChangeText={setNotes} multiline maxLength={500} autoFocus={!notes} style={[styles.fInput, { minHeight: 60, textAlignVertical: 'top' }]} accessibilityLabel="Note per il negozio" /></View>
          : <Pressable onPress={() => setNotesOpen(true)} accessibilityRole="button" style={styles.sumHead}>
            <Icon name="list" size={18} color={colors.green} strokeWidth={2} /><Text style={styles.sumTitle}>Aggiungi una nota per il negozio</Text><Icon name="chevron" size={17} color="#9A9F94" strokeWidth={2.2} />
          </Pressable>}
        <View style={styles.fRule} />
        <Pressable onPress={() => setInvoice(!invoice)} accessibilityRole="checkbox" accessibilityState={{ checked: invoice }} style={styles.sumHead}>
          <Icon name="card" size={18} color={colors.green} strokeWidth={2} /><Text style={styles.sumTitle}>Richiedo la fattura</Text>
          <View style={[styles.box, invoice && styles.boxOn]}>{invoice && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}</View>
        </Pressable>
        {invoice && <View style={{ borderTopWidth: 1, borderColor: '#EFECE3' }}>
          {field('invoice.taxCode', 'Codice fiscale', invoiceData.taxCode ?? '', (v) => setInvoiceData({ ...invoiceData, taxCode: v.toUpperCase() }), { autoCapitalize: 'characters', maxLength: 16 })}
          {field('invoice.vatNumber', 'Partita IVA (aziende)', invoiceData.vatNumber ?? '', (v) => setInvoiceData({ ...invoiceData, vatNumber: v }), { keyboardType: 'number-pad', maxLength: 13 }, !invoiceData.vatNumber)}
          {!!invoiceData.vatNumber && <>
            {field('invoice.companyName', 'Ragione sociale', invoiceData.companyName ?? '', (v) => setInvoiceData({ ...invoiceData, companyName: v }))}
            {field('invoice.sdiCode', 'Codice SDI', invoiceData.sdiCode ?? '', (v) => setInvoiceData({ ...invoiceData, sdiCode: v.toUpperCase() }), { maxLength: 7, autoCapitalize: 'characters' })}
            {field('invoice.pec', 'PEC (in alternativa al codice SDI)', invoiceData.pec ?? '', (v) => setInvoiceData({ ...invoiceData, pec: v }), { keyboardType: 'email-address', autoCapitalize: 'none' }, true)}
          </>}
        </View>}
      </View>

      <Pressable onPress={() => setAccepted(!accepted)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} style={styles.terms}>
        <View style={[styles.box, accepted && styles.boxOn]}>{accepted && <Icon name="check" size={15} color="#FFFFFF" strokeWidth={3} />}</View>
        <Text style={styles.termsText}>Ho letto e accetto le <Text style={styles.linkPhone} onPress={() => router.push('/legal/terms')}>Condizioni di vendita</Text> e l’<Text style={styles.linkPhone} onPress={() => router.push('/legal/privacy')}>Informativa privacy</Text></Text>
      </Pressable>
      {fieldError('accepted')}
      {!!seller && <Text style={styles.finePhone}>Venditore: {seller.legal_name} · P.IVA {seller.vat_number}. Paghi sulla pagina sicura di Stripe: i dati della carta non passano dai nostri server. Recesso entro 14 giorni.</Text>}
    </Screen>;
  }

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

    <FulfilmentSheet visible={deliverySheet} onClose={() => setDeliverySheet(false)} quote={quote} storeName={storeShortName(store) || 'negozio'}
      onChangeStore={() => setStoreSheet(true)} />
    <StoreSheet visible={storeSheet} onClose={() => setStoreSheet(false)} />
    <SectionTitle>Consegna</SectionTitle>
    <View style={[styles.delivery, !methodQuote && styles.deliveryError]} {...(!methodQuote ? ({ dataSet: { fieldError: 'true' } } as object) : {})}>
      <View style={styles.deliveryIcon}><Icon name={METHOD_INFO[method].icon} size={22} color={colors.green} strokeWidth={1.9} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.deliveryTitle}>{method === 'store' ? storeShortName(store) ? `Ritiro ${atPlace(storeShortName(store))}` : 'Ritiro in negozio' : FULFILMENT_LABELS[method]}</Text>
        <Text style={[styles.deliveryText, !methodQuote && { color: colors.danger }]}>{!methodQuote ? 'Non disponibile per questo ordine: scegline un altro'
          : method === 'store' ? METHOD_INFO.store.description
          : `${formatShipping(methodQuote.price_cents)} · ${methodQuote.provisional ? 'tariffa oltre 10 kg' : METHOD_INFO[method].description}`}</Text>
        {method !== 'store' && !!store && <Text style={styles.deliveryText}>Preparato da {store.name}</Text>}
      </View>
      <Pressable onPress={() => setDeliverySheet(true)} accessibilityRole="button" accessibilityLabel="Modifica consegna" hitSlop={8}>
        <Text style={styles.modify}>Modifica</Text></Pressable>
    </View>

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

    {!!seller && <Text style={styles.fine} accessibilityLabel={`Venditore: ${seller.legal_name}, partita IVA ${seller.vat_number}`}>
      Venditore: {seller.legal_name} · P.IVA {seller.vat_number}</Text>}
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6, backgroundColor: colors.page },
  headBack: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontSize: 28, lineHeight: 33, fontFamily: fonts.display, color: colors.text },
  h2: { fontSize: 15.5, fontFamily: fonts.heavy, color: colors.text, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  optionOn: { borderWidth: 2, borderColor: colors.green, paddingVertical: 13, paddingHorizontal: 15 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#B9B4A6', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green },
  optionTitle: { fontSize: 15.5, fontFamily: fonts.sansBold, color: colors.text },
  optionSub: { fontSize: 13, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 2 },
  optionPrice: { fontSize: 14, fontFamily: fonts.heavy, color: colors.text },
  group: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.line },
  fRow: { paddingVertical: 10 },
  fRule: { borderBottomWidth: 1, borderColor: '#EFECE3' },
  fLabel: { fontSize: 12.5, fontFamily: fonts.sansBold, color: colors.muted },
  fInput: { paddingTop: 4, paddingBottom: 0, fontSize: 16, fontFamily: fonts.sansSemiBold, color: colors.text, outlineWidth: 0 } as object,
  fError: { fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: colors.danger, marginTop: 4 },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  sumThumb: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, overflow: 'hidden', padding: 2 },
  sumTitle: { flex: 1, fontSize: 15, fontFamily: fonts.sansBold, color: colors.text },
  sumBody: { paddingBottom: 12, gap: 6 },
  sumLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  sumText: { fontSize: 14, fontFamily: fonts.sans, color: '#4E554B', flexShrink: 1 },
  apply: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.green, justifyContent: 'center', marginBottom: 2 },
  applyText: { fontSize: 14, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#B9B4A6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  boxOn: { backgroundColor: colors.green, borderColor: colors.green },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 14, padding: 4 },
  termsText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.sans, color: '#4E554B' },
  linkPhone: { color: colors.green, fontFamily: fonts.sansBold, textDecorationLine: 'underline' },
  finePhone: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.sans, color: colors.muted, marginTop: 12, marginHorizontal: 4 },
  payLabel: { fontSize: 15, fontFamily: fonts.sans, color: '#4E554B' },
  payTotal: { fontSize: 26, fontFamily: fonts.heavy, color: colors.text, letterSpacing: -0.4 },
  payButton: { marginTop: 10, height: 58, borderRadius: 29, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  payOff: { backgroundColor: colors.line },
  payText: { fontSize: 17, fontFamily: fonts.sansBold, color: '#FFFFFF' },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10 },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.green, borderRadius: 20, padding: 16 },
  deliveryError: { borderColor: colors.danger },
  deliveryIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  deliveryTitle: { fontSize: 18, lineHeight: 23, fontFamily: fonts.display, color: colors.text },
  deliveryText: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2, fontFamily: fonts.sans },
  modify: { fontSize: 14, color: colors.green, fontFamily: fonts.sansBold, fontWeight: '700' },
  checkText: { fontSize: 14.5, color: colors.text, lineHeight: 21, fontFamily: fonts.sans },
  link: { color: colors.green, textDecorationLine: 'underline', fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
  fine: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  footerError: { color: colors.danger, fontSize: 14, textAlign: 'center', fontWeight: '500' },
  secure: { color: colors.muted, fontSize: 12.5, textAlign: 'center', fontFamily: fonts.sans },
  toggle: { minHeight: 44, justifyContent: 'center', marginTop: 10 },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.mint, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  appliedText: { flex: 1, fontSize: 14, color: colors.greenDark },
});
