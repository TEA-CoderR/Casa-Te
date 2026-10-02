import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { colors, fonts } from '@/config/theme';
import { Icon, type IconName } from './Icon';

const LINKS: Array<{ icon: IconName; label: string; href: Href }> = [
  { icon: 'grid', label: 'Categorie', href: '/catalog' },
  { icon: 'heart', label: 'Preferiti', href: '/favorites' },
  { icon: 'cart', label: 'Carrello', href: '/cart' },
  { icon: 'box', label: 'I miei ordini', href: '/orders' },
  { icon: 'user', label: 'Profilo', href: '/profile' },
];
const INFO: Array<{ label: string; doc: 'shipping' | 'terms' | 'privacy' }> = [
  { label: 'Spedizioni e ritiro', doc: 'shipping' },
  { label: 'Condizioni di vendita', doc: 'terms' },
  { label: 'Privacy', doc: 'privacy' },
];

/** Side menu opened from the home header (hamburger). */
export function MenuSheet({ visible, onClose, onStores }: { visible: boolean; onClose: () => void; onStores: () => void }) {
  const go = (href: Href) => { onClose(); router.push(href); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi menu" />
    <View style={styles.panel} accessibilityViewIsModal>
      <View style={styles.head}>
        <Text style={styles.logo}>Casa & Te</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi menu" style={styles.close}><Icon name="close" size={20} /></Pressable>
      </View>
      <ScrollView>
        {LINKS.map((l) => <Pressable key={l.label} onPress={() => go(l.href)} accessibilityRole="link" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
          <Icon name={l.icon} size={21} strokeWidth={1.4} /><Text style={styles.label}>{l.label}</Text>
        </Pressable>)}
        <Pressable onPress={() => { onClose(); onStores(); }} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
          <Icon name="store" size={21} strokeWidth={1.4} /><Text style={styles.label}>Negozi, indirizzi e orari</Text>
        </Pressable>
        <View style={styles.info}>
          {INFO.map((i) => <Pressable key={i.doc} onPress={() => go({ pathname: '/legal/[doc]', params: { doc: i.doc } })} accessibilityRole="link">
            <Text style={styles.infoText}>{i.label}</Text></Pressable>)}
        </View>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 24, 18, 0.4)' },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '82%', maxWidth: 340, backgroundColor: colors.background, paddingTop: 48, paddingHorizontal: 24 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  logo: { fontSize: 28, fontFamily: fonts.serif, color: colors.text },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 54, borderBottomWidth: 1, borderColor: colors.line },
  label: { fontSize: 18, fontFamily: fonts.serif, color: colors.text },
  info: { gap: 14, paddingVertical: 24 },
  infoText: { fontSize: 14, color: colors.muted, fontFamily: fonts.sans },
});
