import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { EmptyState, PrimaryButton } from '@/components/UI';
import { colors } from '@/config/theme';
import { useOrdersStore } from '@/store/orders';
export default function OrderSuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrdersStore((s) => s.orders.find((item) => item.id === id));
  if (!order) return <Screen stack><EmptyState icon="box" title="Ordine non trovato." message="Controlla la cronologia dei tuoi ordini.">
    <PrimaryButton title="Vai agli ordini" onPress={() => router.replace('/orders')} /></EmptyState></Screen>;
  return <Screen stack><View style={styles.center}>
    <View style={styles.outer}><View style={styles.circle}><Icon name="check" size={42} color={colors.green} /></View></View>
    <Text style={styles.eyebrow}>TUTTO PRONTO</Text>
    <Text style={styles.title}>Grazie, di cuore.</Text>
    <Text style={styles.text}>Il tuo ordine demo è confermato.{'\n'}Un piccolo passo verso una casa più tua.</Text>
    <View style={styles.receipt}><View style={styles.row}><Text style={styles.label}>Ordine</Text><Text style={styles.value}>{order.id}</Text></View>
      <View style={styles.row}><Text style={styles.label}>Articoli</Text><Text style={styles.value}>{order.itemCount}</Text></View>
      <View style={[styles.row, styles.totalRow]}><Text style={styles.label}>Totale demo</Text>
        <Text style={styles.total}>€{order.total.toFixed(2).replace('.', ',')}</Text></View>
      <Text style={styles.note}>Nessun pagamento è stato effettuato.</Text>
    </View>
    <View style={{ width: '100%' }}><PrimaryButton title="Vedi il mio ordine" onPress={() => router.replace('/orders')} /></View>
    <Pressable style={styles.home} onPress={() => router.replace('/')}><Text style={styles.homeText}>Torna alla home</Text></Pressable>
  </View></Screen>;
}
const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 32 },
  outer: { width: 116, height: 116, borderRadius: 58, backgroundColor: '#F0F3E9', justifyContent: 'center', alignItems: 'center' },
  circle: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#E1EDCF', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, letterSpacing: 2, color: colors.green, marginTop: 25 },
  title: { fontSize: 31, letterSpacing: -1, fontWeight: '600', marginTop: 11, color: colors.text },
  text: { fontSize: 13, color: colors.muted, lineHeight: 22, textAlign: 'center', marginTop: 12 },
  receipt: { width: '100%', marginVertical: 28, padding: 20, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 10 },
  label: { fontSize: 12, color: colors.muted }, value: { fontSize: 11, color: colors.text, fontWeight: '500' },
  totalRow: { borderTopWidth: 1, borderColor: colors.line, marginTop: 10, paddingTop: 18 },
  total: { fontSize: 23, fontWeight: '600', color: colors.green },
  note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 14 },
  home: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 30, marginTop: 7 },
  homeText: { color: colors.green, fontSize: 13 },
});

