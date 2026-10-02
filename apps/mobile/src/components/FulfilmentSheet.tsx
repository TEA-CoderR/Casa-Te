import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FULFILMENT_LABELS, type FulfilmentMethod, type Quote } from '@casa-te/shared';
import { formatShipping } from '@/lib/price';
import { colors, fonts } from '@/config/theme';
import { usePreferences } from '@/store/preferences';
import { Icon, type IconName } from './Icon';
import { OptionCard } from './UI';

const ICONS: Record<FulfilmentMethod, IconName> = { store: 'store', home: 'truck', pickup: 'pin' };

/** Choose how to receive the order; prices come from the server quote. */
export function FulfilmentSheet({ visible, onClose, quote, storeName, onChangeStore }: {
  visible: boolean; onClose: () => void; quote: Quote | null; storeName: string; onChangeStore: () => void;
}) {
  const fulfilment = usePreferences((s) => s.fulfilment);
  const setFulfilment = usePreferences((s) => s.setFulfilment);
  const methods: FulfilmentMethod[] = ['store', 'home', 'pickup'];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi" />
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Come vuoi ricevere l'ordine?</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi" style={styles.close}><Icon name="close" size={18} /></Pressable>
      </View>
      <View accessibilityRole="radiogroup">
        {methods.map((m) => {
          const option = quote?.shipping[m];
          const unavailable = quote ? !option : false;
          return <OptionCard key={m} selected={fulfilment === m} disabled={unavailable} icon={ICONS[m]}
            title={m === 'store' ? `${FULFILMENT_LABELS.store} a ${storeName}` : FULFILMENT_LABELS[m]}
            description={unavailable ? 'Non disponibile per questo ordine' : m === 'store' ? "Quando l'ordine è pronto" : m === 'home' ? 'Indirizzo al passo successivo' : 'Scegli il punto al passo successivo'}
            right={option ? formatShipping(option.price_cents) : undefined}
            onPress={() => { setFulfilment(m); onClose(); }} />;
        })}
      </View>
      <Pressable onPress={() => { onClose(); onChangeStore(); }} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
        <Text style={styles.link}>Cambia negozio ({storeName})</Text></Pressable>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 24, 18, 0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 560, width: '100%', alignSelf: 'center', marginHorizontal: 'auto',
    backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 22, fontFamily: fonts.serif, color: colors.text, flex: 1 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 14, color: colors.green, textDecorationLine: 'underline', fontFamily: fonts.sansMedium },
});
