import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Icon, type IconName } from '@/components/Icon';
import { PrimaryButton, EmptyState } from '@/components/UI';
import { StoreSelector } from '@/components/StoreSelector';
import { calculateShipping, type FulfilmentMethod, shippingLabel } from '@/config/shipping';
import { colors } from '@/config/theme';
import { getCartSnapshot, useCartStore } from '@/store/cart';
import { useOrdersStore } from '@/store/orders';
import { createDemoOrder } from '@/domain/checkout';
import { usePreferences } from '@/store/preferences';
import type { PaymentMethod } from '@/types/order';
import type { Order } from '@/types/order';
import { submitOrder } from '@/services/ordersApi';
const methods: Array<{ id: FulfilmentMethod; title: string; description: string; icon: IconName }> = [
  { id: 'home', title: 'Consegna a domicilio', description: "Direttamente a casa tua", icon: 'truck' },
  { id: 'pickup', title: 'Punto di ritiro / Locker', description: 'Ritira quando preferisci · Demo', icon: 'box' },
  { id: 'store', title: 'Ritiro in negozio', description: 'Il tuo negozio, nessun costo in più', icon: 'store' },
];
export default function CheckoutScreen() {
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const addOrder = useOrdersStore((s) => s.addOrder);
  const { subtotal, totalWeightKg, itemCount } = getCartSnapshot(items);
  const [method, setMethod] = useState<FulfilmentMethod>('home');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [cap, setCap] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('card-demo');
  const store = usePreferences((s) => s.store);
  const submitting = useRef(false);
  const pendingOrder = useRef<{ signature: string; order: Order } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shipping = calculateShipping({ subtotal, weightKg: totalWeightKg, method });
  const total = subtotal + shipping;
  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const cartItems = useCartStore.getState().items;
      const details = { method, payment, store, address: { name, address, city, cap } };
      const signature = JSON.stringify({ cartItems, details });
      if (pendingOrder.current?.signature !== signature) {
        pendingOrder.current = { signature, order: createDemoOrder(cartItems, details) };
      }
      const order = await submitOrder(pendingOrder.current.order);
      await addOrder(order);
      clear();
      pendingOrder.current = null;
      router.replace({ pathname: '/order-success', params: { id: order.id } });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Impossibile salvare. Riprova.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (!itemCount) return <Screen stack><EmptyState title="Il carrello è vuoto." message="Scegli qualcosa per la tua casa.">
    <PrimaryButton title="Vai al catalogo" onPress={() => router.replace('/catalog')} />
  </EmptyState></Screen>;
  return <Screen stack footer={<>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <View style={styles.footerRow}><View><Text style={styles.caption}>Totale ordine</Text>
      <Text style={styles.total}>€{total.toFixed(2).replace('.', ',')}</Text></View>
      <View style={{ flex: 1 }}><PrimaryButton title={busy ? 'Salvataggio…' : 'Conferma ordine demo'} icon="check" disabled={busy} onPress={confirm} /></View>
    </View>
  </>}>
    <Text style={styles.eyebrow}>UN ULTIMO PASSO</Text>
    <Text style={styles.heading}>Come vuoi riceverlo?</Text>
    <Text style={styles.intro}>Scegli la soluzione più comoda per te.</Text>
    {methods.map((item) => {
      const selected = method === item.id;
      return <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected}
        style={[styles.method, selected && styles.selected]} onPress={() => { setMethod(item.id); setError(''); }}>
        <View style={[styles.methodIcon, selected && { backgroundColor: '#E2ECD8' }]}><Icon name={item.icon} size={23} color={selected ? colors.green : colors.muted} /></View>
        <View style={{ flex: 1 }}><Text style={styles.methodTitle}>{item.title}</Text><Text style={styles.methodDescription}>{item.description}</Text>
          <Text style={styles.methodPrice}>{shippingLabel(calculateShipping({ subtotal, weightKg: totalWeightKg, method: item.id }))}</Text></View>
        <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
      </Pressable>;
    })}
    {method === 'store' && <StoreSelector />}
    {method === 'pickup' && <Text style={styles.note}>Punto di ritiro dimostrativo: nessun locker reale prenotato.</Text>}
    {method === 'home' && <View style={styles.section}>
      <Text style={styles.sectionTitle}>Il tuo indirizzo</Text>
      <Text style={styles.fieldLabel}>Nome e cognome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nome e cognome" autoComplete="name" />
      <Text style={styles.fieldLabel}>Indirizzo</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Indirizzo" autoComplete="street-address" />
      <View style={styles.row}><View style={{ flex: 0.7 }}><Text style={styles.fieldLabel}>CAP</Text>
        <TextInput style={styles.input} value={cap} onChangeText={setCap} placeholder="CAP" keyboardType="number-pad" maxLength={5} /></View>
        <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Città</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="Città" /></View></View>
    </View>}
    <View style={styles.section}><Text style={styles.sectionTitle}>Pagamento simulato</Text>
      <View style={styles.row}>{([{ id: 'card-demo', label: 'Carta demo', icon: 'card' }, { id: 'cash-demo', label: 'Contanti demo', icon: 'store' }] as const).map((option) =>
        <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: payment === option.id }} aria-checked={payment === option.id}
          style={[styles.payment, payment === option.id && styles.selected]} onPress={() => setPayment(option.id)}>
          <Icon name={option.icon} color={colors.green} size={24} /><Text style={styles.paymentText}>{option.label}</Text>
          {payment === option.id && <View style={styles.paymentCheck}><Icon name="check" size={12} color={colors.green} /></View>}
        </Pressable>)}</View>
      <Text style={styles.note}>Nessun addebito. Non inserire dati di pagamento reali.</Text>
    </View>
    <View style={styles.summary}><Text style={styles.sectionTitle}>Il tuo ordine · {itemCount} articoli</Text>
      <SummaryRow label="Subtotale" value={'€' + subtotal.toFixed(2).replace('.', ',')} />
      <SummaryRow label="Consegna" value={shippingLabel(shipping)} />
      <SummaryRow label="Peso totale" value={totalWeightKg.toFixed(1) + ' kg'} />
    </View>
    {totalWeightKg > 10 && <Text style={styles.note}>Oltre 10 kg: tariffa provvisoria demo.</Text>}
  </Screen>;
}
function SummaryRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryText}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  eyebrow: { fontSize: 9, letterSpacing: 1.7, color: colors.green, marginTop: 4 },
  heading: { fontSize: 26, fontWeight: '600', letterSpacing: -0.8, color: colors.text, marginTop: 9 },
  intro: { fontSize: 13, color: colors.muted, marginTop: 8, marginBottom: 21 },
  method: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: 17, marginBottom: 10 },
  selected: { borderColor: colors.green, backgroundColor: '#F0F4E9' },
  methodIcon: { width: 43, height: 43, borderRadius: 12, backgroundColor: '#F1F2ED', alignItems: 'center', justifyContent: 'center' },
  methodTitle: { fontWeight: '500', fontSize: 13, color: colors.text },
  methodDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  methodPrice: { fontWeight: '600', fontSize: 12, color: colors.green, marginTop: 7 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#C6CDBE', justifyContent: 'center', alignItems: 'center' },
  radioSelected: { borderColor: colors.green }, radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  section: { marginTop: 25 },
  sectionTitle: { fontWeight: '600', fontSize: 18, letterSpacing: -0.4, color: colors.text, marginBottom: 14 },
  fieldLabel: { fontSize: 11, color: colors.muted, marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingHorizontal: 14, minHeight: 49, fontSize: 14, color: colors.text },
  row: { flexDirection: 'row', gap: 12 },
  payment: { flex: 1, minHeight: 93, padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.surface, gap: 11 },
  paymentText: { fontSize: 12, color: colors.text },
  paymentCheck: { position: 'absolute', top: 12, right: 12 },
  note: { fontSize: 11, color: colors.muted, lineHeight: 18, marginTop: 12 },
  summary: { marginTop: 28, paddingTop: 24, borderTopWidth: 1, borderColor: colors.line },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  summaryText: { color: colors.muted, fontSize: 13 }, summaryValue: { color: colors.text, fontSize: 13, fontWeight: '500' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  caption: { fontSize: 10, color: colors.muted }, total: { fontSize: 23, fontWeight: '600', marginTop: 3, color: colors.text },
});

