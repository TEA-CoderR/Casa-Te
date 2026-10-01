import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StoreRow } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { useStores } from '@/lib/hooks';
import { usePreferences } from '@/store/preferences';
import { Icon } from './Icon';

export const storeShortName = (s: Pick<StoreRow, 'name'> | null | undefined) => s?.name.replace(/^CASA & TE\s*/, '') ?? '';

/**
 * Store picker. Stock, picking and pickup all depend on the chosen store, so the choice is made
 * in place (from the header, the home page or the product page) instead of buried in Profile.
 * Shows only what the store table actually contains: no invented addresses or hours.
 */
export function StoreSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { stores, selected } = useStores();
  const setStoreId = usePreferences((s) => s.setStoreId);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Chiudi" />
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.head}>
        <View style={{ flex: 1 }}><Text style={styles.title} accessibilityRole="header">Scegli il tuo negozio</Text>
          <Text style={styles.sub}>Vedi le disponibilità di quel negozio e ritiri lì gratis.</Text></View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi" style={styles.close}><Icon name="close" size={18} /></Pressable>
      </View>
      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
        {stores.map((s) => {
          const on = selected?.id === s.id;
          const place = [s.address, [s.postal_code, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          const showPlace = !!s.address || s.city.toLowerCase() !== storeShortName(s).toLowerCase();
          return <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ checked: on }}
            onPress={() => { setStoreId(s.id); onClose(); }} style={[styles.option, on && styles.optionOn]}>
            <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{storeShortName(s)}</Text>
              {showPlace && !!place && <Text style={styles.meta}>{place}</Text>}
              {!!s.opening_hours && <Text style={styles.meta}>Orari: {s.opening_hours}</Text>}
              <Text style={styles.meta}>{s.pickup_enabled ? 'Ritiro in negozio gratuito' : 'Solo spedizione'}</Text>
            </View>
          </Pressable>;
        })}
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 30, 20, 0.4)' },
  sheet: { position: 'absolute', left: 16, right: 16, bottom: 24, maxWidth: 480, alignSelf: 'center', marginHorizontal: 'auto',
    backgroundColor: colors.surface, borderRadius: 22, padding: 20, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30, shadowOffset: { width: 0, height: 12 } },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { fontSize: 23, fontFamily: fonts.serif, color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 19 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF1EA', alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: 'flex-start' },
  optionOn: { borderColor: colors.green, backgroundColor: '#F3F8EE' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.faint, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.green },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  name: { fontSize: 17, fontFamily: fonts.serif, color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 17 },
});
