import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { colors } from '@/config/theme';
import { StoreSelector } from '@/components/StoreSelector';
import { PageTitle } from '@/components/UI';
import { Icon, type IconName } from '@/components/Icon';
const rows: Array<{ title: string; icon: IconName; detail: string }> = [
  { title: 'Indirizzi', icon: 'pin', detail: 'Da inserire al checkout' },
  { title: 'Notifiche', icon: 'bell', detail: 'Disponibili in una prossima versione' },
  { title: 'Privacy e condizioni', icon: 'shield', detail: 'Demo locale · Nessun pagamento reale' },
  { title: 'Assistenza', icon: 'help', detail: 'Rivolgiti al tuo negozio' },
];
export default function ProfileScreen() {
  return <Screen><PageTitle title="Il tuo spazio" subtitle="Piacere di averti qui." />
    <View style={styles.welcome}><View style={styles.avatar}><Icon name="user" size={30} color={colors.green} /></View>
      <View style={{ flex: 1 }}><Text style={styles.hello}>Ciao, benvenuto.</Text><Text style={styles.welcomeText}>La tua casa, le tue preferenze.</Text></View></View>
    <View style={styles.storePanel}><View style={styles.storeHeading}><Icon name="store" color={colors.green} />
      <Text style={styles.sectionTitle}>Il tuo negozio CASA & TE</Text></View>
      <Text style={styles.description}>Scegli il punto vendita per il ritiro gratuito.</Text><StoreSelector /></View>
    <Text style={styles.smallTitle}>PREFERENZE E INFORMAZIONI</Text>
    {rows.map((row) => <View key={row.title} style={styles.row}><Icon name={row.icon} size={21} color={colors.green} />
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.rowDetail}>{row.detail}</Text></View>
    </View>)}
    <View style={styles.member}><Icon name="card" color={colors.green} size={25} /><View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>La tua carta, sempre con te.</Text>
      <Text style={styles.rowDetail}>L'integrazione della carta fedeltà arriverà in una fase successiva.</Text></View></View>
  </Screen>;
}
const styles = StyleSheet.create({
  welcome: { flexDirection: 'row', alignItems: 'center', gap: 17, paddingVertical: 13, marginBottom: 20 },
  avatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#E9EFDF', alignItems: 'center', justifyContent: 'center' },
  hello: { fontSize: 22, fontWeight: '500', letterSpacing: -0.5, color: colors.text },
  welcomeText: { color: colors.muted, fontSize: 12, marginTop: 7 },
  storePanel: { backgroundColor: '#EDF1E7', borderRadius: 20, padding: 18 },
  storeHeading: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.greenDark },
  description: { color: colors.muted, fontSize: 11, marginTop: 9, lineHeight: 18 },
  smallTitle: { fontSize: 10, letterSpacing: 1.4, color: colors.muted, marginTop: 30, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.line },
  rowTitle: { fontSize: 14, fontWeight: '500', color: colors.text },
  rowDetail: { fontSize: 11, color: colors.muted, lineHeight: 17, marginTop: 5 },
  member: { flexDirection: 'row', gap: 14, paddingTop: 26 },
});

