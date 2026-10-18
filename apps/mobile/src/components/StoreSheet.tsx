import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StoreRow } from '@casa-te/shared';
import { colors, fonts } from '@/config/theme';
import { useStores } from '@/lib/hooks';
import { usePreferences } from '@/store/preferences';
import { Icon } from './Icon';
import { AwningMark } from './StoreCard';

export const storeShortName = (s: Pick<StoreRow, 'name'> | null | undefined) => s?.name.replace(/^CASA & TE\s*/, '') ?? '';
/** Italian "a" before a place, "ad" before a vowel: "a Lucca", "ad Arezzo". */
export const atPlace = (place: string) => `${/^[aeiouàèéìòù]/i.test(place) ? 'ad' : 'a'} ${place}`;

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
      <View style={styles.grip} />
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
            <AwningMark size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{storeShortName(s)}</Text>
              {showPlace && !!place && <Text style={styles.meta}>{place}</Text>}
              {!!s.opening_hours && <Text style={styles.meta}>Orari: {s.opening_hours}</Text>}
              <Text style={styles.meta}>{s.pickup_enabled ? 'Ritiro in negozio gratuito' : 'Solo spedizione'}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
          </Pressable>;
        })}
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16, 24, 18, 0.5)' },
  // A bottom sheet on phones (design F); centred and capped in width on the desktop shop.
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 520, alignSelf: 'center', marginHorizontal: 'auto',
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, paddingTop: 10, paddingBottom: 28, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30, shadowOffset: { width: 0, height: -8 } },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCD7CA' },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 4 },
  title: { fontSize: 26, lineHeight: 31, fontFamily: fonts.display, color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 4, lineHeight: 20, fontFamily: fonts.sans },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', gap: 14, padding: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  optionOn: { borderColor: colors.green, borderWidth: 2, backgroundColor: '#F1F6EE' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#B9B4A6', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.green },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green },
  name: { fontSize: 16.5, fontFamily: fonts.heavy, color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18, fontFamily: fonts.sans },
});
